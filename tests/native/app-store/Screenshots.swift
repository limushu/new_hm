import XCTest

// Drives the installed production app. No injected web view or screenshot-only UI.
final class StoreScreenshots: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.limushu.hm")

  override func setUpWithError() throws {
    continueAfterFailure = false
    XCUIDevice.shared.orientation = .portrait
    // Open the installed app just as a user does. Its binary is deliberately
    // outside the screenshot test project, so do not relaunch it via XCTest.
    XCUIDevice.shared.press(.home)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let icon = springboard.icons["案笺"].firstMatch
    for _ in 0..<4 {
      if icon.exists && icon.isHittable { break }
      springboard.swipeLeft()
    }
    XCTAssertTrue(icon.waitForExistence(timeout: 15))
    icon.tap()
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
    XCTAssertTrue(app.textFields["案件名称"].firstMatch.waitForExistence(timeout: 15))
    capture("02-case-overview")
    tap("办理")
    XCTAssertTrue(app.staticTexts["工作阶段"].firstMatch.waitForExistence(timeout: 10))
    capture("03-workflow")
    tap("材料")
    XCTAssertTrue(app.buttons["材料归档说明.txt"].firstMatch.waitForExistence(timeout: 10))
    capture("04-materials")
  }
}
