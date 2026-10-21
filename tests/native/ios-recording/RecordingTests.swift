import AVFoundation
import Tauri
import UIKit
import WebKit
import XCTest

final class RecordingTests: XCTestCase {
  @MainActor
  private func call(_ plugin: RecordingPlugin, _ command: String, path: String = "") async throws -> [String: String] {
    try await withCheckedThrowingContinuation { continuation in
      let data = String(data: try! JSONSerialization.data(withJSONObject: ["path": path]), encoding: .utf8)!
      let invoke = Invoke(command: command, callback: 1, error: 2, sendResponse: { id, json in
        if id == 2 { continuation.resume(throwing: NSError(domain: json ?? "invoke_failed", code: 1)); return }
        let response = (json?.data(using: .utf8)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] } ?? [:]
        continuation.resume(returning: response)
      }, sendChannelData: { _, _ in }, data: data)
      do {
        switch command {
        case "start": try plugin.start(invoke)
        case "pause": plugin.pause(invoke)
        case "resume": plugin.resume(invoke)
        case "finish": plugin.finish(invoke)
        case "cancel": plugin.cancel(invoke)
        default: plugin.status(invoke)
        }
      } catch { continuation.resume(throwing: error) }
    }
  }

  private func audioURL() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
  }

  @MainActor
  func testRealSceneAndAudioSessionCapturePlayableM4A() async throws {
    XCTAssertEqual(AVAudioSession.sharedInstance().recordPermission, .granted)
    let plugin = RecordingPlugin()
    let webview = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }.first { $0.isKeyWindow }?.rootViewController?.view as? WKWebView
    XCTAssertNotNil(webview)
    plugin.load(webview: try XCTUnwrap(webview))
    let url = audioURL()
    defer { try? FileManager.default.removeItem(at: url) }
    let started = try await call(plugin, "start", path: url.path)
    XCTAssertEqual(started["state"], "recording", "\(started)")
    try await Task.sleep(nanoseconds: 500_000_000)
    let paused = try await call(plugin, "pause")
    XCTAssertEqual(paused["state"], "paused")
    let resumed = try await call(plugin, "resume")
    XCTAssertEqual(resumed["state"], "recording", "\(resumed)")
    try await Task.sleep(nanoseconds: 500_000_000)
    let finished = try await call(plugin, "finish")
    XCTAssertEqual(finished["state"], "finished")
    let audio = try AVAudioFile(forReading: url)
    XCTAssertGreaterThan(audio.length, 0)
    XCTAssertEqual(audio.fileFormat.channelCount, 1)
  }

  @MainActor
  func testSceneActiveOverridesStaleApplicationBackground() async throws {
    let plugin = RecordingPlugin()
    plugin.foreground = CaptureForeground { captureVisibility(scene: .active, application: .background) }
    plugin.requestPermission = { $0(true) }
    let url = audioURL()
    defer { try? FileManager.default.removeItem(at: url) }
    let response = try await call(plugin, "start", path: url.path)
    XCTAssertEqual(response["state"], "recording", "\(response)")
    _ = try await call(plugin, "cancel")
  }

  @MainActor
  func testAuthorizationFinishesBeforeSceneReactivation() async throws {
    let plugin = RecordingPlugin()
    var scene = CaptureVisibility.inactive
    plugin.foreground = CaptureForeground(timeout: 1) { scene }
    plugin.requestPermission = { completion in
      completion(true)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { scene = .active }
    }
    let url = audioURL()
    defer { try? FileManager.default.removeItem(at: url) }
    let response = try await call(plugin, "start", path: url.path)
    XCTAssertEqual(response["state"], "recording", "\(response)")
    _ = try await call(plugin, "cancel")
  }

  @MainActor
  func testDeniedPermissionDoesNotCreateCapture() async throws {
    let plugin = RecordingPlugin()
    plugin.requestPermission = { $0(false) }
    let url = audioURL()
    let response = try await call(plugin, "start", path: url.path)
    XCTAssertEqual(response["error"], "microphone_permission_denied")
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
  }

  @MainActor
  func testBackgroundSceneRejectsDespiteActiveApplication() async throws {
    let plugin = RecordingPlugin()
    var scene = CaptureVisibility.background
    plugin.foreground = CaptureForeground { captureVisibility(scene: scene, application: .active) }
    plugin.requestPermission = { $0(true) }
    let url = audioURL()
    let response = try await call(plugin, "start", path: url.path)
    XCTAssertEqual(response["error"], "recording_requires_foreground")
    scene = .active
    try await Task.sleep(nanoseconds: 200_000_000)
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    let status = try await call(plugin, "status")
    XCTAssertEqual(status["state"], "idle")
  }

  @MainActor
  func testInactiveTimeoutDoesNotStartLaterAndCanRetry() async throws {
    let plugin = RecordingPlugin()
    var scene = CaptureVisibility.inactive
    plugin.foreground = CaptureForeground(timeout: 0.15) { scene }
    plugin.requestPermission = { $0(true) }
    let url = audioURL()
    defer { try? FileManager.default.removeItem(at: url) }
    let failed = try await call(plugin, "start", path: url.path)
    XCTAssertEqual(failed["error"], "recording_requires_foreground")
    scene = .active
    try await Task.sleep(nanoseconds: 100_000_000)
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    let started = try await call(plugin, "start", path: url.path)
    XCTAssertEqual(started["state"], "recording", "\(started)")
    _ = try await call(plugin, "cancel")
  }
}
