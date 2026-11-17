import Foundation
import CloudKit

struct CloudHead: Codable, Equatable { let revision: String; let version: String }
struct CloudEnvelope { let record: CKRecord; let version: String }
enum CloudFailure: Error { case code(String) }
typealias CloudResult<T> = (Result<T, Error>) -> Void

protocol CloudDatabase: AnyObject {
  func account(_ done: @escaping CloudResult<String>)
  func prepare(_ done: @escaping CloudResult<Void>)
  func fetch(_ name: String, keys: [String]?, done: @escaping CloudResult<CloudEnvelope?>)
  /// nil is create-only; a version is an atomic update of exactly that server record.
  func save(_ record: CKRecord, version: String?, done: @escaping CloudResult<CloudEnvelope?>)
  func close()
  var zoneID: CKRecordZone.ID { get }
}

func cloudError(_ error: Error) -> String {
  if let failure = error as? CloudFailure, case .code(let code) = failure { return code }
  let ck = error as? CKError
  switch ck?.code {
  case .notAuthenticated: return "cloud_signin_required"
  case .networkFailure, .networkUnavailable: return "cloud_offline"
  case .quotaExceeded: return "cloud_quota_exceeded"
  case .permissionFailure: return "cloud_permission_denied"
  case .serverRejectedRequest: return "cloud_schema_missing"
  default: return "cloud_operation_failed"
  }
}

final class AppleCloudDatabase: CloudDatabase {
  let zoneID: CKRecordZone.ID
  private let container: CKContainer
  private let database: CKDatabase
  private let lock = NSLock()
  private var invalidated = false
  private var operations: [CKOperation] = []
  private var observer: NSObjectProtocol?

  init(container name: String, owner: String, workspace: String) {
    container = CKContainer(identifier: name)
    database = container.privateCloudDatabase
    zoneID = CKRecordZone.ID(zoneName: "anjian_\(owner)_\(workspace)", ownerName: CKCurrentUserDefaultName)
    observer = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: nil) { [weak self] _ in self?.close() }
  }
  deinit { close(); if let observer = observer { NotificationCenter.default.removeObserver(observer) } }
  private func active() -> Bool { lock.lock(); defer { lock.unlock() }; return !invalidated }
  func close() {
    lock.lock(); invalidated = true; let pending = operations; operations = []; lock.unlock()
    pending.forEach { $0.cancel() }
  }
  private func add(_ operation: CKDatabaseOperation) {
    operation.configuration.timeoutIntervalForRequest = 45
    operation.configuration.timeoutIntervalForResource = 90
    lock.lock(); let cancelled = invalidated; if !cancelled { operations.append(operation) }; lock.unlock()
    operation.completionBlock = { [weak self, weak operation] in
      guard let self = self, let operation = operation else { return }
      self.lock.lock(); self.operations.removeAll { $0 === operation }; self.lock.unlock()
    }
    if cancelled { operation.cancel() }
    database.add(operation)
  }
  private func itemError(_ error: Error?, name: String) -> CKError? {
    guard let error = error as? CKError else { return nil }
    if error.code != .partialFailure { return error }
    return (error.userInfo[CKPartialErrorsByItemIDKey] as? [CKRecord.ID: Error])?[CKRecord.ID(recordName: name, zoneID: zoneID)] as? CKError ?? error
  }
  func account(_ done: @escaping CloudResult<String>) {
    guard active() else { done(.failure(CloudFailure.code("sync_account_changed"))); return }
    container.accountStatus { [weak self] status, error in
      guard let self = self, self.active() else { done(.failure(CloudFailure.code("sync_account_changed"))); return }
      if let error = error { done(.failure(error)); return }
      guard status == .available else { done(.failure(CloudFailure.code("cloud_signin_required"))); return }
      self.container.fetchUserRecordID { [weak self] record, error in
        guard let self = self, self.active() else { done(.failure(CloudFailure.code("sync_account_changed"))); return }
        if let error = error { done(.failure(error)) }
        else if let record = record { done(.success(record.recordName)) }
        else { done(.failure(CloudFailure.code("cloud_signin_required"))) }
      }
    }
  }
  func prepare(_ done: @escaping CloudResult<Void>) {
    let operation = CKModifyRecordZonesOperation(recordZonesToSave: [CKRecordZone(zoneID: zoneID)], recordZoneIDsToDelete: nil)
    operation.modifyRecordZonesCompletionBlock = { [weak self] _, _, error in
      guard let self = self, self.active() else { done(.failure(CloudFailure.code("sync_account_changed"))); return }
      if let error = error { done(.failure(error)) } else { done(.success(())) }
    }
    add(operation)
  }
  func fetch(_ name: String, keys: [String]?, done: @escaping CloudResult<CloudEnvelope?>) {
    let id = CKRecord.ID(recordName: name, zoneID: zoneID)
    let operation = CKFetchRecordsOperation(recordIDs: [id]); operation.desiredKeys = keys
    operation.fetchRecordsCompletionBlock = { [weak self] records, error in
      guard let self = self, self.active() else { done(.failure(CloudFailure.code("sync_account_changed"))); return }
      if let error = error, self.itemError(error, name: name)?.code != .unknownItem { done(.failure(error)); return }
      if let record = records?[id], let version = record.recordChangeTag { done(.success(CloudEnvelope(record: record, version: version))) }
      else { done(.success(nil)) }
    }
    add(operation)
  }
  func save(_ record: CKRecord, version: String?, done: @escaping CloudResult<CloudEnvelope?>) {
    guard record.recordChangeTag == version else { done(.success(nil)); return }
    let operation = CKModifyRecordsOperation(recordsToSave: [record], recordIDsToDelete: nil)
    operation.savePolicy = .ifServerRecordUnchanged
    operation.isAtomic = true
    operation.modifyRecordsCompletionBlock = { [weak self] records, _, error in
      guard let self = self, self.active() else { done(.failure(CloudFailure.code("sync_account_changed"))); return }
      if let error = error {
        if self.itemError(error, name: record.recordID.recordName)?.code == .serverRecordChanged { done(.success(nil)) }
        else { done(.failure(error)) }
        return
      }
      if let saved = records?.first, let version = saved.recordChangeTag { done(.success(CloudEnvelope(record: saved, version: version))) }
      else { done(.failure(CloudFailure.code("cloud_operation_failed"))) }
    }
    add(operation)
  }
}
