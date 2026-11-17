import UIKit
import WebKit
import XCTest

final class HostAppearanceTests: XCTestCase {
  @MainActor func testWebViewCoversWindowWhileCSSReceivesSafeAreaInsets() async throws {
    guard let scene = UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first,
          let window = scene.windows.first(where: {$0.isKeyWindow}),
          let previous = window.rootViewController else {XCTFail("Missing test host window");return}
    // Tauri embeds its WKWebView in Tao's UIView; it is not the controller's
    // root view. Match that production hierarchy when measuring the viewport.
    let controller = UIViewController()
    controller.view = UIView(frame: window.bounds)
    let webview = WKWebView(frame: window.bounds)
    webview.autoresizingMask = [.flexibleWidth,.flexibleHeight]
    webview.scrollView.bounces = false
    controller.view.addSubview(webview)
    window.rootViewController = controller
    window.makeKeyAndVisible()
    defer {window.rootViewController = previous}
    window.layoutIfNeeded()
    webview.layoutIfNeeded()
    HostAppearance.configure(webview)
    XCTAssertEqual(webview.bounds.width,window.bounds.width,accuracy:1)
    XCTAssertEqual(webview.bounds.height,window.bounds.height,accuracy:1)
    webview.loadHTMLString("""
      <!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
      <style>
      html,body {margin:0} * {box-sizing:border-box}
      #page {height:100dvh;padding-top:env(safe-area-inset-top)}
      #footer {display:flex;position:fixed;bottom:0;width:100%;padding-bottom:env(safe-area-inset-bottom)}
      #action {height:44px}
      </style></head><body><main id="page"><footer id="footer"><button id="action">Create</button></footer></main></body></html>
      """,baseURL:nil)
    let measure = """
      (() => {
        const page=document.getElementById('page'), footer=document.getElementById('footer'), action=document.getElementById('action');
        if (!page || !footer || !action) return null;
        const rect=page.getBoundingClientRect();
        return {width:rect.width,height:rect.height,footerBottom:footer.getBoundingClientRect().bottom,
          actionBottom:action.getBoundingClientRect().bottom,
          top:parseFloat(getComputedStyle(page).paddingTop),bottom:parseFloat(getComputedStyle(footer).paddingBottom),
          innerHeight:innerHeight,visualHeight:visualViewport.height};
      })()
      """
    var metrics: [String:Double]?
    for _ in 0..<100 {
      if let value = try? await webview.evaluateJavaScript(measure) as? [String:Double] {
        metrics=value
        if abs((value["height"] ?? 0)-Double(window.bounds.height)) < 1 && abs((value["top"] ?? 0)-Double(webview.safeAreaInsets.top)) < 1 {break}
      }
      try await Task.sleep(nanoseconds:50_000_000)
    }
    let actual = try XCTUnwrap(metrics)
    print("Host viewport: window=\(window.bounds), webview=\(webview.frame), safe=\(webview.safeAreaInsets), CSS=\(actual)")
    // Measure rendered full-screen content and the pinned action, rather than
    // innerHeight (WebKit can report its unobscured viewport for that property).
    XCTAssertEqual(actual["width"]!,Double(window.bounds.width),accuracy:1)
    XCTAssertEqual(actual["height"]!,Double(window.bounds.height),accuracy:1)
    XCTAssertEqual(actual["footerBottom"]!,Double(window.bounds.height),accuracy:1)
    XCTAssertEqual(actual["actionBottom"]!,Double(window.bounds.height-webview.safeAreaInsets.bottom),accuracy:1)
    XCTAssertEqual(actual["top"]!,Double(webview.safeAreaInsets.top),accuracy:1)
    XCTAssertEqual(actual["bottom"]!,Double(webview.safeAreaInsets.bottom),accuracy:1)
    XCTAssertEqual(webview.scrollView.contentInsetAdjustmentBehavior,.never)
    XCTAssertEqual(webview.scrollView.contentInset,.zero)
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
