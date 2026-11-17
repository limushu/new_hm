import UIKit
import XCTest

// Runs against the actual installed Tauri application and its existing SQLite
// upgrade fixture. No injected WebView, mocked shell, or product test command.
final class ViewportTests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.limushu.hm")

  private func tap(_ name: String) {
    let predicate=NSPredicate(format:"label == %@",name)
    let button=app.buttons.matching(predicate).firstMatch
    if button.waitForExistence(timeout:5) && button.isHittable {button.tap();return}
    for control in app.descendants(matching:.any).matching(predicate).allElementsBoundByIndex where control.isHittable {
      control.tap();return
    }
    XCTFail("No visible control: \(name)\n\(app.debugDescription)")
  }
  private func capture(_ name:String) {
    let image=XCTAttachment(screenshot:XCUIScreen.main.screenshot())
    image.name="anjian-viewport-\(name)"
    image.lifetime = .keepAlways
    add(image)
  }
  func testFullWindowAndCaseActionsAcrossAllTabs() {
    continueAfterFailure=false
    XCUIDevice.shared.orientation = .portrait
    app.activate()
    XCTAssertTrue(app.wait(for:.runningForeground,timeout:30))
    XCTAssertTrue(app.buttons["案件"].firstMatch.waitForExistence(timeout:30))
    // UITest Runner's UIScreen can report its own compatibility dimensions.
    // Compare the tested app's window to the physical screenshot instead.
    let screen=app.frame
    let pixels=XCUIScreen.main.screenshot().image.size
    XCTAssertEqual(screen.minX,0,accuracy:1)
    XCTAssertEqual(screen.minY,0,accuracy:1)
    XCTAssertEqual(screen.width/screen.height,pixels.width/pixels.height,accuracy:0.001)
    capture("today")
    tap("案件")
    tap("SQLite upgrade fixture (fictional)")
    XCTAssertTrue(app.textFields["案件名称"].firstMatch.waitForExistence(timeout:15))
    for (index,name) in ["脉络","材料","人员","费用"].enumerated() {
      tap(name)
      let create=app.buttons.matching(NSPredicate(format:"label == %@","创建")).firstMatch
      XCTAssertTrue(create.waitForExistence(timeout:10))
      XCTAssertTrue(create.isHittable)
      // The CI device has a home indicator. This allows its safe-area padding
      // and button spacing, but rejects a footer floating above unused space.
      let gap=screen.maxY-create.frame.maxY
      print("Installed app viewport: tab=\(name), window=\(app.frame), create=\(create.frame), bottomGap=\(gap)")
      XCTAssertGreaterThanOrEqual(gap,20)
      XCTAssertLessThanOrEqual(gap,48)
      XCTAssertGreaterThanOrEqual(create.frame.minX,0)
      XCTAssertLessThanOrEqual(create.frame.maxX,screen.maxX)
      capture("\(index)-case")
    }
  }
}
