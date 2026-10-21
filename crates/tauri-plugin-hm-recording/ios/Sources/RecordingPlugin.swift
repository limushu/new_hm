import AVFoundation
import Foundation
import Tauri
import UIKit
import WebKit

private struct StartOptions: Decodable { let path: String }

/// All AVAudioSession/recorder state is confined to the main queue. Captures are
/// deliberately foreground-only: lock, background and calls pause capture.
final class RecordingPlugin: Plugin, AVAudioRecorderDelegate {
  private var recorder: AVAudioRecorder?
  private var captureState = "idle"
  private var finished = false
  private var authorizing = false
  private var observers: [NSObjectProtocol] = []
  private weak var webview: WKWebView?
  // Internal injection points also let the native tests reproduce authorization
  // transitions without displaying a permission dialog to the CI runner.
  var requestPermission: (@escaping (Bool) -> Void) -> Void = {
    AVAudioSession.sharedInstance().requestRecordPermission($0)
  }
  lazy var foreground = CaptureForeground { [weak self] in self?.visibility() ?? .background }

  override func load(webview: WKWebView) { self.webview = webview }

  private func visibility() -> CaptureVisibility {
    let application: CaptureVisibility
    switch UIApplication.shared.applicationState {
    case .active: application = .active
    case .inactive: application = .inactive
    default: application = .background
    }
    let scene = webview?.window?.windowScene ?? UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }.first { $0.windows.contains(where: { $0.isKeyWindow }) }
    let sceneState: CaptureVisibility?
    switch scene?.activationState {
    case .foregroundActive?: sceneState = .active
    case .foregroundInactive?: sceneState = .inactive
    case .background?, .unattached?: sceneState = .background
    default: sceneState = nil
    }
    return captureVisibility(scene: sceneState, application: application)
  }

  override init() {
    super.init()
    let center = NotificationCenter.default
    for name in [AVAudioSession.interruptionNotification,
                 AVAudioSession.mediaServicesWereResetNotification,
                 UIApplication.didEnterBackgroundNotification] {
      observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        guard let self = self, self.recorder != nil else { return }
        self.recorder?.pause()
        self.captureState = "paused"
        self.deactivate()
      })
    }
  }

  deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }

  private func deactivate() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func begin(_ invoke: Invoke, path: String, granted: Bool) {
    guard granted else {
      authorizing = false
      invoke.resolve(["error": "microphone_permission_denied"])
      return
    }
    foreground.whenActive { active in
      self.authorizing = false
      guard active else { invoke.resolve(["error": "recording_requires_foreground"]); return }
      self.capture(invoke, path: path)
    }
  }

  private func capture(_ invoke: Invoke, path: String) {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
      try session.setActive(true)
      let value = try AVAudioRecorder(url: URL(fileURLWithPath: path), settings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 44100,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 96000,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
      ])
      value.delegate = self
      guard value.prepareToRecord(), value.record() else {
        deactivate()
        invoke.resolve(["error": "recording_failed"])
        return
      }
      recorder = value
      finished = false
      captureState = "recording"
      invoke.resolve(["state": captureState])
    } catch {
      deactivate()
      invoke.resolve(["error": "recording_failed"])
    }
  }

  @objc func start(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(StartOptions.self)
    DispatchQueue.main.async {
      guard self.recorder == nil, !self.authorizing else {
        invoke.resolve(["error": "recording_pending"])
        return
      }
      self.authorizing = true
      self.requestPermission { granted in
        DispatchQueue.main.async { self.begin(invoke, path: options.path, granted: granted) }
      }
    }
  }

  @objc func pause(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard self.recorder != nil else { invoke.resolve(["error": "recording_not_started"]); return }
      self.recorder?.pause()
      self.captureState = "paused"
      self.deactivate()
      invoke.resolve(["state": self.captureState])
    }
  }

  @objc func resume(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard let recorder = self.recorder else { invoke.resolve(["error": "recording_not_started"]); return }
      self.foreground.whenActive { active in
        guard active else { invoke.resolve(["error": "recording_requires_foreground"]); return }
      do {
        try AVAudioSession.sharedInstance().setActive(true)
        guard recorder.record() else {
          self.deactivate()
          invoke.resolve(["error": "recording_cannot_resume"]); return
        }
        self.captureState = "recording"
        invoke.resolve(["state": self.captureState])
      } catch { invoke.resolve(["error": "recording_cannot_resume"]) }
      }
    }
  }

  @objc func status(_ invoke: Invoke) {
    DispatchQueue.main.async {
      if self.captureState == "recording", self.recorder?.isRecording != true {
        self.captureState = "paused"
      }
      invoke.resolve(["state": self.captureState])
    }
  }

  @objc func finish(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard self.recorder != nil || self.finished else {
        invoke.resolve(["error": "recording_not_started"]); return
      }
      self.recorder?.stop()
      self.recorder = nil
      self.finished = true
      self.captureState = "finished"
      self.deactivate()
      invoke.resolve(["state": self.captureState])
    }
  }

  @objc func cancel(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.recorder?.stop()
      self.recorder = nil
      self.finished = false
      self.captureState = "idle"
      self.deactivate()
      invoke.resolve(["state": self.captureState])
    }
  }

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    captureState = "paused"
    recorder.pause()
    deactivate()
  }
}

@_cdecl("init_plugin_hm_recording")
func initPlugin() -> Plugin { RecordingPlugin() }
