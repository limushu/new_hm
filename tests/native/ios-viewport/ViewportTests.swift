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
    let title=app.textViews["案件名称"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout:15))
    XCTAssertGreaterThanOrEqual(title.frame.height,30)
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

    tap("脉络")
    tap("创建")
    let record=app.buttons.matching(NSPredicate(format:"label BEGINSWITH %@","工作记录")).firstMatch
    XCTAssertTrue(record.waitForExistence(timeout:10))
    record.tap()
    let content=app.textViews["工作记录内容"].firstMatch
    XCTAssertTrue(content.waitForExistence(timeout:10))
    content.tap()
    // A fresh simulator can show the system QuickPath introduction instead of
    // letter keys. Dismiss it and require the real keyboard before measuring.
    for host in [app, XCUIApplication(bundleIdentifier:"com.apple.springboard")] {
      let introduction=host.buttons["Continue"].firstMatch
      if introduction.waitForExistence(timeout:2) && introduction.isHittable {
        introduction.tap()
      }
    }
    content.typeText("Fictional keyboard layout check")
    let keyboard=app.keyboards.firstMatch
    XCTAssertTrue(keyboard.waitForExistence(timeout:10))
    XCTAssertGreaterThan(keyboard.keys.count,20,"Expected letter keys, not keyboard onboarding")
    XCTAssertTrue((content.value as? String)?.contains("Fictional keyboard layout check") == true)
    let save=app.buttons["保存记录"].firstMatch
    XCTAssertTrue(save.isHittable)
    XCTAssertLessThanOrEqual(save.frame.maxY,keyboard.frame.minY+1)
    print("Installed app keyboard: keyboard=\(keyboard.frame), save=\(save.frame)")
    capture("keyboard-record-editor")
    tap("取消")
  }
}
