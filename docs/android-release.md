# Android 1.9.0 测试版适配

目标机型为 Redmi K60（ARM64）。共用案件、脉络、材料、人员关系、收支、日程、属性和主题框架；本轮新增 Android 文件提供器、宿主外观与系统返回接入。构建基线 min SDK 24，不代表所有 Android 7 以上系统已实机验收。

## 本轮范围

- 系统文件选择器支持选择存量文件、多选材料、取消及单项失败报告。只使用选择器授予的文档访问，不申请广泛存储权限。
- 文档读取暂存到本应用私有缓存，再交给公共 DocumentDriver / 归档用例；提供器 URI 不进入业务数据库或前端。原件保留，暂存随对象释放。
- 文件导出、完整 ZIP 备份与文件恢复复用公共 BackupService，继续校验数据库、材料及哈希，并保留恢复前副本。
- 状态栏、显示缺口、导航栏、键盘避让及深浅外观由 Android HostDriver 处理。系统返回经公共返回栈，优先处理弹出菜单、编辑器和案件的未保存确认。
- 案件和材料保存在应用私有目录；启动及恢复前台时检查本地备份。系统自动备份与设备迁移默认关闭，数据迁移由用户明确导出/恢复。

当前不安装 Android 录音、语音识别、账号登录、自动云同步、系统通知和系统日历驱动，对应入口按实际能力隐藏或说明不可用。不能将本地日程和应用内提醒写作锁屏系统通知，也不能将手动 ZIP 备份写作自动云同步。

## 构建与验收

Android 原生工程由 `tauri android init` 生成，不提交生成文件。[准备脚本](../scripts/prepare-android.mjs)应用已审阅的 [MainActivity](../src-tauri/android/MainActivity.kt) 与备份策略。Java 在 Rust 应用初始化前设置私有临时目录，供全部公共临时文件用例使用。

[Android 文件桥](../crates/tauri-plugin-hm-documents/android/src/main/java/com/limushu/hm/documents/DocumentsPlugin.kt)和[Android 宿主桥](../crates/tauri-plugin-hm-host/android/src/main/java/com/limushu/hm/host/HostPlugin.kt)分别实现已有接口；Rust 移动桥在 iOS/Android 共用，平台差异留在装配与 Kotlin/Swift 中。

[APK 工作流](../.github/workflows/android.yml)准备 ARM64 发布候选及 Android SDK 检查。候选、模拟器验证、签名与 Redmi 真机试用分别记录；构建成功不等于真机兼容已经验证。ARM64 测试包已完成构建、签名与安装包检查，9 项 Android 原生边界测试与 7 项完整模拟器场景均通过。Redmi K60 真机仍需安装试用，不能将 SDK 模拟器写作真机验收。


## 构建和更新身份

使用 Node 22、JDK 17、SDK 36、NDK r27c。准备脚本将 CLI 生成工程的 compile/target SDK 固定为 36；主机和插件使用同一 SDK，避免依赖尚未在 SDK 仓库提供的预览版本。构建 ARM64 时为原生库设置 16 KiB ELF 页面兼容参数。

测试分发用 [本地签名脚本](../scripts/sign-android.mjs)处理 CI 生成的未签名候选：私钥与密码仅在被忽略的 `.local/android-signing/` 保存，不进入 Git、APK 或 CI 产物；公开证书指纹用于阻止误换签名。必须安全保留该目录，后续版本使用同一身份覆盖安装；缺少原密钥时脚本拒绝自动生成替代身份。这个身份不等于应用商店发布或 Google Play App Signing 配置。

调试 x86_64 模拟器包只用于受控测试：通过实际 WebView/原生 SDK 验证交互，不注入预览仓库；发布 ARM64 包保持非调试。完整备份可用于与其他平台手动迁移，账号登录并不会自动替 Android 开启云同步。


## 1.9.0 ARM64 安装包核对

- 产品源码：`06b23deff4cd0cf5e071eae53dfe77059bc4aef0`；[APK 与 Kotlin SDK 测试](https://github.com/limushu/new_hm/actions/runs/45110297876)通过。系统文件流测试 4 项、主题/安全区/键盘布局测试 5 项，共 9 项。
- 安装文件：`anjian-1.9.0-android-arm64.apk`，27,515,529 字节。包名 `com.limushu.hm`，版本码 `1009000`，min SDK 24、target/compile SDK 36。
- 实际发布 APK 非调试，关闭系统云备份/设备迁移，未申请广泛存储、录音、日历或通知权限；材料访问由系统选择器按次授权。
- 实际 APK 的普通/自适应图标与已确认的银灰色品牌逐像素核对一致，自适应底色为 `#191D21`；生成工程不再使用 Tauri 默认黄蓝图标。
- APK Signature Scheme v2/v3 核验通过；实际 ARM64 原生库的所有 LOAD 段和未压缩 ZIP 偏移均满足 16 KiB 对齐。[公开核对记录](android-receipt-1.9.0.json)保存 APK 哈希、签名证书摘要与库信息；私钥不在仓库中。
- [共用应用检查](https://github.com/limushu/new_hm/actions/runs/45110297272)通过 100 项单元、153 项 Chromium、49 项 WebKit 回归、Rust 测试/Clippy 及 Windows 应用构建。[完整 Android 模拟器流程](https://github.com/limushu/new_hm/actions/runs/45114753319)通过原生案件创建、状态保存与返回、费用/时间轴、SAF 取消与归档/预览、键盘及底栏、完整 ZIP 导出/校验/确认恢复、强制关闭后的数据库与材料留存，共 7 项。调试 APK 产品源码与发布包一致，脚本源码 `790f9a1`；模拟器不等于 K60 真机验收。

下载交付的 APK 后直接安装。系统询问时允许当前浏览器或文件管理器安装应用；不需要开启 USB 调试或关闭系统优化。之后使用相同签名覆盖更新；卸载会删除私有目录中的案件和材料。

设置中的「导出完整备份」和「从文件恢复」可用于 Windows/iOS/Android 间手动迁移完整工作区，包含数据库与材料。Android 当前没有自动云同步；账号登录和系统云盘文件提供器也不等于双向实时同步。


## 返回与模拟器边界

材料预览、日程编辑和欢迎页已与公共 Dialog 一样注册返回栈。预览使用 body 中的独立顶层容器，避免嵌在材料滚动区域中；关闭预览保留案件，第二次返回才离开案件。新增 3 项公共界面回归验证这些边界，Android 系统按键和触摸另由 SDK 流程验证。

[完整模拟器工作流](../.github/workflows/android-emulator.yml)使用可检查的调试 APK，文件选择与保存经过真实系统文档界面。自动化可复用同一产品源码的调试包，但必须比较核心、前端、资源、平台配置和宿主准备脚本；结果分别记录 APK 源码与测试脚本源码。测试环境的桌面 ANR、系统通知和安装停滞不会写成应用功能通过。

最终源码的 7 项场景已通过，实际导出的备份另行验证所有清单 SHA-256、材料原文、SQLite 完整性及 schema 9。强制关闭应用后，原生数据库记录与归档材料仍可读取。早期脚本曾因系统桌面 ANR、选择器完成后的过期元素、大小写标志、旧调试会话及工具退出未结束而失败/超时；最终通过作业单独记录，不把这些早期作业列为整体通过。

iOS 共享移动桥在 [先前原生检查](https://github.com/limushu/new_hm/actions/runs/45105510499)通过 38 项 SDK 测试。当前源码的 [iOS 应用回归](https://github.com/limushu/new_hm/actions/runs/45110297295)首次在模拟器工作记录键盘输入断言失败，已重跑，不能沿用旧结果称为当前整套 iOS 验收通过；本轮交付 Android APK。
