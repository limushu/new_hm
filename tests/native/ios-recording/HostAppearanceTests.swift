import UIKit
import WebKit
import XCTest

final class HostAppearanceTests: XCTestCase {
  @MainActor func testWebViewCoversWindowWhileCSSReceivesSafeAreaInsets() async throws {
    guard let scene = UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first,
          let window = scene.windows.first(where: {$0.isKeyWindow}), let parent = window.rootViewController?.view else {XCTFail("Missing test host window");return}
    let webview = WKWebView(frame: parent.bounds)
    parent.addSubview(webview)
    parent.layoutIfNeeded()
    webview.layoutIfNeeded()
    defer {webview.removeFromSuperview()}
    HostAppearance.configure(webview)
    webview.loadHTMLString("<html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'></head><body style='margin:0'><div id='safe' style='padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'></div></body></html>",baseURL:nil)
    var metrics: [String:Double]?
    for _ in 0..<100 {
      if let value = try? await webview.evaluateJavaScript("document.getElementById('safe') ? ({width:innerWidth,height:innerHeight,top:parseFloat(getComputedStyle(document.getElementById('safe')).paddingTop),bottom:parseFloat(getComputedStyle(document.getElementById('safe')).paddingBottom)}) : null") as? [String:Double] {
        metrics=value
        if abs((value["height"] ?? 0)-Double(window.bounds.height)) < 1 && abs((value["top"] ?? 0)-Double(webview.safeAreaInsets.top)) < 1 {break}
      }
      try await Task.sleep(nanoseconds:50_000_000)
    }
    let actual = try XCTUnwrap(metrics)
    XCTAssertEqual(actual["width"]!,Double(window.bounds.width),accuracy:1)
    XCTAssertEqual(actual["height"]!,Double(window.bounds.height),accuracy:1)
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
