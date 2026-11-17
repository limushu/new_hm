import CloudKit
import CryptoKit
import Tauri
import XCTest

private final class MemoryCloudDatabase: CloudDatabase {
  let zoneID = CKRecordZone.ID(zoneName: "isolated-tests", ownerName: CKCurrentUserDefaultName)
  var subject = "private-cloud-user"
  var records: [String: CloudEnvelope] = [:]
  var version = 0
  var prepareCalls = 0
  var writes = 0
  var closed = false
  var race = false
  func account(_ done: @escaping CloudResult<String>) {
    if closed { done(.failure(CloudFailure.code("cloud_session_expired"))) } else { done(.success(subject)) }
  }
  func prepare(_ done: @escaping CloudResult<Void>) { prepareCalls += 1; done(.success(())) }
  func fetch(_ name: String, keys: [String]?, done: @escaping CloudResult<CloudEnvelope?>) {
    let value = records[name].map { CloudEnvelope(record: $0.record.copy() as! CKRecord, version: $0.version) }
    done(.success(value))
  }
  func save(_ record: CKRecord, version expected: String?, done: @escaping CloudResult<CloudEnvelope?>) {
    if race { race = false; done(.success(nil)); return }
    guard records[record.recordID.recordName]?.version == expected else { done(.success(nil)); return }
    version += 1; writes += 1
    let saved = CloudEnvelope(record: record.copy() as! CKRecord, version: String(version))
    records[record.recordID.recordName] = saved; done(.success(saved))
  }
  func close() { closed = true }
}
final class CloudKitTests: XCTestCase {
  private let owner = "00000000-0000-0000-0000-000000000001"
  private let workspace = "00000000-0000-0000-0000-000000000002"
  private func call(_ plugin: CloudKitPlugin, _ command: String, _ args: [String: Any]) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation { continuation in
      let data = String(data: try! JSONSerialization.data(withJSONObject: args), encoding: .utf8)!
      let invoke = Invoke(command: command, callback: 1, error: 2, sendResponse: { id, json in
        if id == 2 { continuation.resume(throwing: CloudFailure.code("invoke_failed")); return }
        let response = (json?.data(using: .utf8)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        continuation.resume(returning: response)
      }, sendChannelData: { _, _ in }, data: data)
      do {
        switch command {
        case "support": plugin.support(invoke)
        case "sessionOpen": try plugin.sessionOpen(invoke)
        case "sessionClose": try plugin.sessionClose(invoke)
        case "head": try plugin.head(invoke)
        case "publish": try plugin.publish(invoke)
        case "putIndex": try plugin.putIndex(invoke)
        case "getIndex": try plugin.getIndex(invoke)
        case "putChunk": try plugin.putChunk(invoke)
        case "getChunk": try plugin.getChunk(invoke)
        default: throw CloudFailure.code("invalid_test_command")
        }
      } catch { continuation.resume(throwing: error) }
    }
  }
  private func open(_ plugin: CloudKitPlugin) async throws -> String {
    let response = try await call(plugin, "sessionOpen", ["ownerId": owner, "workspaceId": workspace, "subject": "private-cloud-user"])
    return try XCTUnwrap(response["sessionId"] as? String)
  }
  func testUnconfiguredPluginNeverCreatesACloudContainer() async throws {
    let plugin = CloudKitPlugin(); plugin.configuration = { nil }
    plugin.databaseFactory = { _, _, _ in XCTFail("No SDK access without signed configuration"); return MemoryCloudDatabase() }
    let response = try await call(plugin, "sessionOpen", ["ownerId": owner, "workspaceId": workspace, "subject": "private-cloud-user"])
    XCTAssertEqual(response["error"] as? String, "cloud_not_configured")
    let support = try await call(plugin, "support", [:])
    XCTAssertEqual(support["configured"] as? Bool, false)
  }
  func testConfiguredSupportDoesNotCreateACloudContainerOrAccessTheAccount() async throws {
    let plugin = CloudKitPlugin(); plugin.configuration = { "iCloud.test.anjian" }
    plugin.databaseFactory = { _, _, _ in XCTFail("Support query must be local"); return MemoryCloudDatabase() }
    let support = try await call(plugin, "support", [:])
    XCTAssertEqual(support["configured"] as? Bool, true)
  }
  func testChangedCloudAccountCannotCreateAZoneOrWriteAnything() async throws {
    let plugin = CloudKitPlugin(), database = MemoryCloudDatabase(); database.subject = "different-user"
    plugin.configuration = { "iCloud.test.anjian" }; plugin.databaseFactory = { _, _, _ in database }
    let response = try await call(plugin, "sessionOpen", ["ownerId": owner, "workspaceId": workspace, "subject": "private-cloud-user"])
    XCTAssertEqual(response["error"] as? String, "sync_account_changed"); XCTAssertEqual(database.prepareCalls, 0); XCTAssertEqual(database.writes, 0)
  }
  func testHeadUpdatesAreConditionalAndClosingInvalidatesTheSession() async throws {
    let plugin = CloudKitPlugin(), database = MemoryCloudDatabase()
    plugin.configuration = { "iCloud.test.anjian" }; plugin.databaseFactory = { _, _, _ in database }
    let session = try await open(plugin), first = String(repeating: "a", count: 64), second = String(repeating: "b", count: 64)
    let created = try await call(plugin, "publish", ["sessionId": session, "revision": first])
    let original = try XCTUnwrap(created["head"] as? [String: String])
    let changed = try await call(plugin, "publish", ["sessionId": session, "revision": second, "expected": original])
    XCTAssertEqual((changed["head"] as? [String: String])?["revision"], second)
    let stale = try await call(plugin, "publish", ["sessionId": session, "revision": first, "expected": original])
    XCTAssertEqual(stale["conflict"] as? Bool, true); XCTAssertEqual(database.writes, 2)
    _ = try await call(plugin, "sessionClose", ["sessionId": session])
    let expired = try await call(plugin, "head", ["sessionId": session])
    XCTAssertEqual(expired["error"] as? String, "cloud_session_expired"); XCTAssertTrue(database.closed)
  }
  func testNativeIndexAndAssetRoundTripPreservesSourceAndRejectsInvalidNames() async throws {
    let plugin = CloudKitPlugin(), database = MemoryCloudDatabase()
    plugin.configuration = { "iCloud.test.anjian" }; plugin.databaseFactory = { _, _, _ in database }
    let session = try await open(plugin)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let bytes = Data("fictional audio chunk".utf8), source = directory.appendingPathComponent("source")
    try bytes.write(to: source)
    let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    let uploaded = try await call(plugin, "putChunk", ["sessionId": session, "digest": hash, "path": source.path, "size": bytes.count])
    XCTAssertEqual(uploaded["written"] as? Int, bytes.count)
    let destination = directory.appendingPathComponent("received")
    let downloaded = try await call(plugin, "getChunk", ["sessionId": session, "digest": hash, "path": destination.path])
    XCTAssertNil(downloaded["error"]); XCTAssertEqual(try Data(contentsOf: destination), bytes); XCTAssertEqual(try Data(contentsOf: source), bytes)
    let again = try await call(plugin, "getChunk", ["sessionId": session, "digest": hash, "path": destination.path])
    XCTAssertEqual(again["error"] as? String,"cloud_file_failed");XCTAssertEqual(try Data(contentsOf: destination),bytes)
    let json = "{\"format\":1,\"digest\":\"\(hash)\",\"size\":\(bytes.count),\"parts\":[\"\(hash)\"]}"
    _ = try await call(plugin, "putIndex", ["sessionId": session, "digest": hash, "json": json])
    let index = try await call(plugin, "getIndex", ["sessionId": session, "digest": hash])
    XCTAssertEqual(index["json"] as? String, json)
    let invalid = try await call(plugin, "putIndex", ["sessionId": session, "digest": "../../escape", "json": json])
    XCTAssertEqual(invalid["error"] as? String, "sync_data_invalid")
  }
}
