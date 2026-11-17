// swift-tools-version:5.5
import PackageDescription
let package = Package(
  name: "tauri-plugin-hm-agenda",
  platforms: [.iOS(.v15)],
  products: [.library(name: "tauri-plugin-hm-agenda", type: .static, targets: ["tauri-plugin-hm-agenda"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-hm-agenda", dependencies: [.byName(name: "Tauri")], path: "Sources",
    linkerSettings: [.linkedFramework("UserNotifications"), .linkedFramework("EventKit")])]
)
