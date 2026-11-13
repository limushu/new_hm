import Foundation
import Tauri
import UIKit
import WebKit
import XCTest

final class DocumentsTests: XCTestCase {
  @MainActor
  private func call(_ plugin: DocumentsPlugin, command: String = "pick", args: [String: Any]) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation { continuation in
      let data = String(data: try! JSONSerialization.data(withJSONObject: args), encoding: .utf8)!
      let invoke = Invoke(command: command, callback: 1, error: 2, sendResponse: { id, json in
        if id == 2 { continuation.resume(throwing: NSError(domain: json ?? "invoke_failed", code: 1)); return }
        let response = (json?.data(using: .utf8)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        continuation.resume(returning: response)
      }, sendChannelData: { _, _ in }, data: data)
      do {
        if command == "pick" { try plugin.pick(invoke) }
        else { try plugin.exportFile(invoke) }
      } catch { continuation.resume(throwing: error) }
    }
  }

  private func directory() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  @MainActor
  private func host() throws -> UIViewController {
    try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }.first { $0.isKeyWindow }?.rootViewController)
  }

  @MainActor
  private func presentedPicker() async throws -> UIDocumentPickerViewController {
    for _ in 0..<100 {
      if let picker = try host().presentedViewController as? UIDocumentPickerViewController,
         !picker.isBeingPresented { return picker }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
    throw NSError(domain: "document_picker_not_presented", code: 1)
  }

  @MainActor
  private func dismiss(_ picker: UIDocumentPickerViewController) async {
    await withCheckedContinuation { continuation in
      picker.dismiss(animated: false) { continuation.resume() }
    }
  }

  func testCoordinatedCopiesPreserveNamesBytesAndPartialFailures() throws {
    let source = try directory(), staging = try directory()
    defer { try? FileManager.default.removeItem(at: source); try? FileManager.default.removeItem(at: staging) }
    let first = source.appendingPathComponent("证据.txt")
    let second = source.appendingPathComponent("另一个文件.txt")
    try Data("provider bytes".utf8).write(to: first)
    try Data("other bytes".utf8).write(to: second)
    let results = stageDocuments([first, source, source.appendingPathComponent("missing.txt"), second], into: staging)
    XCTAssertEqual(results.count, 4)
    XCTAssertEqual(results[0]["name"], "证据.txt")
    XCTAssertEqual(results[1]["error"], "document_not_file")
    XCTAssertNotNil(results[2]["error"])
    let file = try XCTUnwrap(results[0]["file"])
    XCTAssertNotEqual(file, results[3]["file"])
    try FileManager.default.removeItem(at: first)
    XCTAssertEqual(try Data(contentsOf: staging.appendingPathComponent(file)), Data("provider bytes".utf8))
    XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: staging.path).count, 2)
  }

  @MainActor
  func testSystemPickerCancelAndBusyRequestsLeaveNoCopies() async throws {
    let staging = try directory()
    defer { try? FileManager.default.removeItem(at: staging) }
    let plugin = DocumentsPlugin()
    let args: [String: Any] = ["title": "Documents", "multiple": true, "directory": staging.path]
    let pending = Task { try await call(plugin, args: args) }
    let picker = try await presentedPicker()
    XCTAssertTrue(picker.allowsMultipleSelection)
    let busy = try await call(plugin, args: args)
    XCTAssertEqual(busy["error"] as? String, "document_picker_busy")
    plugin.documentPickerWasCancelled(picker)
    let cancelled = try await pending.value
    XCTAssertEqual(cancelled["cancelled"] as? Bool, true)
    await dismiss(picker)
    XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: staging.path).count, 0)
  }

  @MainActor
  func testSelectionCallbackCopiesFileThroughNativeInvoke() async throws {
    let source = try directory(), staging = try directory()
    defer { try? FileManager.default.removeItem(at: source); try? FileManager.default.removeItem(at: staging) }
    let file = source.appendingPathComponent("合同.pdf")
    try Data("test PDF bytes".utf8).write(to: file)
    let plugin = DocumentsPlugin()
    plugin.load(webview: try XCTUnwrap(try host().view as? WKWebView))
    let pending = Task { try await call(plugin, args: ["title": "Documents", "multiple": false, "directory": staging.path]) }
    let picker = try await presentedPicker()
    XCTAssertFalse(picker.allowsMultipleSelection)
    // Simulate the provider callback. Real iCloud account/download UI remains
    // a physical-device check; staging uses the production implementation.
    plugin.documentPicker(picker, didPickDocumentsAt: [file])
    let response = try await pending.value
    await dismiss(picker)
    let document = try XCTUnwrap((response["documents"] as? [[String: String]])?.first)
    XCTAssertEqual(document["name"], "合同.pdf")
    XCTAssertNil(document["error"])
    XCTAssertEqual(try Data(contentsOf: staging.appendingPathComponent(try XCTUnwrap(document["file"]))), Data("test PDF bytes".utf8))
    XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
  }

  @MainActor
  func testExportCancellationAndCompletionKeepSourceIntact() async throws {
    let source = try directory()
    defer { try? FileManager.default.removeItem(at: source) }
    let file = source.appendingPathComponent("export.txt")
    try Data("export bytes".utf8).write(to: file)
    let plugin = DocumentsPlugin()
    let args: [String: Any] = ["title": "Export", "path": file.path]
    for cancel in [true, false] {
      let pending = Task { try await call(plugin, command: "exportFile", args: args) }
      let picker = try await presentedPicker()
      if cancel { plugin.documentPickerWasCancelled(picker) }
      else { plugin.documentPicker(picker, didPickDocumentsAt: [file]) }
      let result = try await pending.value
      await dismiss(picker)
      XCTAssertEqual(result["cancelled"] as? Bool, cancel)
      XCTAssertEqual(try Data(contentsOf: file), Data("export bytes".utf8))
    }
  }
}
