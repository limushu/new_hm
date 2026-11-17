// swift-tools-version:5.5
import PackageDescription
let package = Package(
  name: "tauri-plugin-hm-host", platforms: [.iOS(.v15)],
  products: [.library(name: "tauri-plugin-hm-host", type: .static, targets: ["tauri-plugin-hm-host"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-hm-host", dependencies: [.byName(name: "Tauri")], path: "Sources",
    linkerSettings: [.linkedFramework("UIKit"), .linkedFramework("WebKit")])]
)
