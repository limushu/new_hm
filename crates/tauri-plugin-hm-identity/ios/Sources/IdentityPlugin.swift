import Foundation
import UIKit
import AuthenticationServices
import Tauri

private struct IdentityOptions: Decodable {
  var project: String?; var credential: String?; var url: String?; var callback: String?
}
/// A late callback from a canceled system window cannot complete a later login.
final class IdentityAuthorizationGate {
  private(set) var current: UUID?
  func begin() -> UUID? { guard current == nil else { return nil }; let id = UUID(); current = id; return id }
  func finish(_ id: UUID) -> Bool { guard current == id else { return false }; current = nil; return true }
}
func identityAuthorizationURL(_ text: String) -> URL? {
  guard let url = URL(string: text), url.scheme == "https", url.user == nil, url.password == nil,
        url.port == nil, let host = url.host else { return nil }
  let isProject = host.range(of: "^[a-z0-9]{20}\\.supabase\\.co$", options: .regularExpression) != nil
  guard isProject || ["appleid.apple.com", "accounts.google.com", "login.microsoftonline.com", "login.live.com"].contains(host) else { return nil }
  return url
}
final class IdentityPlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
  private let credentials = IdentityCredentials()
  private var authentication: ASWebAuthenticationSession?
  private var timeout: DispatchWorkItem?
  private var completion: (([String: String]) -> Void)?
  private weak var anchor: UIWindow?
  private let gate = IdentityAuthorizationGate()

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    // A foreground key window is captured before starting, never create an unrelated scene.
    return anchor ?? ASPresentationAnchor()
  }
  @objc func loadCredential(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(IdentityOptions.self)
    do {
      guard let project = args.project else { invoke.resolve(["error":"identity_configuration_invalid"]); return }
      if let value = try credentials.load(project) { invoke.resolve(["credential":value]) }
      else { invoke.resolve([:]) }
    } catch { invoke.resolve(["error":(error as NSError).domain]) }
  }
  @objc func saveCredential(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(IdentityOptions.self)
    do {
      guard let project = args.project else { invoke.resolve(["error":"identity_configuration_invalid"]); return }
      try credentials.save(project, credential: args.credential); invoke.resolve([:])
    } catch { invoke.resolve(["error":(error as NSError).domain]) }
  }
  private func finish(_ id: UUID, _ result: [String: String]) {
    guard gate.finish(id), let complete = completion else { return }
    completion = nil; timeout?.cancel(); timeout = nil
    let old = authentication; authentication = nil; old?.cancel(); anchor = nil
    complete(result)
  }
  @objc func authorize(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(IdentityOptions.self)
    DispatchQueue.main.async {
      guard self.authentication == nil else { invoke.resolve(["error":"identity_busy"]); return }
      guard args.callback == "anjian://auth/callback", let text = args.url,
            let url = identityAuthorizationURL(text) else { invoke.resolve(["error":"identity_configuration_invalid"]); return }
      let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        .filter { $0.activationState == .foregroundActive }.flatMap { $0.windows }.first { $0.isKeyWindow }
      guard let window = window else { invoke.resolve(["error":"identity_requires_foreground"]); return }
      guard let id = self.gate.begin() else { invoke.resolve(["error":"identity_busy"]); return }
      self.anchor = window
      self.completion = { invoke.resolve($0) }
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "anjian") { [weak self] callback, error in
        DispatchQueue.main.async {
          if let callback = callback { self?.finish(id, ["callback":callback.absoluteString]) }
          else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { self?.finish(id, ["error":"identity_canceled"]) }
          else { self?.finish(id, ["error":"identity_authorization_failed"]) }
        }
      }
      // Avoid silently binding the browser's previous provider account.
      session.prefersEphemeralWebBrowserSession = true
      session.presentationContextProvider = self; self.authentication = session
      let timeout = DispatchWorkItem { [weak self] in self?.finish(id, ["error":"identity_timed_out"]) }
      self.timeout = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: timeout)
      if !session.start() { self.finish(id, ["error":"identity_authorization_failed"]) }
    }
  }
}
@_cdecl("init_plugin_hm_identity")
func initIdentityPlugin() -> Plugin { IdentityPlugin() }
