import XCTest

// Drives the installed production app. No injected web view or screenshot-only UI.
final class StoreScreenshots: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.limushu.hm")

  override func setUpWithError() throws {
    continueAfterFailure = false
    XCUIDevice.shared.orientation = .portrait
    // simctl has already launched the verified app. Bring that process forward;
    // SpringBoard may expose an off-page duplicate icon with a zero-size frame.
    app.activate()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30))
    XCTAssertTrue(app.buttons["案件"].firstMatch.waitForExistence(timeout: 30))
  }

  private func tap(_ label: String) {
    let predicate = NSPredicate(format: "label == %@", label)
    let button = app.buttons.matching(predicate).firstMatch
    if button.waitForExistence(timeout: 5) && button.isHittable {
      button.tap()
      return
    }
    let elements = app.descendants(matching: .any).matching(predicate)
    for element in elements.allElementsBoundByIndex where element.isHittable {
      element.tap()
      return
    }
    XCTFail("No visible control: \(label)\n\(app.debugDescription)")
  }

  private func capture(_ name: String) {
    // Let the WebKit render transaction complete after native UI interaction.
    Thread.sleep(forTimeInterval: 2)
    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name = "anjian-\(name)"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  func testCaptureStoreScreenshots() {
    tap("案件")
    XCTAssertTrue(app.buttons["示例 · 借款合同纠纷"].firstMatch.waitForExistence(timeout: 15))
    capture("01-cases")
    tap("示例 · 借款合同纠纷")
    XCTAssertTrue(app.textViews["案件名称"].firstMatch.waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["案件时间轴"].firstMatch.waitForExistence(timeout: 10))
    capture("02-timeline")
    tap("材料")
    XCTAssertTrue(app.buttons["材料归档说明.txt"].firstMatch.waitForExistence(timeout: 10))
    capture("03-materials")
    tap("费用")
    XCTAssertTrue(app.staticTexts["收入合计"].firstMatch.waitForExistence(timeout: 10))
    capture("04-expenses")
  }
}
