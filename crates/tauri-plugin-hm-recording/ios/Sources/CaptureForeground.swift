import Foundation

enum CaptureVisibility { case active, inactive, background }

/// A window scene is authoritative in scene-based applications. UIApplication
/// can still report inactive/background while that scene is foreground-active.
func captureVisibility(scene: CaptureVisibility?, application: CaptureVisibility) -> CaptureVisibility {
  scene ?? application
}

/// Permission dialogs can temporarily deactivate a foreground scene. Wait for
/// that transition to finish; never start a late capture after entering background.
final class CaptureForeground {
  var visibility: () -> CaptureVisibility
  private let timeout: TimeInterval

  init(timeout: TimeInterval = 4, visibility: @escaping () -> CaptureVisibility) {
    self.timeout = timeout
    self.visibility = visibility
  }

  func whenActive(_ completion: @escaping (Bool) -> Void) {
    let deadline = ProcessInfo.processInfo.systemUptime + timeout
    func check() {
      switch self.visibility() {
      case .active: completion(true)
      case .background: completion(false)
      case .inactive:
        if ProcessInfo.processInfo.systemUptime >= deadline { completion(false) }
        else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: check) }
      }
    }
    check()
  }
}
