# App Store 首发准备

## 当前功能候选：1.7.6（23.1）

新增 iOS 录音结束后的设备内转写，也可在已有音频预览中发起。原录音先保存，识别文字可编辑后保存为关联文档；普通话、英语取决于设备内语言支持，不回退云端。中断或取消保留已识别部分供确认保存。权限及隐私说明同步更新，详见 [转写设计与验证边界](../speech-transcription.md)。联系对象页的新建按钮与标题同行，关系图移入搜索筛选区。

当前版本尚在验证和签名打包；上传、检查与产物核对结果将在完成后更新。审核文案与录屏脚本已切换至 1.7.6（23.1），真机识别质量、视频与 Apple 后台重新提交仍待实际完成。

## 前一修复候选：1.7.5（22.1）

2026-11-16，法院添加修复已随 21.1 上传：先选类型、复用已有目录或新建，允许法院直接加入案件，详见 [对象添加设计](../relationship-design.md)。后续 `7ece8234d276183800072f76c1d1eb6b6dee5023` 将单选、已有对象候选、日期与身份建议统一为选择后收起，触摸设备结束输入，不自动提交整张表单。该修复保持应用版本 1.7.5，构建号增加为 22.1；[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43815544693)已成功，06:24:18 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物并核对源码 `7ece823`、版本 1.7.5、构建 22.1、签名验证状态及根目录隐私清单，上传状态为 `accepted-for-processing`；Apple 处理完成及 TestFlight 可安装状态尚未单独核实。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43815508773)已通过 113 项 Chromium 界面测试、4 项 WebKit 触摸回归、Rust 检查及 Windows 构建；[移动端检查](https://github.com/limushu/new_hm/actions/runs/43815508767)的 Android 编译、iOS 模拟器启动/工作区与原生驱动回归也均通过。自动化检查不代替用户真机验收。

当前文案及录屏脚本已切换为 1.7.5（22.1）。此前交付的 `anjian-app-store-1.7.4.zip` 与下方九张原生截图记录仍属 1.7.4，不要把其中旧版审核备注直接粘贴为本次重提资料。新版本真机验收、录屏、Apple 后台构建替换与重新提交仍未完成。

## 前一候选与已完成素材：1.7.4（20.1）

2026-11-16 早先准备记录：用户确认旧版 **1.4.3（11.1）** 收到 Guideline 2.1 补充信息要求，并决定改用最新主分支重提。当时的候选为 **1.7.4（20.1）**，应用源码提交 `19552e2e9c3e14bd591fd2309ab4d90dda98d0f1`；[签名上传](https://github.com/limushu/new_hm/actions/runs/43796282757)、[移动端检查](https://github.com/limushu/new_hm/actions/runs/43796270094)和[应用检查](https://github.com/limushu/new_hm/actions/runs/43796891598)均已通过。后续法院添加修复见上方 1.7.5 记录。

六项英文审核备注已更新，真机录屏步骤见 [2.1 补充资料](review-response-2.1.zh-CN.md)。视频及其设备、系统资料仍待用户提供；不得保留占位符提交。本文准备工作尚未在 Apple 后台替换构建、重新提交或发布。

本次原生截图已完成采集和逐张检查：[第一批任务](https://github.com/limushu/new_hm/actions/runs/43804027669)完成中等 iPhone，后续设备采集失败；[补采任务](https://github.com/limushu/new_hm/actions/runs/43805961394)完成大屏 iPhone 与 iPad，任务成功。两批均安装上述 `19552e2` 的 1.7.4 模拟器应用。在三组各四张原图中，最终收录每组的 `01-cases.png`、`02-timeline.png`、`04-expenses.png`，共 **9 张**；三张材料页原图因标题、状态或底部区域显示不完整而剔除，未修改图片内容来掩盖问题。采集异常的原因尚未确定，真机验收需要覆盖材料页切换与阅读。

交付包 `anjian-app-store-1.7.4.zip` 包含这 9 张已检查图片、逐字段文案、六项英文 Notes 草稿、真机录屏脚本、虚构样例及来源记录。原始 Actions Artifact 包含排查文件和未通过画面检查的图片，不能整包直接上传；以交付包的 `screenshots/` 和 `reference/visual-review.json` 为准。截图尺寸分别为 1206 × 2622、1320 × 2868、2064 × 2752，均为 RGB PNG；它们不代替苹果此次要求的真机录屏或真机验收。

## 可审核资料

- [简体中文商店文案与发布选择](metadata.zh-CN.json)：名称、副标题、描述、关键词、审核说明，地区 CHN，免费，审核通过后手动发布。
- [逐项填写说明](submission-guide.zh-CN.md)：版本、截图、隐私、年龄分级、审核信息与备案待办。
- [隐私政策](../privacy-policy.md)：与应用内设置页共用 [政策源](../../src/content/privacy-policy.json)。
- [使用与支持](support.md)：实际功能、导入导出、录音和数据保留说明，支持入口采用公开项目问题页面。
- [静态支持页](site/index.html)与[静态隐私页](site/privacy.html)：可供后续托管，当前尚未部署为独立站点。商店文案使用仓库中可公开访问的文档 URL；提交前需确认可匿名打开。

执行 `npm run appstore:prepare` 从同一份政策源更新文档和静态页面，`node scripts/prepare-app-store.mjs --check` 检查一致性。

在 Actions 手动运行 [App Store screenshots](../../.github/workflows/app-store-screenshots.yml)，指定已通过移动检查且产品源码未变化的模拟器构建任务。它在新的 iPhone 16 Pro、iPhone 16 Pro Max 与 iPad Pro 13-inch 模拟器上安装真实应用，使用虚构工作区，通过原生界面操作截取各四张 PNG，并与商店文案一起打包到 `app-store-materials-*` Artifact。脚本验证原图尺寸并导出不含 Alpha 通道的 RGB PNG，结果仍需人工检查画面。无需个人 Mac 或 iPad，不会修改用户设备或提交商店审核。

历史 1.4.3 素材（新版须更换）：2026-11-13，[截图任务](https://github.com/limushu/new_hm/actions/runs/43408250791)已通过，产出[完整原始素材包](https://github.com/limushu/new_hm/actions/runs/43408250791/artifacts/14029043998)（保留至 2026-12-13）。12 张截图已逐张检查画面，并核对尺寸、RGB 格式和无 Alpha 通道：iPhone 中等显示屏 1206 × 2622、大显示屏 1320 × 2868、13 英寸 iPad 2064 × 2752，各四张。全部使用虚构示例工作区；画面来自实际应用在系统模拟器上的运行，不代表 iPad 真机验收或 Apple 已批准这些素材。下载原始素材包后，上传 `screenshots/` 内对应分组的 PNG，`diagnostics/` 为排查资料，不上传商店。

## 历史安装包调整与验证（1.4.3）

当时的候选包为 **1.4.3（11.1）**，源码提交 `2cb9387736aec6508cfb3913b0ad676a258361a5`。2026-11-13 09:19 UTC，[签名构建任务](https://github.com/limushu/new_hm/actions/runs/43399395501)确认 `UPLOAD SUCCEEDED with no errors`。上传成功不等于 Apple 已处理完构建、TestFlight 已可安装或 App Review 已提交。

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

## 本次重新提交的待办

1. 确认修复版上传处理完成，在 TestFlight 使用 1.7.6（23.1）完成实际支持设备上的主要流程验收，包含法院新建、已有档案复用、选择后收起、原录音保存与设备内转写；仅记录真实完成的测试。
2. 按 [2.1 录屏脚本](review-response-2.1.zh-CN.md) 录制从启动开始的真机演示，补全视频、设备和系统资料。
3. 商店画面应与提交版本一致；已有 1.7.4 原生素材须逐张确认对应页面在 1.7.6 中仍一致，变化页面应重采。模拟器素材与真机演示分别标注来源。
4. 在 Apple 后台更新商店版本、构建、六项 Notes 和真实审核联系人，核对隐私、年龄分级与中国大陆供应要求。
5. 核对支持和隐私链接可公开访问，保持免费、手动发布。重新提交审核和正式对外发布由用户在后台执行。
