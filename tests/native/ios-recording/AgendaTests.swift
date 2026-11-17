import Foundation
import Tauri
import XCTest

private final class MemoryAgendaNotifications: AgendaNotificationCenter {
  var permission = "not-determined";var requests = 0;var puts = 0;var canceled: [String] = []
  func authorization(_ done: @escaping (String) -> Void) {done(permission)}
  func request(_ done: @escaping (Result<String, Error>) -> Void) {requests += 1;permission = "granted";done(.success(permission))}
  func pending(_ done: @escaping ([AgendaNotificationRecord]) -> Void) {done([])}
  func delivered(_ done: @escaping ([AgendaNotificationRecord]) -> Void) {done([])}
  func schedule(_ message: AgendaNotification, done: @escaping (Result<Void, Error>) -> Void) {puts += 1;done(.success(()))}
  func cancel(_ ids: [String]) {canceled += ids}
  func removeDelivered(_ ids: [String]) {}
}
private final class MemoryAgendaCalendar: AgendaCalendarStore {
  var requests = 0;var permission = "not-determined";var writes = 0;var reads = 0
  func authorization() -> String {permission}
  func request(_ done: @escaping (Result<String, Error>) -> Void) {requests += 1;permission = "granted";done(.success(permission))}
  func targets() throws -> [AgendaTarget] {reads += 1;return [AgendaTarget(id: "isolated-calendar", title: "虚构日历")]}
  func upsert(_ event: AgendaCopy, target: String, external: String?) throws -> String {writes += 1;return external ?? "isolated-event"}
  func remove(_ eventId: String, external: String) throws {}
}
final class AgendaTests: XCTestCase {
  private let event = "00000000-0000-0000-0000-000000000001"
  private func call(_ plugin: AgendaPlugin, _ command: String, _ args: [String: Any] = [:]) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation {continuation in
      let data = String(data: try! JSONSerialization.data(withJSONObject: args), encoding: .utf8)!
      let invoke = Invoke(command: command, callback: 1, error: 2, sendResponse: {id, json in
        if id == 2 {continuation.resume(throwing: AgendaFailure.code("invoke_failed"));return}
        let response = (json?.data(using: .utf8)).flatMap {try? JSONSerialization.jsonObject(with: $0) as? [String: Any]} ?? [:]
        continuation.resume(returning: response)
      }, sendChannelData: {_, _ in}, data: data)
      do {switch command {
        case "notificationSupport": plugin.notificationSupport(invoke)
        case "requestNotifications": plugin.requestNotifications(invoke)
        case "schedule": try plugin.schedule(invoke)
        case "cancel": try plugin.cancel(invoke)
        case "calendarSupport": plugin.calendarSupport(invoke)
        case "requestCalendar": plugin.requestCalendar(invoke)
        case "calendarTargets": plugin.calendarTargets(invoke)
        case "calendarUpsert": try plugin.calendarUpsert(invoke)
        default: throw AgendaFailure.code("invalid_test_command")
      }} catch {continuation.resume(throwing: error)}
    }
  }
  func testCapabilityQueriesNeverPromptOrReadPersonalCalendarData() async throws {
    let plugin = AgendaPlugin(), notifications = MemoryAgendaNotifications(), calendar = MemoryAgendaCalendar()
    plugin.notificationFactory = {notifications};plugin.calendarFactory = {calendar}
    let support = try await call(plugin, "notificationSupport")
    XCTAssertEqual((support["notificationSupport"] as? [String: Any])?["authorization"] as? String, "not-determined")
    _ = try await call(plugin, "calendarSupport")
    XCTAssertEqual(notifications.requests, 0);XCTAssertEqual(calendar.requests, 0);XCTAssertEqual(calendar.writes, 0);XCTAssertEqual(calendar.reads, 0)
    _ = try await call(plugin, "requestNotifications");_ = try await call(plugin, "requestCalendar")
    XCTAssertEqual(notifications.requests, 1);XCTAssertEqual(calendar.requests, 1)
  }
  func testCancelCannotRemoveAnUnrelatedSubsystemNotification() async throws {
    let plugin = AgendaPlugin(), notifications = MemoryAgendaNotifications();plugin.notificationFactory = {notifications}
    let invalid = try await call(plugin, "cancel", ["ids": ["another-subsystem"]])
    XCTAssertEqual(invalid["error"] as? String, "notification_plan_invalid");XCTAssertTrue(notifications.canceled.isEmpty)
    _ = try await call(plugin, "cancel", ["ids": ["anjian.reminder.\(event)"]])
    XCTAssertEqual(notifications.canceled, ["anjian.reminder.\(event)"])
  }
  func testNotificationPlanValidationRejectsWrongIdentityAndInvalidLocalDates() throws {
    let good = AgendaNotification(id: "anjian.reminder.\(event)", revision: String(repeating: "a", count: 64), eventId: event, scheduleKey: "fixture", title: "虚构日程", body: "10:00", when: AgendaTime(year: 2030, month: 11, day: 17, hour: 10, minute: 0))
    XCTAssertNoThrow(try agendaValidateNotification(good))
    let invalid = AgendaNotification(id: "other", revision: good.revision, eventId: event, scheduleKey: "fixture", title: good.title, body: good.body, when: good.when)
    XCTAssertThrowsError(try agendaValidateNotification(invalid))
    XCTAssertThrowsError(try AgendaTime(year: 2030, month: 2, day: 31, hour: 10, minute: 0).date())
  }
  func testCalendarOwnershipChecksProtectOtherEventsAndMalformedOrigins() throws {
    let origin = try agendaCalendarOrigin(event)
    XCTAssertNoThrow(try agendaRequireCalendarOwnership(event, actual: origin))
    XCTAssertThrowsError(try agendaRequireCalendarOwnership(event, actual: URL(string: "https://example.invalid/personal")))
    XCTAssertThrowsError(try agendaCalendarOrigin("../outside"))
  }
}
