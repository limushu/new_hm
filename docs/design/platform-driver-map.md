# 平台驱动接入位置

平台装配在 [platforms/mod.rs](../../src-tauri/src/platforms/mod.rs)。前端页面调用子系统命令；业务用例依赖 `hm-runtime` 中的端口；装配层按 `cfg` 选择实现。iOS 原生代码单独放在 Tauri 插件 crate，便于 Cargo/Xcode 编译 Swift，因而不在 `src-tauri/src/platforms/ios/` 下。

| 能力 | 接口 / 用例 | iOS / iPadOS 驱动 | 桌面 / 其他平台 |
| --- | --- | --- | --- |
| 窗口外观与安全区 | [HostDriver](../../crates/hm-runtime/src/platform/ports.rs)、[主题 Provider](../../src/components/ThemeProvider.tsx)、[颜色规则](../../src/domain/accent.ts) | [Rust 桥](../../crates/tauri-plugin-hm-host/src/ios.rs) → [UIKit / WebView](../../crates/tauri-plugin-hm-host/ios/Sources/HostPlugin.swift)，原生背景与 CSS 安全区各自明确负责 | 桌面沿用窗口驱动；Android 仍为不可用宿主外观驱动，前端颜色可独立使用 |
| 录音 | [RecordingDriver](../../crates/hm-runtime/src/platform/recording.rs)、[RecordingService](../../crates/hm-application/src/recording.rs) | [Rust 桥](../../crates/tauri-plugin-hm-recording/src/ios.rs) → [Swift AVFoundation](../../crates/tauri-plugin-hm-recording/ios/Sources/RecordingPlugin.swift) | 桌面保留 WebView 后端；Android 未接原生录音 |
| 文件 | [DocumentDriver](../../crates/hm-runtime/src/platform/documents.rs) | [Rust 桥](../../crates/tauri-plugin-hm-documents/src/ios.rs) → [Swift 系统文件](../../crates/tauri-plugin-hm-documents/ios/Sources/DocumentsPlugin.swift) | [桌面文件驱动](../../src-tauri/src/platforms/desktop/documents.rs)；Android 未接 |
| 转文字 | [SpeechDriver](../../crates/hm-runtime/src/platform/speech.rs)、[SpeechService](../../crates/hm-application/src/speech.rs) | [Rust 桥](../../crates/tauri-plugin-hm-speech/src/ios.rs) → [Apple Speech](../../crates/tauri-plugin-hm-speech/ios/Sources/SpeechEngine.swift) | 当前未安装相应驱动 |
| 备份文件 | [BackupDriver](../../crates/hm-runtime/src/platform/backup.rs)、[BackupService](../../crates/hm-application/src/backup.rs) | 复用系统文件驱动，可主动选择 iCloud 云盘 | 桌面复用文件对话框；不是自动同步 |
| 账号登录 | [IdentityDriver](../../crates/hm-runtime/src/platform/identity.rs)、[IdentityService](../../crates/hm-application/src/identity.rs) | [Rust 桥](../../crates/tauri-plugin-hm-identity/src/ios.rs) → [系统授权窗口](../../crates/tauri-plugin-hm-identity/ios/Sources/IdentityPlugin.swift) / [本机钥匙串](../../crates/tauri-plugin-hm-identity/ios/Sources/IdentityCredentials.swift) | 桌面与 Android 暂为 `UnavailableIdentity`，相应驱动待接入 |
| 持续同步 | [SyncDriver / SyncSession](../../crates/hm-runtime/src/platform/sync.rs)、[SyncService](../../crates/hm-application/src/sync.rs) | 新增 [CloudKit Rust 驱动](../../crates/tauri-plugin-hm-cloudkit/src/ios.rs) → [CloudKit 数据库适配](../../crates/tauri-plugin-hm-cloudkit/ios/Sources/CloudDatabase.swift) | 当前使用 `UnavailableSync`；Mac、Windows、Google Drive、OneDrive 驱动待接 |
| 系统通知 | [NotificationDriver](../../crates/hm-runtime/src/platform/agenda.rs)、[NotificationService](../../crates/hm-application/src/agenda/notifications.rs) | [Rust 桥](../../crates/tauri-plugin-hm-agenda/src/ios.rs) → [UserNotifications](../../crates/tauri-plugin-hm-agenda/ios/Sources/AgendaNotifications.swift)，未来通知由系统排程 | [桌面通知驱动](../../src-tauri/src/platforms/desktop/notifications.rs)使用同一用例处理到期即时提醒；Android 未接 |
| 系统日历 | [CalendarDriver](../../crates/hm-runtime/src/platform/agenda.rs)、[CalendarService](../../crates/hm-application/src/agenda/calendar.rs) | 同一 Rust 桥 → [EventKit](../../crates/tauri-plugin-hm-agenda/ios/Sources/AgendaCalendar.swift)，用户选择日程与目标日历后维护单向副本 | 返回不可用；Windows / Mac / Android 日历驱动待接 |

新 CloudKit 插件由 [subsystems/mod.rs](../../src-tauri/src/subsystems/mod.rs) 注册，在平台装配中注入 `NativeDrivers.sync`。查询 `native_sync_provider` 只返回已安装的驱动名称，**不代表容器、登录或同步已可用**。驱动存在、服务已装配、具备发行权限和真实账号验收分别记录。

系统提醒与日历也在同一装配边界注册。公共 [WorkspaceCell](../../crates/hm-application/src/workspace.rs) 在持久化业务变更后释放 Store 锁，再通知[设备日程协调器](../../src-tauri/src/subsystems/agenda/mod.rs)；页面保存、云端应用和备份恢复使用同一机制。授权状态、系统副本 ID 与排程状态留在设备本地。接口和操作边界见[设备日历与通知](../device-calendar-reminders.md)；持续开发须遵循根目录 [AGENTS.md](../../AGENTS.md) 的抽象框架原则。

正文语音输入由公共 [DictationService](../../crates/hm-application/src/dictation.rs) 组合现有 RecordingService 与 SpeechService，复用表中录音及识别驱动。临时音频直接作为流交给识别驱动，不经过材料归档，也不新增平台专属业务逻辑；同一控件用于工作记录、文档和事件说明。生命周期、草稿与平台支持边界见[语音输入与转写](../speech-transcription.md)。

## 同步分层的当前状态

- 核心：[一致快照与逻辑指纹](../../crates/hm-core/src/backup/sync.rs)，不把 SQLite/WAL 放到云盘；本机设置和提醒送达状态不随工作数据同步。
- 通用用例：基于一致版本接续，复用未变的附件块，云端条件更新防止覆盖，并发修改暂停并保留可恢复版本。当前是快照版本原型，尚未实现对象字段级自动合并。
- iOS 驱动：CloudKit 私有数据库、账号绑定检查、record change tag 条件写入、16 MiB 附件分块与校验。Swift 文件包括真实 CloudKit API，测试另外注入内存数据库验证边界；不以模拟账号冒充真实云账号。
- 托管账号：[Supabase 部署与接入](../managed-identity.md)。目录和删除函数已真实部署；新增账号设置 UI、通用用例与 iOS 安全驱动。Apple OAuth 与删除授权撤销凭据已配置，Google/Microsoft 未配置；真实登录与云存储授权未验收。
- 激活：1.8.0（32.1）已在实际 IPA 核验 `AnjianCloudKitContainer` 和 CloudKit Production 权限；默认模拟器/普通构建仍不激活。插件加载和配置查询不访问 CKContainer，用户须单独开启同步。

iPadOS 复用 iOS 驱动。Mac 虽然也有 CloudKit SDK，Tauri 的 iOS Swift 插件桥不能直接当作 Mac 接入，仍需自己的桥接、装配、签名和验收。Windows 后续通过统一端口接 OneDrive/Google Drive 或适用的 CloudKit Web 授权方案，不会自动读取 Apple 私有容器。

## 2026-11-16 验证记录

功能源码 `4b7623685be4bcc0cba688185977a6e3fc7d84f9` 的[应用检查](https://github.com/limushu/new_hm/actions/runs/43870048434)通过 63 项单元/账号测试、126 项 Chromium、17 项 WebKit、Rust 测试/Clippy 及 Windows 构建。[移动检查](https://github.com/limushu/new_hm/actions/runs/43870048265)通过 Android 编译、iOS 应用构建/启动/持久化，以及 22 项原生测试，其中新增 4 项 CloudKit 适配测试。

CloudKit 测试编译真实 SDK 代码，但数据库通过测试适配器替换，验证未配置不访问容器、云账号不符拒绝写入、条件更新/会话失效、索引与 CKAsset 文件处理及原件保留；不代表真实 CloudKit 服务器或多设备验收。未生成声称可用云同步的新 TestFlight，不改变 28.1 的手动备份定位。

账号后端于 2026-11-16 部署到用户提供的 Supabase 项目，权限及原生回调验证见[线上记录](../managed-identity.md#线上部署与验证记录)。账号客户端是此后的改动，不能沿用上面的旧源码 CI 作为其原生验证证据；也不改变 28.1 仍为本机/手动备份版本的事实。

后续账号验证见[原生任务](https://github.com/limushu/new_hm/actions/runs/43979143545)：源码 `bfe8e63` 通过全部 26 项原生测试，包含钥匙串真实读写、项目隔离和清除，以及授权 URL 与迟到回调隔离。同一源码已生成 **1.7.7（31.1）** 并由 Apple 确认为 `VALID` / `IN_BETA_TESTING`。该版本可验收 Apple 账号入口，自动 CloudKit 同步仍未开放，真实登录/删除与跨设备使用需要分别验收。

## 2026-11-17 自动同步候选验证

[宿主同步编排](../../src-tauri/src/subsystems/sync/mod.rs)、[前台调度](../../src/platform/SyncProvider.tsx)和[工作区目录](../../crates/hm-application/src/identity/catalog.rs)现已接通。前台/保存后检查，下载先暂存；没有未保存编辑和未处理音频任务时才应用，并复核本机指纹。退出、恢复备份和退后台使旧同步租约失效。并发修改按整份工作区版本处理，保留双方版本，当前没有字段级自动合并。

客户端/隐私清单源码 `a3d2686` 的[移动检查](https://github.com/limushu/new_hm/actions/runs/43991968234)通过 Android 编译、iOS 构建/启动/持久化和 **27 项原生测试**，其中 CloudKit 5 项。相关[应用检查](https://github.com/limushu/new_hm/actions/runs/43993510190)通过前端、Rust/Clippy 与 Windows 构建。之后的改动为部署/签名工具与文档，不改变被测 Swift 驱动和客户端代码。

用户在 Console 发布 schema 后，[生产配置检查](https://github.com/limushu/new_hm/actions/runs/43994282858)于 01:16:35 UTC 确认 CloudKit Production 的三种记录类型及字段齐全。此检查仅管理数据结构，不读取用户案件，也不替代真实 iCloud 账号的双设备数据往返。1.8.0（32.1）随后通过实际 IPA 权限核验，并由 Apple 确认为 `VALID` / `IN_BETA_TESTING`；真实双设备 QA 仍待验收，见[发布记录](../app-store/README.md)。
