# App Store 首发准备

更新于 2026-11-13。用户确认首发中国大陆、免费无内购，并反馈 10.1 的 iPhone 功能正常。当前尚未向 App Review 提交，也没有改变商店地区、价格或发布状态。

## 可审核资料

- [简体中文商店文案与发布选择](metadata.zh-CN.json)：名称、副标题、描述、关键词、审核说明，地区 CHN，免费，审核通过后手动发布。
- [逐项填写说明](submission-guide.zh-CN.md)：版本、截图、隐私、年龄分级、审核信息与备案待办。
- [隐私政策](../privacy-policy.md)：与应用内设置页共用 [政策源](../../src/content/privacy-policy.json)。
- [使用与支持](support.md)：实际功能、导入导出、录音和数据保留说明，支持入口采用公开项目问题页面。
- [静态支持页](site/index.html)与[静态隐私页](site/privacy.html)：可供后续托管，当前尚未部署为独立站点。商店文案使用仓库中可公开访问的文档 URL；提交前需确认可匿名打开。

执行 `npm run appstore:prepare` 从同一份政策源更新文档和静态页面，`node scripts/prepare-app-store.mjs --check` 检查一致性。

在 Actions 手动运行 [App Store screenshots](../../.github/workflows/app-store-screenshots.yml)，指定已通过移动检查且产品源码未变化的模拟器构建任务。它在新的 iPhone 16 Pro、iPhone 16 Pro Max 与 iPad Pro 13-inch 模拟器上安装真实应用，使用虚构工作区，通过原生界面操作截取各四张 PNG，并与商店文案一起打包到 `app-store-materials-*` Artifact。脚本验证原图尺寸并导出不含 Alpha 通道的 RGB PNG，结果仍需人工检查画面。无需个人 Mac 或 iPad，不会修改用户设备或提交商店审核。

2026-11-13，[截图任务](https://github.com/limushu/new_hm/actions/runs/43408250791)已通过，产出[完整原始素材包](https://github.com/limushu/new_hm/actions/runs/43408250791/artifacts/14029043998)（保留至 2026-12-13）。12 张截图已逐张检查画面，并核对尺寸、RGB 格式和无 Alpha 通道：iPhone 中等显示屏 1206 × 2622、大显示屏 1320 × 2868、13 英寸 iPad 2064 × 2752，各四张。全部使用虚构示例工作区；画面来自实际应用在系统模拟器上的运行，不代表 iPad 真机验收或 Apple 已批准这些素材。下载原始素材包后，上传 `screenshots/` 内对应分组的 PNG，`diagnostics/` 为排查资料，不上传商店。

## 安装包调整与验证

当前候选包为 **1.4.3（11.1）**，源码提交 `2cb9387736aec6508cfb3913b0ad676a258361a5`。2026-11-13 09:19 UTC，[签名构建任务](https://github.com/limushu/new_hm/actions/runs/43399395501)确认 `UPLOAD SUCCEEDED with no errors`。上传成功不等于 Apple 已处理完构建、TestFlight 已可安装或 App Review 已提交。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43399272086)和[移动端检查](https://github.com/limushu/new_hm/actions/runs/43399272031)均通过。iOS 模拟器验证了由内嵌 SQLite 创建的工作区在系统 SQLite 下启动、备份及重开后保留虚构案件和材料字节；录音与系统文件驱动的 10 项原生测试全部通过。正式 IPA 根目录隐私清单、系统 SQLite 链接、签名及项目列出的 required-reason API 检查通过，正式包未检出这些尚未解释的 API 候选项。这些结果不代替新版本在用户真机上的升级验收或 Apple 审核。

2026-11-13 已用不携带登录凭据的请求确认上述公开隐私政策与支持文档 URL 均返回 HTTP 200。

10.1 是可用于分发签名的 1.4.3 构建，已上传 App Store Connect，但真实 IPA 审计显示包内没有 PrivacyInfo.xcprivacy，并同时声明 iPhone 与 iPad（UIDeviceFamily 1、2）。因此本次隐私政策入口与清单需要新构建，不能只修改商店文字。

新增的 [iOS 隐私清单](../../src-tauri/PrivacyInfo.xcprivacy)声明无跟踪、无向开发者收集的数据，以及访问本机/用户选择文件元数据的用途。文件元数据用于归档、预览和本地存储，不用于指纹识别。

10.1 可执行文件还包含由内嵌 SQLite 引入的 statfs/fstatfs 调用；其源码用于文件系统类型和锁行为，不按“显示磁盘容量”随意填写理由。iOS 改为链接 Apple 系统 SQLite，其他平台继续内嵌 SQLite。业务模型和数据库 schema 不因这项链接调整变更，现有 SQLite 文件仍需在新构建中做启动、备份、重开和升级验证。依据：[SQLite 维护者关于系统 SQLite 的建议](https://sqlite.org/forum/info/d404fb0a8b3d9e74)。

[包检查脚本](../../scripts/verify-ios-privacy.py)在模拟器构建和签名 IPA 解包后检查清单位于 app bundle 根目录、内容与源码一致、链接系统 SQLite，并拒绝尚未解释的特定 required-reason API 导入。它是项目检查，不代替 Apple 的完整扫描或隐私审核。用途声明依据 [Apple required-reason API 文档](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)。

调试模拟器会保留未优化的依赖函数，API 导入候选项记录在报告中；正式 IPA 则必须通过候选项审核门槛。两者均验证根目录清单和系统 SQLite 链接，不将调试符号数量作为正式包隐私行为的结论。

[iOS 工程模板](../../src-tauri/ios-project.yml)基于锁定的 Tauri CLI 2.12.3 上游模板，仅增加系统 `libsqlite3.tbd` 链接和根目录隐私资源。升级 CLI 时应同步复核模板；上游 MIT 许可随文件保留。模拟器在首次启动后导入由主机内嵌 SQLite 创建的虚构工作区，再用新应用启动、备份和重开检查案件与材料字节，覆盖链接方式改变后的数据兼容性。

Info.ios.plist 增加不使用非豁免加密的声明：当前应用无自定义加密通信、VPN、端到端加密服务或加密数据库；系统和文件提供器的安全服务由系统实现。后续引入加密能力须重新评估。

## 中国大陆备案：尚未确认适用性

用户目前没有案笺的 App 备案号。免费不自动免除备案要求，TestFlight 分发成功也不代表已具备中国大陆 App Store 上架资格。

[工信部通知](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html)针对境内从事互联网信息服务的 App 主办者；[Apple 的 App 信息说明](https://developer.apple.com/cn/help/app-store-connect/reference/app-information/app-information)说明部分 App 需要有效 ICP 备案信息。当前 iOS 版本无开发者账户系统、广告、开发者云同步或远程内容服务；主要处理用户本机数据，但使用系统文件提供器，支持与隐私文档也有网页地址。不能仅凭“数据在本机”自行认定不适用。

下一步先在 App Store Connect 的「App 信息／中国大陆供应情况」核实要求；如不能明确豁免，通过 Apple Developer 支持说明实际功能，并向主办者住所所在地通信管理局或接入商确认办理路径。若需要备案，应按真实主体办理 App 备案，应用名、iOS 包标识及其他登记信息须与商店一致；网站备案号不能直接替代 App 备案号。工信部规定材料齐全准确后办理时间为二十个工作日，材料补正及 App Store 审核时间另计。

可直接使用的咨询说明：

> 案笺（com.limushu.hm）拟在中国大陆免费上架，用于本机整理案件、日程、用户选择的材料和录音，无需注册登录，不提供开发者运营的云同步、联网内容分发、广告或在线法律咨询。文件选择与导出使用 iOS 系统文件提供器。请确认此类应用在中国大陆 App Store 分发是否要求提供 App 备案号，以及应提交哪些适用性说明或备案材料。

## 提交前仍需完成

1. 确认大陆区备案适用性；需要备案时取得并在 App Store Connect 填写真实 App 备案号。
2. 在 TestFlight 等待 11.1 处理完成并可供测试后，保留现有应用数据直接更新，真机核对原有案件、材料、录音和备份可读取，并确认设置中的隐私政策可以打开。模拟器工作区兼容性检查已通过，真机升级结果尚未确认。
3. 上传已检查的 iPhone 与 iPad 原生截图，按 [Apple 截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)放入对应设备分组。必需的中等显示屏 iPhone 与 13 英寸 iPad 素材均已备齐。
4. App Store Connect 填写版本、类别、年龄分级、内容权利、App 隐私、公开支持/隐私 URL，以及审核联系人电话和邮箱；审核联系资料由用户在 Apple 后台填写，无需公开在仓库。
5. 核对“App 未收集数据”的申报与最终 SDK/服务一致；核对支持链接和隐私文档可以公开访问。
6. 用户审阅资料与最终构建后提交 App Review，发布方式保持手动。审核通过与正式对外发布分别确认。
