import Foundation
struct AgendaTime: Codable {
  let year: Int; let month: Int; let day: Int; let hour: Int; let minute: Int
  func date() throws -> Date {
    let calendar = Calendar(identifier: .gregorian)
    let components = DateComponents(calendar: calendar, timeZone: .current, year: year, month: month, day: day, hour: hour, minute: minute)
    guard let value = calendar.date(from: components) else { throw AgendaFailure.code("calendar_time_invalid") }
    let checked = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: value)
    guard checked.year == year, checked.month == month, checked.day == day, checked.hour == hour, checked.minute == minute else { throw AgendaFailure.code("calendar_time_invalid") }
    return value
  }
  var components: DateComponents { DateComponents(calendar: Calendar(identifier: .gregorian), year: year, month: month, day: day, hour: hour, minute: minute) }
}
struct AgendaNotification: Codable {
  let id: String; let revision: String; let eventId: String; let scheduleKey: String
  let title: String; let body: String; let when: AgendaTime
}
struct AgendaNotificationRecord: Codable {let id: String; let revision: String}
struct AgendaNotificationSupport: Encodable {let installed = true; let authorization: String; let mode = "scheduled"; let pendingLimit = 64}
struct AgendaCalendarSupport: Encodable {let installed = true; let authorization: String}
struct AgendaTarget: Codable {let id: String; let title: String}
struct AgendaCopy: Codable {
  let eventId: String; let title: String; let start: AgendaTime; let end: AgendaTime
  let allDay: Bool; let location: String; let notes: String
}
enum AgendaFailure: Error {case code(String)}
func agendaError(_ error: Error) -> String {
  if let error = error as? AgendaFailure, case .code(let code) = error {return code}
  return "agenda_operation_failed"
}
func agendaOwnsNotification(_ id: String) -> Bool {
  let prefix = "anjian.reminder."
  return id.hasPrefix(prefix) && UUID(uuidString: String(id.dropFirst(prefix.count))) != nil
}
protocol AgendaNotificationCenter {
  func authorization(_ done: @escaping (String) -> Void)
  func request(_ done: @escaping (Result<String, Error>) -> Void)
  func pending(_ done: @escaping ([AgendaNotificationRecord]) -> Void)
  func delivered(_ done: @escaping ([AgendaNotificationRecord]) -> Void)
  func schedule(_ message: AgendaNotification, done: @escaping (Result<Void, Error>) -> Void)
  func cancel(_ ids: [String])
  func removeDelivered(_ ids: [String])
}
protocol AgendaCalendarStore {
  func authorization() -> String
  func request(_ done: @escaping (Result<String, Error>) -> Void)
  func targets() throws -> [AgendaTarget]
  func upsert(_ event: AgendaCopy, target: String, external: String?) throws -> String
  func remove(_ eventId: String, external: String) throws
}

func agendaValidateNotification(_ message: AgendaNotification) throws {
  guard agendaOwnsNotification(message.id), message.id == "anjian.reminder.\(message.eventId)", message.revision.count == 64,
        message.revision.allSatisfy({$0.isHexDigit}), message.title.count <= 200 else {throw AgendaFailure.code("notification_plan_invalid")}
  _ = try message.when.date()
}
func agendaCalendarOrigin(_ event: String) throws -> URL {
  guard UUID(uuidString: event) != nil, let url = URL(string: "anjian://calendar/event/\(event)") else {throw AgendaFailure.code("calendar_state_invalid")}
  return url
}
func agendaRequireCalendarOwnership(_ event: String, actual: URL?) throws {
  guard actual == (try agendaCalendarOrigin(event)) else {throw AgendaFailure.code("calendar_copy_not_owned")}
}
