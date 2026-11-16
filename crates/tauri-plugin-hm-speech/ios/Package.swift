// swift-tools-version:5.5
import PackageDescription
let package = Package(
  name: "tauri-plugin-hm-speech",
  platforms: [.iOS(.v15)],
  products: [.library(name: "tauri-plugin-hm-speech", type: .static, targets: ["tauri-plugin-hm-speech"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-hm-speech", dependencies: [.byName(name: "Tauri")], path: "Sources",
                    linkerSettings: [.linkedFramework("Speech"), .linkedFramework("AVFoundation")])]
)
