import Foundation
import XCTest

final class IdentityTests: XCTestCase {
  func testKeychainRoundTripProjectIsolationReplacementAndDeletion() throws {
    let vault = IdentityCredentials(service: "com.limushu.hm.identity-tests.\(UUID().uuidString)")
    let project = "abcdefghijklmnopqrst", other = "01234567890123456789"
    defer { try? vault.save(project, credential: nil); try? vault.save(other, credential: nil) }
    XCTAssertNil(try vault.load(project))
    try vault.save(project, credential: "fake-first-credential")
    XCTAssertEqual(try vault.load(project), "fake-first-credential")
    XCTAssertNil(try vault.load(other))
    try vault.save(project, credential: "fake-rotated-credential")
    XCTAssertEqual(try vault.load(project), "fake-rotated-credential")
    XCTAssertThrowsError(try vault.save(project, credential: String(repeating: "x", count: 65537)))
    XCTAssertEqual(try vault.load(project), "fake-rotated-credential")
    try vault.save(project, credential: nil); XCTAssertNil(try vault.load(project))
    try vault.save(project, credential: nil)
  }
  func testInvalidProjectCannotAccessCredentialStore() {
    let vault = IdentityCredentials(service: "com.limushu.hm.identity-tests")
    for project in ["", "../account", "OTHERPROJECT", "abcdefghijklmnopqrst/other"] {
      XCTAssertThrowsError(try vault.load(project)); XCTAssertThrowsError(try vault.save(project, credential: nil))
    }
  }
  func testAuthorizationRejectsForeignOriginsAndInsecureURLs() {
    for url in ["http://accounts.google.com/auth", "https://accounts.google.com.attacker.invalid/auth", "https://user@appleid.apple.com/auth", "file:///credential", "https://accounts.google.com:444/auth"] {
      XCTAssertNil(identityAuthorizationURL(url))
    }
    XCTAssertNotNil(identityAuthorizationURL("https://abcdefghijklmnopqrst.supabase.co/auth/v1/authorize?provider=apple"))
    XCTAssertNotNil(identityAuthorizationURL("https://accounts.google.com/o/oauth2/v2/auth"))
  }
  func testLateCanceledCallbackCannotCompleteANewAuthorization() throws {
    let gate = IdentityAuthorizationGate()
    let first = try XCTUnwrap(gate.begin()); XCTAssertNil(gate.begin())
    XCTAssertTrue(gate.finish(first))
    let second = try XCTUnwrap(gate.begin())
    XCTAssertFalse(gate.finish(first)); XCTAssertEqual(gate.current, second)
    XCTAssertTrue(gate.finish(second)); XCTAssertNil(gate.current)
  }
}
