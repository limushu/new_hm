import UIKit
import WebKit
import XCTest

final class HostAppearanceTests: XCTestCase {
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
