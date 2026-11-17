import Foundation
import Tauri
import UIKit

private struct AgendaOptions: Decodable {
  var message: AgendaNotification?;var ids: [String]?;var event: AgendaCopy?;var target: String?;var external: String?;var eventId: String?
}
private struct AgendaReply: Encodable {
  var error: String?;var notificationSupport: AgendaNotificationSupport?;var calendarSupport: AgendaCalendarSupport?
  var authorization: String?;var records: [AgendaNotificationRecord]?;var targets: [AgendaTarget]?;var externalId: String?
}
final class AgendaPlugin: Plugin {
  // Lazy factories keep plugin loading independent of permission and user data.
  var notificationFactory: () -> AgendaNotificationCenter = {AppleAgendaNotifications()}
  var calendarFactory: () -> AgendaCalendarStore = {AppleAgendaCalendar()}
  private lazy var notifications = notificationFactory()
  private lazy var calendar = calendarFactory()
  private let calendarQueue = DispatchQueue(label: "com.limushu.hm.agenda.calendar")
  @objc func notificationSupport(_ invoke: Invoke) {
    notifications.authorization {invoke.resolve(AgendaReply(notificationSupport: AgendaNotificationSupport(authorization: $0)))}
  }
  @objc func requestNotifications(_ invoke: Invoke) {
    notifications.request {result in switch result {
      case .success(let authorization): invoke.resolve(AgendaReply(authorization: authorization))
      case .failure(let error): invoke.resolve(AgendaReply(error: agendaError(error)))
    }}
  }
  @objc func pending(_ invoke: Invoke) {notifications.pending {invoke.resolve(AgendaReply(records: $0))}}
  @objc func delivered(_ invoke: Invoke) {notifications.delivered {invoke.resolve(AgendaReply(records: $0))}}
  @objc func schedule(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(AgendaOptions.self)
    guard let message = args.message else {invoke.resolve(AgendaReply(error: "notification_plan_invalid"));return}
    do {try agendaValidateNotification(message)} catch {invoke.resolve(AgendaReply(error: agendaError(error)));return}
    notifications.schedule(message) {result in switch result {
      case .success: invoke.resolve(AgendaReply())
      case .failure(let error): invoke.resolve(AgendaReply(error: agendaError(error)))
    }}
  }
  private func ids(_ invoke: Invoke) throws -> [String]? {
    let args = try invoke.parseArgs(AgendaOptions.self)
    guard let ids = args.ids, ids.count <= 4096, ids.allSatisfy(agendaOwnsNotification) else {invoke.resolve(AgendaReply(error: "notification_plan_invalid"));return nil}
    return ids
  }
  @objc func cancel(_ invoke: Invoke) throws {guard let selected = try ids(invoke) else {return};notifications.cancel(selected);invoke.resolve(AgendaReply())}
  @objc func removeDelivered(_ invoke: Invoke) throws {guard let selected = try ids(invoke) else {return};notifications.removeDelivered(selected);invoke.resolve(AgendaReply())}
  @objc func notificationSettings(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard UIApplication.shared.applicationState == .active, let url = URL(string: UIApplication.openSettingsURLString) else {invoke.resolve(AgendaReply(error: "agenda_requires_foreground"));return}
      UIApplication.shared.open(url, options: [:]) {opened in invoke.resolve(AgendaReply(error: opened ? nil : "agenda_operation_failed"))}
    }
  }
  @objc func calendarSupport(_ invoke: Invoke) {calendarQueue.async {invoke.resolve(AgendaReply(calendarSupport: AgendaCalendarSupport(authorization: self.calendar.authorization())))}}
  @objc func requestCalendar(_ invoke: Invoke) {
    calendarQueue.async {self.calendar.request {result in switch result {
      case .success(let authorization): invoke.resolve(AgendaReply(authorization: authorization))
      case .failure(let error): invoke.resolve(AgendaReply(error: agendaError(error)))
    }}}
  }
  @objc func calendarTargets(_ invoke: Invoke) {
    calendarQueue.async {do {invoke.resolve(AgendaReply(targets: try self.calendar.targets()))} catch {invoke.resolve(AgendaReply(error: agendaError(error)))}}
  }
  @objc func calendarUpsert(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(AgendaOptions.self)
    guard let event = args.event, let target = args.target else {invoke.resolve(AgendaReply(error: "calendar_state_invalid"));return}
    calendarQueue.async {do {invoke.resolve(AgendaReply(externalId: try self.calendar.upsert(event, target: target, external: args.external)))} catch {invoke.resolve(AgendaReply(error: agendaError(error)))}}
  }
  @objc func calendarRemove(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(AgendaOptions.self)
    guard let event = args.eventId, let external = args.external else {invoke.resolve(AgendaReply(error: "calendar_state_invalid"));return}
    calendarQueue.async {do {try self.calendar.remove(event, external: external);invoke.resolve(AgendaReply())} catch {invoke.resolve(AgendaReply(error: agendaError(error)))}}
  }
}
@_cdecl("init_plugin_hm_agenda")
func initAgendaPlugin() -> Plugin {AgendaPlugin()}
