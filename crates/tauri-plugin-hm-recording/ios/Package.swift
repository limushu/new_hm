// swift-tools-version:5.5
import PackageDescription

let package = Package(
  name: "tauri-plugin-hm-recording",
  platforms: [.iOS(.v15)],
  products: [.library(name: "tauri-plugin-hm-recording", type: .static,
                      targets: ["tauri-plugin-hm-recording"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-hm-recording",
                    dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
