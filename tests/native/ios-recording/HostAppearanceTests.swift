import Tauri
import UIKit
import WebKit
import XCTest

final class HostAppearanceTests: XCTestCase {
  @MainActor private func foreground(_ plugin: HostPlugin) async throws -> [String:Any] {
    try await withCheckedThrowingContinuation { continuation in
      let invoke = Invoke(command:"foreground",callback:1,error:2,sendResponse:{id,json in
        guard id == 1, let bytes = json?.data(using:.utf8),
              let response = try? JSONSerialization.jsonObject(with:bytes) as? [String:Any]
        else {continuation.resume(throwing:NSError(domain:"host_test_failed",code:1));return}
        continuation.resume(returning:response)
      },sendChannelData:{_,_ in},data:"{}")
      do {try plugin.foreground(invoke)} catch {continuation.resume(throwing:error)}
    }
  }
  @MainActor func testNativeForegroundCommandResolvesFromTheLoadedWindow() async throws {
    let window = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene})
      .flatMap({$0.windows}).first(where:{$0.isKeyWindow}))
    let webview = WKWebView(frame:window.bounds)
    window.addSubview(webview)
    defer {webview.removeFromSuperview()}
    let plugin = HostPlugin()
    plugin.load(webview:webview)
    let response = try await foreground(plugin)
    XCTAssertNil(response["error"])
    XCTAssertEqual(response["foreground"] as? Bool,true)
  }
  @MainActor func testMissingWebviewReportsFailureInsteadOfForegroundSuccess() async throws {
    let response = try await foreground(HostPlugin())
    XCTAssertEqual(response["error"] as? String,"host_state_failed")
    XCTAssertNil(response["foreground"])
  }
  func testForegroundSceneOverridesStaleApplicationState() {
    XCTAssertTrue(HostActivity.foreground(scene:.foregroundActive,application:.background))
    XCTAssertTrue(HostActivity.foreground(scene:.foregroundInactive,application:.background))
    XCTAssertFalse(HostActivity.foreground(scene:.background,application:.active))
    XCTAssertFalse(HostActivity.foreground(scene:.unattached,application:.active))
  }
  func testUnscenedHostUsesApplicationStateAndAllowsTemporarySystemSheets() {
    XCTAssertTrue(HostActivity.foreground(scene:nil,application:.active))
    XCTAssertTrue(HostActivity.foreground(scene:nil,application:.inactive))
    XCTAssertFalse(HostActivity.foreground(scene:nil,application:.background))
  }
  @MainActor func testNativeContainerCoversWindowWithoutAutomaticScrollInsets() throws {
    guard let scene = UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first,
          let window = scene.windows.first(where: {$0.isKeyWindow}),
          let previous = window.rootViewController else {XCTFail("Missing test host window");return}
    let controller = UIViewController()
    controller.view = UIView(frame: window.bounds)
    let webview = WKWebView(frame: window.bounds)
    webview.autoresizingMask = [.flexibleWidth,.flexibleHeight]
    controller.view.addSubview(webview)
    window.rootViewController = controller
    defer {window.rootViewController = previous}
    HostAppearance.configure(webview)
    window.layoutIfNeeded()
    webview.layoutIfNeeded()
    XCTAssertEqual(webview.bounds.width,window.bounds.width,accuracy:1)
    XCTAssertEqual(webview.bounds.height,window.bounds.height,accuracy:1)
    XCTAssertEqual(webview.scrollView.contentInsetAdjustmentBehavior,.never)
    XCTAssertEqual(webview.scrollView.contentInset,.zero)
    XCTAssertEqual(webview.scrollView.scrollIndicatorInsets,.zero)
    XCTAssertFalse(webview.scrollView.automaticallyAdjustsScrollIndicatorInsets)
    // Rendered viewport and action geometry are checked in ViewportTests against
    // the installed Tauri app, rather than an unrelated loadHTMLString page.
  }
  @MainActor func testNativeSurfacesFollowLightDarkAndSystemAppearance() throws {
    let webview = WKWebView(frame:.zero)
    for (mode,style) in [("light",UIUserInterfaceStyle.light),("dark",.dark)] {
      try HostAppearance.apply(mode,to:webview)
      XCTAssertEqual(webview.overrideUserInterfaceStyle,style)
      let colour = try XCTUnwrap(webview.backgroundColor).resolvedColor(with:UITraitCollection(userInterfaceStyle:style))
      var r:CGFloat=0,g:CGFloat=0,b:CGFloat=0,a:CGFloat=0
      XCTAssertTrue(colour.getRed(&r,green:&g,blue:&b,alpha:&a))
      XCTAssertEqual(r,mode=="dark" ? 25.0/255.0 : 247.0/255.0,accuracy:0.001)
      XCTAssertEqual(a,1)
      XCTAssertEqual(webview.scrollView.backgroundColor,webview.backgroundColor)
    }
    try HostAppearance.apply(nil,to:webview)
    XCTAssertEqual(webview.overrideUserInterfaceStyle,.unspecified)
  }
  @MainActor func testInvalidAppearanceDoesNotOverwriteCurrentNativeStyle() throws {
    let webview=WKWebView(frame:.zero)
    try HostAppearance.apply("dark",to:webview)
    XCTAssertThrowsError(try HostAppearance.apply("invalid",to:webview))
    XCTAssertEqual(webview.overrideUserInterfaceStyle,.dark)
  }
}
