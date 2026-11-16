import Foundation
import Tauri
import UIKit

private struct SpeechOptions: Decodable { let id: String?; let path: String?; let language: String? }
final class SpeechPlugin: Plugin {
  private let controller = SpeechController()
  private var observer: NSObjectProtocol?
  override init() {
    super.init()
    observer = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification,
                                                     object: nil, queue: .main) { [weak self] _ in self?.controller.interrupt() }
  }
  deinit { if let observer = observer { NotificationCenter.default.removeObserver(observer) } }
  @objc func support(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(SpeechOptions.self)
    DispatchQueue.main.async { invoke.resolve(["support": self.controller.support(options.language ?? "zh-CN")]) }
  }
  @objc func start(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(SpeechOptions.self)
    DispatchQueue.main.async {
      guard let id = options.id, UUID(uuidString: id) != nil, let path = options.path,
            let language = options.language else { invoke.resolve(["error": "speech_job_invalid"]); return }
      do { invoke.resolve(["snapshot": try self.controller.start(id: id, url: URL(fileURLWithPath: path), language: language)]) }
      catch { invoke.resolve(["error": (error as NSError).domain]) }
    }
  }
  @objc func status(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(SpeechOptions.self)
    DispatchQueue.main.async {
      guard let id = options.id, let snapshot = self.controller.snapshot(id: id) else { invoke.resolve(["error": "speech_job_missing"]); return }
      invoke.resolve(["snapshot": snapshot])
    }
  }
  @objc func cancel(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(SpeechOptions.self)
    DispatchQueue.main.async {
      guard let id = options.id, let snapshot = self.controller.cancel(id: id) else { invoke.resolve(["error": "speech_job_missing"]); return }
      invoke.resolve(["snapshot": snapshot])
    }
  }
  @objc func discard(_ invoke: Invoke) throws {
    let options = try invoke.parseArgs(SpeechOptions.self)
    DispatchQueue.main.async { if let id = options.id { self.controller.discard(id: id) }; invoke.resolve([:]) }
  }
}
@_cdecl("init_plugin_hm_speech")
func initSpeechPlugin() -> Plugin { SpeechPlugin() }
