import Foundation
import UserNotifications
import UIKit

final class AppleAgendaNotifications: NSObject, AgendaNotificationCenter, UNUserNotificationCenterDelegate {
  private let center: UNUserNotificationCenter
  private weak var previousDelegate: UNUserNotificationCenterDelegate?
  init(center: UNUserNotificationCenter = .current()) {
    self.center = center; super.init()
    previousDelegate = center.delegate; center.delegate = self
  }
  private func state(_ status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral: return "granted"
    case .notDetermined: return "not-determined"
    case .denied: return "denied"
    @unknown default: return "restricted"
    }
  }
  func authorization(_ done: @escaping (String) -> Void) {center.getNotificationSettings {done(self.state($0.authorizationStatus))}}
  func request(_ done: @escaping (Result<String, Error>) -> Void) {
    DispatchQueue.main.async {
      guard UIApplication.shared.applicationState == .active else {done(.failure(AgendaFailure.code("agenda_requires_foreground")));return}
      self.center.requestAuthorization(options: [.alert, .sound]) {_, error in
        if let error = error {done(.failure(error))} else {self.authorization {done(.success($0))}}
      }
    }
  }
  func pending(_ done: @escaping ([AgendaNotificationRecord]) -> Void) {
    center.getPendingNotificationRequests {requests in done(requests.map {AgendaNotificationRecord(id: $0.identifier, revision: $0.content.userInfo["anjianRevision"] as? String ?? "")})}
  }
  func delivered(_ done: @escaping ([AgendaNotificationRecord]) -> Void) {
    center.getDeliveredNotifications {items in done(items.map {AgendaNotificationRecord(id: $0.request.identifier, revision: $0.request.content.userInfo["anjianRevision"] as? String ?? "")})}
  }
  func schedule(_ message: AgendaNotification, done: @escaping (Result<Void, Error>) -> Void) {
    do {try agendaValidateNotification(message)} catch {done(.failure(error));return}
    let trigger = UNCalendarNotificationTrigger(dateMatching: message.when.components, repeats: false)
    guard trigger.nextTriggerDate() != nil else {done(.failure(AgendaFailure.code("notification_time_passed")));return}
    let content = UNMutableNotificationContent();content.title = message.title;content.body = message.body;content.sound = .default
    content.userInfo = ["anjianRevision": message.revision, "anjianEventId": message.eventId]
    center.add(UNNotificationRequest(identifier: message.id, content: content, trigger: trigger)) {error in
      if let error = error {done(.failure(error))} else {done(.success(()))}
    }
  }
  func cancel(_ ids: [String]) {center.removePendingNotificationRequests(withIdentifiers: ids.filter(agendaOwnsNotification))}
  func removeDelivered(_ ids: [String]) {center.removeDeliveredNotifications(withIdentifiers: ids.filter(agendaOwnsNotification))}
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    if agendaOwnsNotification(notification.request.identifier) {done([.banner, .sound])}
    else if let previous = previousDelegate, previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {previous.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: done)}
    else {done([])}
  }
}
