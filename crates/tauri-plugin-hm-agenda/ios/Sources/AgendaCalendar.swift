import Foundation
import EventKit
import UIKit

final class AppleAgendaCalendar: AgendaCalendarStore {
  private let store: EKEventStore
  init(store: EKEventStore = EKEventStore()) {self.store = store}
  func authorization() -> String {
    let state = EKEventStore.authorizationStatus(for: .event)
    if #available(iOS 17.0, *) {
      if state == .fullAccess {return "granted"}
    } else if state == .authorized {return "granted"}
    if state == .notDetermined {return "not-determined"}
    if state == .denied {return "denied"}
    return "restricted"
  }
  func request(_ done: @escaping (Result<String, Error>) -> Void) {
    DispatchQueue.main.async {
      guard UIApplication.shared.applicationState == .active else {done(.failure(AgendaFailure.code("agenda_requires_foreground")));return}
      let completion: (Bool, Error?) -> Void = {_, error in
        if let error = error {done(.failure(error))} else {done(.success(self.authorization()))}
      }
      if #available(iOS 17.0, *) {self.store.requestFullAccessToEvents(completion: completion)}
      else {self.store.requestAccess(to: .event, completion: completion)}
    }
  }
  private func requireAccess() throws {if authorization() != "granted" {throw AgendaFailure.code("calendar_permission_denied")}}
  func targets() throws -> [AgendaTarget] {
    try requireAccess()
    return store.calendars(for: .event).filter {$0.allowsContentModifications}.map {AgendaTarget(id: $0.calendarIdentifier, title: $0.title)}
  }
  func upsert(_ copy: AgendaCopy, target: String, external: String?) throws -> String {
    try requireAccess()
    guard let calendar = store.calendar(withIdentifier: target), calendar.allowsContentModifications else {throw AgendaFailure.code("calendar_target_missing")}
    let origin = try agendaCalendarOrigin(copy.eventId);let start = try copy.start.date();let end = try copy.end.date()
    guard end > start, copy.title.count <= 200, copy.notes.count <= 20000, copy.location.count <= 500 else {throw AgendaFailure.code("calendar_state_invalid")}
    let event: EKEvent
    if let external = external {
      guard let existing = store.event(withIdentifier: external) else {throw AgendaFailure.code("calendar_copy_missing")}
      try agendaRequireCalendarOwnership(copy.eventId, actual: existing.url)
      guard existing.calendar?.calendarIdentifier == target else {throw AgendaFailure.code("calendar_copy_moved")}
      event = existing
    } else {
      // Best-effort deduplication inside the explicitly selected calendar only.
      let predicate = store.predicateForEvents(withStart: start.addingTimeInterval(-172800), end: end.addingTimeInterval(172800), calendars: [calendar])
      let matches = store.events(matching: predicate).filter {$0.url == origin}
      guard matches.count <= 1 else {throw AgendaFailure.code("calendar_duplicate_copies")}
      event = matches.first ?? EKEvent(eventStore: store)
      if matches.isEmpty {event.alarms = []} // App notifications own the reminder policy.
    }
    event.calendar = calendar;event.url = origin;event.title = copy.title;event.location = copy.location;event.notes = copy.notes
    event.isAllDay = copy.allDay;event.timeZone = nil;event.startDate = start;event.endDate = end
    try store.save(event, span: .thisEvent, commit: true)
    guard let id = event.eventIdentifier else {throw AgendaFailure.code("calendar_state_invalid")}
    return id
  }
  func remove(_ eventId: String, external: String) throws {
    try requireAccess()
    guard let event = store.event(withIdentifier: external) else {return}
    try agendaRequireCalendarOwnership(eventId, actual: event.url)
    try store.remove(event, span: .thisEvent, commit: true)
  }
}
