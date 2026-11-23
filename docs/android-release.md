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

[APK 工作流](../.github/workflows/android.yml)准备 ARM64 发布候选及 Android SDK 检查。候选、模拟器验证、签名与 Redmi 真机试用分别记录；构建成功不等于真机兼容已经验证。当前候选仍在验证，下载与签名结果完成后补充。
