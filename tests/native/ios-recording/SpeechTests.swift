import AVFoundation
import Speech
import XCTest

private final class FakeSpeechTask: SpeechTask {
  var onCancel: () -> Void
  init(_ action: @escaping () -> Void) { onCancel = action }
  func cancel() { onCancel() }
}
private final class FakeSpeechEngine: SpeechEngine {
  var onDevice = true
  var granted: Bool? = true
  var permission: ((Bool) -> Void)?
  var authorizeCalls = 0
  var cancelCalls = 0
  var callbacks: [(SpeechUpdate?, String?) -> Void] = []
  var automatic = true
  var formats: [AVAudioFormat] = []
  func support(_ language: String) -> [String: Any] {
    ["installed": true, "onDevice": onDevice, "available": true, "authorization": "notDetermined"]
  }
  func authorize(_ completion: @escaping (Bool) -> Void) {
    authorizeCalls += 1
    if let granted = granted { completion(granted) } else { permission = completion }
  }
  func recognize(_ audio: AVAudioPCMBuffer, language: String,
                 update: @escaping (SpeechUpdate?, String?) -> Void) -> SpeechTask {
    callbacks.append(update); formats.append(audio.format)
    if automatic { update(SpeechUpdate(text: "虚构转写第\(callbacks.count)段", final: true), nil) }
    return FakeSpeechTask { [weak self] in self?.cancelCalls += 1 }
  }
}
final class SpeechTests: XCTestCase {
  private func audio(_ seconds: Double = 1.2) throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
    let format = try XCTUnwrap(AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 44100, channels: 2, interleaved: false))
    let file = try AVAudioFile(forWriting: url, settings: format.settings)
    let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(seconds * 44100)))
    buffer.frameLength = buffer.frameCapacity
    for channel in 0..<2 { memset(buffer.floatChannelData![channel], 0, Int(buffer.frameLength) * MemoryLayout<Float>.size) }
    try file.write(from: buffer)
    return url
  }
  @MainActor
  private func until(_ condition: () -> Bool) async throws {
    for _ in 0..<150 { if condition() { return }; try await Task.sleep(nanoseconds: 20_000_000) }
    XCTFail("Speech job did not reach the expected state")
  }
  func testAppleRequestsRequireOnDeviceRecognition() {
    let request = AppleSpeechEngine.request()
    XCTAssertTrue(request.requiresOnDeviceRecognition)
    XCTAssertTrue(request.shouldReportPartialResults)
  }
  func testAudioIsChunkedAndConvertedWithoutChangingOriginalBytes() throws {
    let url = try audio(); defer { try? FileManager.default.removeItem(at: url) }
    let original = try Data(contentsOf: url)
    let input = try SpeechAudioFile(url)
    let first = try XCTUnwrap(input.next(seconds: 0.5))
    XCTAssertEqual(first.start, 0, accuracy: 0.0001)
    XCTAssertEqual(first.end, 0.5, accuracy: 0.0001)
    XCTAssertEqual(first.audio.format.sampleRate, 16000)
    XCTAssertEqual(first.audio.format.channelCount, 1)
    XCTAssertEqual(Double(first.audio.frameLength), 8000, accuracy: 20)
    _ = try input.next(seconds: 0.5)
    let last = try XCTUnwrap(input.next(seconds: 0.5))
    XCTAssertEqual(last.start, 1, accuracy: 0.0001)
    XCTAssertEqual(last.end, 1.2, accuracy: 0.0001)
    XCTAssertNil(try input.next())
    XCTAssertEqual(try Data(contentsOf: url), original)
  }
  @MainActor
  func testSequentialChunksKeepProgressAndSourceTimestamps() async throws {
    let url = try audio(); defer { try? FileManager.default.removeItem(at: url) }
    let engine = FakeSpeechEngine(); let controller = SpeechController()
    controller.engine = engine; controller.chunkSeconds = 0.5
    let id = UUID().uuidString
    _ = try controller.start(id: id, url: url, language: "zh-CN")
    try await until { controller.snapshot(id: id)?["phase"] as? String == "completed" }
    let result = try XCTUnwrap(controller.snapshot(id: id))
    let rows = try XCTUnwrap(result["segments"] as? [[String: Any]])
    XCTAssertEqual(rows.count, 3)
    XCTAssertEqual(rows[1]["startSeconds"] as? Double, 0.5)
    XCTAssertEqual(result["completedSeconds"] as? Double, 1.2)
    XCTAssertTrue(engine.formats.allSatisfy { $0.sampleRate == 16000 && $0.channelCount == 1 })
    controller.discard(id: id)
  }
  @MainActor
  func testUnsupportedModelsFailBeforeAuthorizationOrRecognition() throws {
    let url = try audio(); defer { try? FileManager.default.removeItem(at: url) }
    let engine = FakeSpeechEngine(); engine.onDevice = false
    let controller = SpeechController(); controller.engine = engine
    XCTAssertThrowsError(try controller.start(id: UUID().uuidString, url: url, language: "zh-CN")) { error in
      XCTAssertEqual((error as NSError).domain, "speech_on_device_unavailable")
    }
    XCTAssertEqual(engine.authorizeCalls, 0); XCTAssertEqual(engine.callbacks.count, 0)
  }
  @MainActor
  func testDeniedPermissionDoesNotStartRecognition() async throws {
    let url = try audio(); defer { try? FileManager.default.removeItem(at: url) }
    let engine = FakeSpeechEngine(); engine.granted = false
    let controller = SpeechController(); controller.engine = engine
    let id = UUID().uuidString
    _ = try controller.start(id: id, url: url, language: "zh-CN")
    try await until { controller.snapshot(id: id)?["phase"] as? String == "failed" }
    XCTAssertEqual(controller.snapshot(id: id)?["error"] as? String, "speech_permission_denied")
    XCTAssertEqual(engine.callbacks.count, 0)
  }
  @MainActor
  func testCancelDuringAuthorizationIgnoresLatePermission() async throws {
    let url = try audio(); defer { try? FileManager.default.removeItem(at: url) }
    let engine = FakeSpeechEngine(); engine.granted = nil
    let controller = SpeechController(); controller.engine = engine
    let id = UUID().uuidString
    _ = try controller.start(id: id, url: url, language: "zh-CN")
    _ = controller.cancel(id: id)
    engine.permission?(true)
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(controller.snapshot(id: id)?["phase"] as? String, "canceled")
    XCTAssertEqual(engine.callbacks.count, 0)
  }
  @MainActor
  func testPartialResultSurvivesInterruptionAndOldCallbacksCannotModifyNewJob() async throws {
    let url = try audio(); defer { try? FileManager.default.removeItem(at: url) }
    let engine = FakeSpeechEngine(); engine.automatic = false
    let controller = SpeechController(); controller.engine = engine
    let old = UUID().uuidString
    _ = try controller.start(id: old, url: url, language: "zh-CN")
    try await until { engine.callbacks.count == 1 }
    engine.callbacks[0](SpeechUpdate(text: "已识别部分", final: false), nil)
    try await until { controller.snapshot(id: old)?["partial"] != nil }
    controller.interrupt()
    XCTAssertEqual(controller.snapshot(id: old)?["error"] as? String, "speech_interrupted")
    XCTAssertEqual((controller.snapshot(id: old)?["partial"] as? [String: Any])?["text"] as? String, "已识别部分")
    controller.discard(id: old)
    let new = UUID().uuidString
    _ = try controller.start(id: new, url: url, language: "zh-CN")
    try await until { engine.callbacks.count == 2 }
    engine.callbacks[0](SpeechUpdate(text: "过期结果", final: true), nil)
    controller.discard(id: old)
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(controller.snapshot(id: new)?["phase"] as? String, "transcribing")
    XCTAssertEqual((controller.snapshot(id: new)?["segments"] as? [[String: Any]])?.count, 0)
    controller.discard(id: new)
  }
  @MainActor
  func testTimeoutTerminatesTheRecognitionTask() async throws {
    let url = try audio(); defer { try? FileManager.default.removeItem(at: url) }
    let engine = FakeSpeechEngine(); engine.automatic = false
    let controller = SpeechController(); controller.engine = engine; controller.chunkTimeout = 0.03
    let id = UUID().uuidString
    _ = try controller.start(id: id, url: url, language: "zh-CN")
    try await until { controller.snapshot(id: id)?["phase"] as? String == "failed" }
    XCTAssertEqual(controller.snapshot(id: id)?["error"] as? String, "speech_timed_out")
    XCTAssertGreaterThan(engine.cancelCalls, 0)
  }
}
