import Foundation
import Tauri
import CloudKit

private struct Options: Decodable {
  var sessionId: String?; var ownerId: String?; var workspaceId: String?; var subject: String?
  var digest: String?; var kind: String?; var path: String?; var size: UInt64?
  var json: String?; var revision: String?; var expected: CloudHead?
}
private struct Reply: Encodable {
  var error: String?; var subject: String?; var sessionId: String?; var head: CloudHead?; var exists: Bool?
  var json: String?; var written: UInt64?; var conflict: Bool?
}
final class CloudKitPlugin: Plugin {
  var configuration: () -> String? = { Bundle.main.object(forInfoDictionaryKey: "AnjianCloudKitContainer") as? String }
  var databaseFactory: (String, String, String) -> CloudDatabase = { AppleCloudDatabase(container: $0, owner: $1, workspace: $2) }
  private let lock = NSLock()
  private var sessions: [String: CloudReplica] = [:]
  @objc func account(_ invoke: Invoke) {
    guard let container=configuration(),container.hasPrefix("iCloud.") else {invoke.resolve(Reply(error:"cloud_not_configured"));return}
    let database=databaseFactory(container,"00000000-0000-0000-0000-000000000000","00000000-0000-0000-0000-000000000000")
    database.account {result in
      database.close()
      switch result {case .failure(let error):invoke.resolve(Reply(error:cloudError(error)));case .success(let subject):invoke.resolve(Reply(subject:subject))}
    }
  }
  // No CKContainer is created during plugin loading. Existing builds without
  // configured entitlements stay local and return an explicit unavailable code.
  @objc func sessionOpen(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self)
    guard let container = configuration(),
          container.hasPrefix("iCloud."), !container.isEmpty else { invoke.resolve(Reply(error: "cloud_not_configured")); return }
    guard let owner = args.ownerId, UUID(uuidString: owner) != nil,
          let workspace = args.workspaceId, UUID(uuidString: workspace) != nil,
          let subject = args.subject, !subject.isEmpty else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
    let replica = CloudReplica(database: databaseFactory(container, owner, workspace), subject: subject)
    replica.prepare { result in
      switch result {
      case .failure(let error): replica.database.close(); invoke.resolve(Reply(error: cloudError(error)))
      case .success:
        let id = UUID().uuidString; self.lock.lock(); self.sessions[id] = replica; self.lock.unlock()
        invoke.resolve(Reply(sessionId: id))
      }
    }
  }
  @objc func sessionClose(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self)
    lock.lock(); let replica = sessions.removeValue(forKey: args.sessionId ?? ""); lock.unlock()
    replica?.database.close(); invoke.resolve(Reply())
  }
  private func context(_ args: Options, _ invoke: Invoke) -> CloudReplica? {
    lock.lock(); let replica = sessions[args.sessionId ?? ""]; lock.unlock()
    if replica == nil { invoke.resolve(Reply(error: "cloud_session_expired")) }
    return replica
  }
  @objc func head(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self); guard let replica = context(args, invoke) else { return }
    replica.head { result in switch result { case .failure(let e): invoke.resolve(Reply(error: cloudError(e))); case .success(let head): invoke.resolve(Reply(head: head)) } }
  }
  @objc func publish(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self); guard let replica = context(args, invoke) else { return }
    replica.publish(args.revision ?? "", expected: args.expected) { result in switch result {
    case .failure(let error): invoke.resolve(Reply(error: cloudError(error)))
    case .success(let head): invoke.resolve(Reply(head: head, conflict: head == nil))
    } }
  }
  @objc func exists(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self); guard let replica = context(args, invoke) else { return }
    guard let digest = args.digest, validCloudDigest(digest), ["index", "chunk"].contains(args.kind ?? "") else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
    replica.fetch("\(args.kind!)_\(digest)", keys: ["sha"]) { result in switch result {
    case .failure(let error): invoke.resolve(Reply(error: cloudError(error)))
    case .success(let record): invoke.resolve(Reply(exists: record != nil))
    } }
  }
  @objc func putIndex(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self); guard let replica = context(args, invoke) else { return }
    guard let digest = args.digest, validCloudDigest(digest), let json = args.json, json.utf8.count <= 128*1024 else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
    let record = CKRecord(recordType: "AnjianSyncIndex", recordID: CKRecord.ID(recordName: "index_\(digest)", zoneID: replica.database.zoneID))
    record["sha"] = digest as CKRecordValue; record["json"] = json as CKRecordValue
    replica.create(record) { result in switch result { case .failure(let e): invoke.resolve(Reply(error: cloudError(e))); case .success: invoke.resolve(Reply()) } }
  }
  @objc func getIndex(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self); guard let replica = context(args, invoke) else { return }
    guard let digest = args.digest, validCloudDigest(digest) else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
    replica.fetch("index_\(digest)", keys: ["sha", "json"]) { result in switch result {
    case .failure(let error): invoke.resolve(Reply(error: cloudError(error)))
    case .success(let record):
      guard let json = record?.record["json"] as? String, json.utf8.count <= 128*1024 else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
      invoke.resolve(Reply(json: json))
    } }
  }
  @objc func putChunk(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self); guard let replica = context(args, invoke) else { return }
    guard let digest = args.digest, validCloudDigest(digest), let path = args.path, let size = args.size,
          size <= 16*1024*1024 else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
    DispatchQueue.global(qos: .utility).async {
      do {
        let source = URL(fileURLWithPath: path)
        let actual = try source.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard actual.isRegularFile == true, actual.fileSize.map({ UInt64($0) }) == size else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
        let record = CKRecord(recordType: "AnjianSyncChunk", recordID: CKRecord.ID(recordName: "chunk_\(digest)", zoneID: replica.database.zoneID))
        record["sha"] = digest as CKRecordValue; record["data"] = CKAsset(fileURL: source)
        replica.create(record) { result in switch result { case .failure(let e): invoke.resolve(Reply(error: cloudError(e))); case .success: invoke.resolve(Reply(written: size)) } }
      } catch { invoke.resolve(Reply(error: "cloud_file_failed")) }
    }
  }
  @objc func getChunk(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(Options.self); guard let replica = context(args, invoke) else { return }
    guard let digest = args.digest, validCloudDigest(digest), let path = args.path else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
    replica.fetch("chunk_\(digest)", keys: ["data", "sha"]) { result in switch result {
    case .failure(let error): invoke.resolve(Reply(error: cloudError(error)))
    case .success(let record):
      guard let asset = record?.record["data"] as? CKAsset, let source = asset.fileURL else { invoke.resolve(Reply(error: "sync_data_invalid")); return }
      DispatchQueue.global(qos: .utility).async {
        guard !FileManager.default.fileExists(atPath: path) else { invoke.resolve(Reply(error: "cloud_file_failed")); return }
        do { try FileManager.default.copyItem(at: source, to: URL(fileURLWithPath: path)); invoke.resolve(Reply()) }
        catch { invoke.resolve(Reply(error: "cloud_file_failed")) }
      }
    } }
  }
  deinit { sessions.values.forEach { $0.database.close() } }
}
@_cdecl("init_plugin_hm_cloudkit")
func initCloudKitPlugin() -> Plugin { CloudKitPlugin() }
