// swift-tools-version:5.5
import PackageDescription
let package = Package(
  name: "tauri-plugin-hm-identity",
  platforms: [.iOS(.v15)],
  products: [.library(name: "tauri-plugin-hm-identity", type: .static, targets: ["tauri-plugin-hm-identity"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-hm-identity", dependencies: [.byName(name: "Tauri")], path: "Sources",
                    linkerSettings: [.linkedFramework("AuthenticationServices"), .linkedFramework("Security")])]
)
