# 移动端开发与验证

更新于 2026-10-21。移动入口和平台依赖已拆分，iOS 1.4.3（6.1）已上传 TestFlight 并开始真机验证，当前仍为开发阶段。

完整模拟器应用与签名流程见[iOS 构建与 TestFlight](ios-testflight.md)。构建产物、模拟器检查、签名与上传状态分别记录，不混为真机验收。

## 当前可验证范围

| 项目                     | 当前结果                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| 共享案件/SQLite/备份业务 | Linux 核心测试；沙盒路径写入案件并重开校验                                    |
| Android 原生 Rust 库     | NDK r27c / API 24 / aarch64-linux-android 的 cargo check 和严格 Clippy 已通过 |
| iOS 平台依赖边界         | 依赖树检查不包含桌面托盘、自启动、单实例和更新组件                            |
| iOS 原生 Rust 库         | macOS CI 检查已配置；远端结果另行记录                                         |
| 手机界面                 | 浏览器手机尺寸与模拟移动能力回归，不代替原生设备验收                          |
| 安装包/系统权限/真机     | 尚未验证                                                                      |

移动端使用 app_local_data_dir 私有持久目录，不访问可执行文件目录或 .portable 标记。启动、原生 Resumed 和 WebView 恢复可见时触发前台维护；重叠请求合并，按日期幂等检查备份，不创建后台轮询线程。应用被挂起或终止后不承诺继续执行。

移动能力清单开放前台维护和本机备份。本次新增 iOS 原生录音驱动：Rust 的 RecordingDriver/RecordingSession 经私有 Tauri 插件调用 AVAudioRecorder，AAC/M4A 临时资源通过 Document 流归档；授权拒绝、暂停/继续、结束、放弃和归档重试沿用共享接口。锁屏、后台和音频中断会暂停，返回后由用户继续；不申请后台持续录音。Swift 桥不暴露前端调用命令，业务不接收原生路径。该驱动仍需新构建的 iPhone 真机验收；Android 录音驱动仍未接入。

文件导入/导出、外部打开、设备外备份恢复和系统通知尚未接通；相关入口禁用或隐藏，案件、流程、日程和材料文件夹等共享业务继续可用。本机副本不能防止设备丢失，卸载会删除沙盒，不作为可交付移动版本的数据保护方案。

案件看板与案件内功能页首次访问才挂载，切换后使用 React Activity 保留 DOM/输入状态并暂停隐藏页面的 effects。手机卡片手势默认滚动，独立拖动手柄才改变案件状态；鼠标和键盘拖动继续可用。

## 本地与 CI 检查

通用检查使用 Node 22.13+（22.x）、Rust 1.90+：

```sh
npm ci
npm run build
npm test
npm run test:core
npm run check:mobile-boundaries
```

依赖边界检查通过 cargo tree 检查两个移动目标，不要求安装 Xcode 或生成平台工程，但可能需要联网下载锁定依赖。

Android Rust 检查需要 NDK r27c（27.2.12479018）与 Rust 目标：

```sh
rustup target add aarch64-linux-android
export CC_aarch64_linux_android="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android24-clang"
export AR_aarch64_linux_android="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CC_aarch64_linux_android"
cargo check --locked -p hm-app --lib --target aarch64-linux-android
```

以上示例针对 Linux x64；其他主机需使用对应 NDK prebuilt 目录。Android 安装包还需 SDK、JDK、生成的原生工程与设备测试，不能把 Rust 检查结果称为 APK 验收。

iOS Rust 检查需在安装 Xcode 和 iOS Simulator SDK 的 macOS 上执行：

```sh
rustup target add aarch64-apple-ios-sim
cargo check --locked -p hm-app --lib --target aarch64-apple-ios-sim
```

[移动 CI](../.github/workflows/mobile.yml)分别执行 Android Rust 和 iOS 模拟器目标 Rust 检查；iOS 检查不需要发布证书，也不产生可安装 IPA。其结果验证 Rust/原生依赖边界，不替代完整 Xcode 应用构建。

## 从编译检查到 iPhone 安装

1. 用 macOS/Xcode 生成并构建 iOS 工程：npm run ios:init、npm run ios:dev。先验证模拟器启动与 SQLite 重启持久化，再处理安全区、系统返回和软键盘。
2. 验证文件提供器桥接、原生音频、系统通知调度及权限失败；以实际适配器能力开放入口。
3. 有 Mac 时可用个人 Apple ID 进行受限本地真机调试；不等同于 TestFlight 分发。没有 Mac 时，可用 GitHub macOS runner 完成构建检查，无法据此直接在 iPhone 安装。
4. TestFlight/正式分发需 Apple 开发者计划、有效签名、应用登记及 App Store Connect 配置；签名材料通过受控 CI secret 配置，不放入仓库。当前尚未配置，也不自动购买或发布。

Android min SDK 暂设 24，iOS minimumSystemVersion 暂设 15.0；这只是构建基线，不是覆盖这些系统版本的实机兼容承诺。品牌名统一为案笺，安装身份 com.limushu.hm 保持不变。

架构与后续顺序见[跨平台架构](design/cross-platform-architecture.md)和[子系统设计](design/subsystems.md)。

Rust 的分层目录、实际调用链和未完成边界见 [Rust 模块边界](design/rust-module-layout.md)。
