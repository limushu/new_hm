import Foundation
import CloudKit

func validCloudDigest(_ value: String) -> Bool {
  value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
}

final class CloudReplica {
  let database: CloudDatabase
  let subject: String
  init(database: CloudDatabase, subject: String) { self.database = database; self.subject = subject }
  private func authorize(_ done: @escaping CloudResult<Void>) {
    database.account { result in
      done(result.flatMap { $0 == self.subject ? .success(()) : .failure(CloudFailure.code("sync_account_changed")) })
    }
  }
  func prepare(_ done: @escaping CloudResult<Void>) {
    authorize { result in switch result { case .failure(let e): done(.failure(e)); case .success: self.database.prepare(done) } }
  }
  func head(_ done: @escaping CloudResult<CloudHead?>) {
    authorize { result in
      if case .failure(let error) = result { done(.failure(error)); return }
      self.database.fetch("head", keys: ["revision"]) { result in done(result.flatMap { envelope in
        guard let envelope = envelope else { return .success(nil) }
        guard let revision = envelope.record["revision"] as? String, validCloudDigest(revision) else { return .failure(CloudFailure.code("sync_data_invalid")) }
        return .success(CloudHead(revision: revision, version: envelope.version))
      }) }
    }
  }
  func publish(_ revision: String, expected: CloudHead?, done: @escaping CloudResult<CloudHead?>) {
    guard validCloudDigest(revision) else { done(.failure(CloudFailure.code("sync_data_invalid"))); return }
    authorize { result in
      if case .failure(let error) = result { done(.failure(error)); return }
      self.database.fetch("head", keys: nil) { result in
        switch result {
        case .failure(let error): done(.failure(error))
        case .success(let existing):
          if let expected = expected {
            guard existing?.version == expected.version, existing?.record["revision"] as? String == expected.revision else { done(.success(nil)); return }
          } else if existing != nil { done(.success(nil)); return }
          let record = existing?.record ?? CKRecord(recordType: "AnjianSyncHead", recordID: CKRecord.ID(recordName: "head", zoneID: self.database.zoneID))
          record["revision"] = revision as CKRecordValue
          self.database.save(record, version: expected?.version) { result in done(result.map { $0.map { CloudHead(revision: revision, version: $0.version) } }) }
        }
      }
    }
  }
  func fetch(_ name: String, keys: [String]?, done: @escaping CloudResult<CloudEnvelope?>) {
    authorize { result in
      if case .failure(let error) = result { done(.failure(error)); return }
      self.database.fetch(name, keys: keys, done: done)
    }
  }
  func create(_ record: CKRecord, done: @escaping CloudResult<Void>) {
    authorize { result in
      if case .failure(let error) = result { done(.failure(error)); return }
      self.database.save(record, version: nil) { result in
        switch result {
        case .failure(let error): done(.failure(error))
        case .success(let saved):
          if saved != nil { done(.success(())); return }
          // Another device may have already stored this same immutable hash.
          self.database.fetch(record.recordID.recordName, keys: ["sha"]) { fetched in
            done(fetched.flatMap { $0?.record["sha"] as? String == record["sha"] as? String ? .success(()) : .failure(CloudFailure.code("sync_data_invalid")) })
          }
        }
      }
    }
  }
}
