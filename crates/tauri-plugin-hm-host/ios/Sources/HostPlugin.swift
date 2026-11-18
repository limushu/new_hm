import Foundation
import Tauri
import UIKit
import WebKit

enum HostAppearance {
  static func configure(_ webview: WKWebView) {
    // CSS viewport-fit=cover and env(safe-area-inset-*) own safe-area padding.
    // Applying UIKit's automatic inset too would shrink/double-pad the content.
    webview.scrollView.contentInsetAdjustmentBehavior = .never
    webview.scrollView.contentInset = .zero
    webview.scrollView.scrollIndicatorInsets = .zero
    webview.scrollView.automaticallyAdjustsScrollIndicatorInsets = false
  }
  static func apply(_ theme: String?, to webview: WKWebView) throws {
    let style: UIUserInterfaceStyle
    switch theme {
    case "dark": style = .dark
    case "light": style = .light
    case nil: style = .unspecified
    default: throw NSError(domain: "host_theme_invalid", code: 1)
    }
    let background = UIColor {trait in
      trait.userInterfaceStyle == .dark ? UIColor(white: 25.0/255.0, alpha: 1) : UIColor(red: 247.0/255.0, green: 247.0/255.0, blue: 245.0/255.0, alpha: 1)
    }
    webview.overrideUserInterfaceStyle = style
    webview.window?.overrideUserInterfaceStyle = style
    webview.window?.backgroundColor = background
    webview.backgroundColor = background
    webview.scrollView.backgroundColor = background
    webview.underPageBackgroundColor = background
    webview.isOpaque = true
    webview.window?.rootViewController?.setNeedsStatusBarAppearanceUpdate()
  }
}
private struct HostOptions: Decodable {var theme: String?}
// A foreground scene remains usable while an iOS permission/system sheet is
// temporarily inactive. A different scene must never determine this window's state.
enum HostActivity {
  static func foreground(scene: UIScene.ActivationState?, application: UIApplication.State) -> Bool {
    if let scene = scene {
      return scene == .foregroundActive || scene == .foregroundInactive
    }
    return application == .active || application == .inactive
  }
}
private struct HostReply: Encodable {var error: String?; var foreground: Bool?}
final class HostPlugin: Plugin {
  private weak var webview: WKWebView?
  override func load(webview: WKWebView) {
    self.webview = webview
    HostAppearance.configure(webview)
  }
  @objc func foreground(_ invoke: Invoke) throws {
    DispatchQueue.main.async {
      guard let webview = self.webview else {invoke.resolve(HostReply(error:"host_state_failed"));return}
      invoke.resolve(HostReply(foreground:HostActivity.foreground(
        scene:webview.window?.windowScene?.activationState,
        application:UIApplication.shared.applicationState)))
    }
  }
  @objc func setTheme(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(HostOptions.self)
    DispatchQueue.main.async {
      guard let webview = self.webview else {invoke.resolve(HostReply(error:"host_theme_failed"));return}
      do {try HostAppearance.apply(args.theme,to:webview);invoke.resolve(HostReply())}
      catch {invoke.resolve(HostReply(error:"host_theme_invalid"))}
    }
  }
}
@_cdecl("init_plugin_hm_host")
func initHostPlugin() -> Plugin {HostPlugin()}
