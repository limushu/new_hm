# 移动端开发与验证

更新于 2026-11-13。移动入口和平台依赖已拆分，iOS 1.4.3（9.1）已上传 TestFlight。本文的文件驱动为后续新增代码，需包含它的新构建验证，当前仍为开发阶段。

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

iOS 文件导入/导出通过独立的 `tauri-plugin-hm-documents` 驱动接入现有 `DocumentDriver`，点击「添加材料」调用系统文件选择器，支持多选和用户启用的文件提供器。Swift 在后台以安全作用域和 NSFileCoordinator 协调读取，将文件复制到 Rust 持有的临时目录，再由共享归档业务将 Document 流保存到当前案件/流程/文件夹。前端不接收文件提供器 URL 或路径；归档完成或失败后清理临时副本，原文件保留，单个读取失败按文件报告并继续处理其他文件。导出先生成私有副本，再通过系统导出选择器保存，取消不修改已归档材料。

`file-picker` 表示提供器文档选择；依赖真实本地路径的旧凭据选择流程使用独立 `local-file-picker` 能力，暂仅桌面提供。iOS 收支可先导入材料再选择已有材料关联。Android 文件驱动、外部打开、设备外备份恢复和系统通知尚未接通；相关入口禁用或隐藏。本机副本不能防止设备丢失，卸载会删除沙盒。

案件看板与案件内功能页首次访问才挂载，切换后使用 React Activity 保留 DOM/输入状态并暂停隐藏页面的 effects。手机卡片手势默认滚动，独立拖动手柄才改变案件状态；鼠标和键盘拖动继续可用。

后续适配：宽度不超过 760px 时，案件主页改为搜索、状态筛选与纵向全宽卡片。手机从卡片操作菜单修改状态或移入回收站；桌面继续使用看板。两个视图共享工作区数据及保存接口。

材料页在手机尺寸或主要指针为触摸时使用点击操作：不注册文件拖入监听、不显示拖入提示，单击文件直接预览，通过每行操作菜单移动材料。文件夹、录音、添加材料和行操作的触摸区域至少为 44px。桌面保留拖入文件和双击打开；原生文件选择能力仍由驱动清单决定，未支持时禁用添加并说明原因，不因手机布局而开放尚未接入的能力。当前材料没有手动排序功能，本次不新增排序或批量选择业务。

iOS 录音的前台判断优先使用当前 WebView 所在 UIWindowScene，并等待授权弹窗结束后的短暂 inactive 状态。模拟器验证增加独立的 scene-based XCTest 宿主，直接编译生产 Swift 驱动，测试真实 AVAudioRecorder 的暂停/继续与可解码 M4A，以及授权回调先于场景激活、场景与全局应用状态不一致、拒绝授权、后台拒绝和超时重试。测试不向正式应用注册额外命令；模拟器音频检查仍不能代替 iPhone 麦克风实录验收。

同一原生测试宿主编译文件驱动，验证真实系统选择器展示与取消、重复请求拒绝、协调读取及单项失败隔离，并以模拟提供器回调验证导入和导出结果。iCloud 账户、云文件下载、第三方文件提供器和实际导出目的地仍需 iPhone 真机验收。

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
4. TestFlight/正式分发需 Apple 开发者计划、有效签名、应用登记及 App Store Connect 配置；当前已配置云端签名上传，签名材料通过受控 CI secret 配置，不放入仓库。

Android min SDK 暂设 24，iOS minimumSystemVersion 暂设 15.0；这只是构建基线，不是覆盖这些系统版本的实机兼容承诺。品牌名统一为案笺，安装身份 com.limushu.hm 保持不变。

架构与后续顺序见[跨平台架构](design/cross-platform-architecture.md)和[子系统设计](design/subsystems.md)。

Rust 的分层目录、实际调用链和未完成边界见 [Rust 模块边界](design/rust-module-layout.md)。
