# App Store 首发准备

更新于 2026-11-13。用户确认首发中国大陆、免费无内购，并反馈 10.1 的 iPhone 功能正常。当前尚未向 App Review 提交，也没有改变商店地区、价格或发布状态。

## 可审核资料

- [简体中文商店文案与发布选择](metadata.zh-CN.json)：名称、副标题、描述、关键词、审核说明，地区 CHN，免费，审核通过后手动发布。
- [隐私政策](../privacy-policy.md)：与应用内设置页共用 [政策源](../../src/content/privacy-policy.json)。
- [使用与支持](support.md)：实际功能、导入导出、录音和数据保留说明，支持入口采用公开项目问题页面。
- [静态支持页](site/index.html)与[静态隐私页](site/privacy.html)：可供后续托管，当前尚未部署为独立站点。商店文案使用仓库中可公开访问的文档 URL；提交前需确认可匿名打开。

执行 `npm run appstore:prepare` 从同一份政策源更新文档和静态页面，`node scripts/prepare-app-store.mjs --check` 检查一致性。

## 安装包调整与验证

10.1 是可用于分发签名的 1.4.3 构建，已上传 App Store Connect，但真实 IPA 审计显示包内没有 PrivacyInfo.xcprivacy，并同时声明 iPhone 与 iPad（UIDeviceFamily 1、2）。因此本次隐私政策入口与清单需要新构建，不能只修改商店文字。

新增的 [iOS 隐私清单](../../src-tauri/PrivacyInfo.xcprivacy)声明无跟踪、无向开发者收集的数据，以及访问本机/用户选择文件元数据的用途。文件元数据用于归档、预览和本地存储，不用于指纹识别。

10.1 可执行文件还包含由内嵌 SQLite 引入的 statfs/fstatfs 调用；其源码用于文件系统类型和锁行为，不按“显示磁盘容量”随意填写理由。iOS 改为链接 Apple 系统 SQLite，其他平台继续内嵌 SQLite。业务模型和数据库 schema 不因这项链接调整变更，现有 SQLite 文件仍需在新构建中做启动、备份、重开和升级验证。依据：[SQLite 维护者关于系统 SQLite 的建议](https://sqlite.org/forum/info/d404fb0a8b3d9e74)。

[包检查脚本](../../scripts/verify-ios-privacy.py)在模拟器构建和签名 IPA 解包后检查清单位于 app bundle 根目录、内容与源码一致、链接系统 SQLite，并拒绝尚未解释的特定 required-reason API 导入。它是项目检查，不代替 Apple 的完整扫描或隐私审核。用途声明依据 [Apple required-reason API 文档](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)。

Info.ios.plist 增加不使用非豁免加密的声明：当前应用无自定义加密通信、VPN、端到端加密服务或加密数据库；系统和文件提供器的安全服务由系统实现。后续引入加密能力须重新评估。

## 中国大陆备案：尚未确认适用性

用户目前没有案笺的 App 备案号。免费不自动免除备案要求，TestFlight 分发成功也不代表已具备中国大陆 App Store 上架资格。

[工信部通知](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html)针对境内从事互联网信息服务的 App 主办者；[Apple 的 App 信息说明](https://developer.apple.com/cn/help/app-store-connect/reference/app-information/app-information)说明部分 App 需要有效 ICP 备案信息。当前 iOS 版本无开发者账户系统、广告、开发者云同步或远程内容服务；主要处理用户本机数据，但使用系统文件提供器，支持与隐私文档也有网页地址。不能仅凭“数据在本机”自行认定不适用。

下一步先在 App Store Connect 的「App 信息／中国大陆供应情况」核实要求；如不能明确豁免，通过 Apple Developer 支持说明实际功能，并向主办者住所所在地通信管理局或接入商确认办理路径。若需要备案，应按真实主体办理 App 备案，应用名、iOS 包标识及其他登记信息须与商店一致；网站备案号不能直接替代 App 备案号。工信部规定材料齐全准确后办理时间为二十个工作日，材料补正及 App Store 审核时间另计。

可直接使用的咨询说明：

> 案笺（com.limushu.hm）拟在中国大陆免费上架，用于本机整理案件、日程、用户选择的材料和录音，无需注册登录，不提供开发者运营的云同步、联网内容分发、广告或在线法律咨询。文件选择与导出使用 iOS 系统文件提供器。请确认此类应用在中国大陆 App Store 分发是否要求提供 App 备案号，以及应提交哪些适用性说明或备案材料。

## 提交前仍需完成

1. 确认大陆区备案适用性；需要备案时取得并在 App Store Connect 填写真实 App 备案号。
2. 用包含隐私入口、清单与系统 SQLite 的新构建验证 10.1 工作区升级，确认案件、材料、录音和备份可读取。
3. 准备真实 iPhone 和 iPad 界面截图，按 [Apple 截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)上传。浏览器开发预览图不标记为已经完成原生截图验收。
4. App Store Connect 填写版本、类别、年龄分级、内容权利、App 隐私、公开支持/隐私 URL，以及审核联系人电话和邮箱；审核联系资料由用户在 Apple 后台填写，无需公开在仓库。
5. 核对“App 未收集数据”的申报与最终 SDK/服务一致；核对支持链接和隐私文档可以公开访问。
6. 用户审阅资料与最终构建后提交 App Review，发布方式保持手动。审核通过与正式对外发布分别确认。
