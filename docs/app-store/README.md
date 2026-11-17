# App Store 首发准备

## 当前备份与图标修复内测：1.8.4（37.2）

修复 iOS 更新后遗留旧沙盒绝对路径导致的自动/手动备份权限错误。公共应用层按当前工作区解析托管目标，桌面自选备份位置仍受尊重；成功日期仅在完整快照完成后更新。数据、材料和历史备份保持原位，见[备份子系统](../backup-subsystem.md)。实际 AppIcon 已换为仓库的 HM 品牌素材；手写 8 仍为[设计预览](../design/current/brand-8-concept-2026-11-17.png)，未进入这个安装包。保留前版的全屏、贴底操作栏和自选强调色。

2026-11-17，[签名与上传第 2 次尝试](https://github.com/limushu/new_hm/actions/runs/44049974928/attempts/2)于 09:13:01 UTC 明确确认 `UPLOAD SUCCEEDED with no errors`；[独立状态查询](https://github.com/limushu/new_hm/actions/runs/44054213570)于 09:17:35 UTC 确认 `processingState=VALID`、`internalBuildState=IN_BETA_TESTING`、`readyForInternalTesting=true`。构建 ID `7ff0fefe-4511-448e-b349-6ed01baa6882`，内部测试员可更新；没有重新提交 App Review 或发布 App Store。

实际 IPA 源码 `5a92f3ec74d325bec46413095d226a089d02849c`，版本 1.8.4 / 37.2，Xcode 26.3（17C529）/ SDK 26.2。已下载核对包名、启动屏、麦克风/识别/日历用途说明、根隐私清单及实际 Mach-O 分发权限，CloudKit 保持 `Production`。解码实际 iPhone/iPad AppIcon PNG，确认不含透明像素，品牌像素比较误差均为 0；所有生成目录槽位（包括 1024px 商店图）在构建前转换为无 Alpha 通道的 RGB。IPA SHA-256：`c36ad5436c7d61c6429faa4c2ba4caf0b3602a558bb2446055d92a98995f9159`。

[同一源码应用检查](https://github.com/limushu/new_hm/actions/runs/44049973907)通过 Rust/Clippy、Windows 构建、87 项前端单元测试、144 项 Chromium 和 35 项 WebKit 回归；[移动检查](https://github.com/limushu/new_hm/actions/runs/44049973910)通过 Android 编译、iOS 升级工作区持久化、旧备份地址修复及快照 SHA-256 检查、实际 App 四标签贴底验收和 34 项原生测试。模拟器窗口 414×896pt，创建按钮距底部 34pt；这些结果不替代用户真机升级后的实际备份验收。

早先 36.1 的上传被 Apple 因图标 Alpha 通道拒绝，不能安装；后续补充 RGB 格式检查及明确上传成功回执校验。37.1 在签名导出时遇到 Apple SSL 错误，同一源码重试形成上述 37.2。以独立 Apple 状态和实际 IPA 为交付依据。

## 前一外观与全屏内测：1.8.3（35.1）

案件“录音 / 创建 / 查找”操作栏保持贴底，短内容不再上浮；背景覆盖完整窗口，控件按设备安全区避让。设置 → 外观 → 强调色支持六种预设、自选颜色和恢复默认，并自动调整深浅主题的可读性。实现边界见[外观与全屏布局](../design/appearance-layout.md)。

2026-11-17，[签名与上传](https://github.com/limushu/new_hm/actions/runs/44038105739)于 07:29:32 UTC 确认 `UPLOAD SUCCEEDED`；[独立状态检查](https://github.com/limushu/new_hm/actions/runs/44039430780)于 07:32:20 UTC 确认 `processingState=VALID`、`internalBuildState=IN_BETA_TESTING`、`readyForInternalTesting=true`。构建 ID `5ee95bc0-dd50-4376-a4ab-45a172b4cbf3`，内部测试员可安装；未重新提交 App Review 或发布 App Store。

实际 IPA 源码 `96f8db3c3e730d87ddaa230b0256f4b94a86b917`，Xcode 26.3（17C529）/ SDK 26.2。已下载核对 1.8.3 / 35.1、启动屏、麦克风/识别/日历用途说明、根隐私清单及实际 Mach-O 分发权限，CloudKit 保持 `Production`。IPA SHA-256：`5a6dc29c8740ffa43db392aacf898bae339d676f3a11b31da46566e3b533218c`。

[归档源应用检查](https://github.com/limushu/new_hm/actions/runs/44037946001)通过 Rust、Windows、82 项前端单元测试、144 项 Chromium 和 35 项 WebKit 回归。初版原生 UI 探针误读测试运行器自身的兼容屏幕尺寸，随后仅修正验收代码：[正式 App 复测](https://github.com/limushu/new_hm/actions/runs/44040310007)在产品源码一致性检查后复用同一模拟器应用，实测窗口 414×896pt，四个案件标签下创建按钮距底部均为 34pt；5 张原生截图已逐张查看。另有[原生驱动检查](https://github.com/limushu/new_hm/actions/runs/44040314416)通过 34 项 SDK 测试。截图使用隔离虚构数据，不作为真机验收或审核视频。

35.1 实际仍打包了 Tauri 默认图标；iOS 旧沙盒绝对备份路径也可能在更新后失效。这两项已由上方 1.8.4（37.2）修复，不能把 35.1 视为包含这些修复。

## 前一正文语音输入内测候选：1.8.2（34.1）

工作记录的记录内容、新建文档正文，以及关键事件/节点的说明增加共用“语音输入”入口：说完点击“结束并转文字”，普通话设备内识别完成后追加到最新草稿，再核对并保存。识别期间的手动编辑保留；部分识别和超出字段限制的文字先供用户核对或精简。临时录音不创建案件材料，保存后的正文沿用原有业务和同步规则。录音与识别由公共用例组合，复用现有 iOS 驱动，操作细节见[语音输入与转写](../speech-transcription.md)。

2026-11-17，[签名与上传](https://github.com/limushu/new_hm/actions/runs/44020194318)成功，05:03:30 UTC Apple 确认 `UPLOAD SUCCEEDED with no errors`。第一次状态查询未成功，[独立只读检查](https://github.com/limushu/new_hm/actions/runs/44021476933)于 05:04:59 UTC 确认 `processingState=VALID`、`internalBuildState=IN_BETA_TESTING`、`readyForInternalTesting=true`；构建 ID `f8b09e57-d654-4f2e-93f4-9d1001de1609`，当前内部测试员可安装。没有重新提交 App Review 或发布 App Store。

实际 IPA 源码 `6691007c94d51443460aedb8d86aa464cb1ab441`，Xcode 26.3（17C529）/ iOS SDK 26.2。已下载并核对包名、1.8.2 / 34.1、麦克风与识别用途说明中的正文草稿用途、日历用途说明及包根隐私清单。实际 Mach-O 签名包含 `application-identifier=UN356US9WL.com.limushu.hm`、容器 `iCloud.com.limushu.hm`、服务 `[CloudKit]`、环境 `Production`、`get-task-allow=false`；保留 iCloud 同步能力。CI 严格分发签名、生产 schema 和发行隐私 API 检查通过。IPA SHA-256：`1b020ce0d02b131173002a74dcf71895c441835ddc71bee426a27e9986eba4aa`。

[同一源码应用检查](https://github.com/limushu/new_hm/actions/runs/44020185347)通过 Rust 测试/Clippy、Windows 构建、80 项前端单元测试、141 项 Chromium 与 32 项 WebKit 回归；[移动检查](https://github.com/limushu/new_hm/actions/runs/44020185601)通过 Android 编译、iOS 构建/启动/工作区持久化和 31 项原生测试。公共层新增 6 项语音输入测试，覆盖资源交接、失败重试、拒绝授权、识别槽位互斥和迟到清理。界面桥接测试验证追加最新草稿、保存前不建业务记录或材料、部分采用、长度限制及三个正文入口复用。

真实麦克风/语音授权、普通话识别质量、较长输入与后台中断仍需在签名 iPhone 上验收；隔离驱动和模拟桥输出不替代实际 Apple 模型。建议先用虚构工作记录说十几秒，核对追加、修改和保存，再测试取消及权限拒绝。

## 前一设备日程内测候选：1.8.1（33.1）

新增按需授权的 iOS 系统提醒，以及已保存日程的“添加到系统日历”入口。用户选择目标日历后维护单向副本，案笺内改期/删除会协调更新；系统日历修改暂不回传。拒绝权限仍保存业务日程。清单选中日期的主题底色改为数字后的 32×32 圆角块，星期留在上方，保留整格点击区域。原有可选 iCloud 同步保留。

2026-11-17，[签名与上传](https://github.com/limushu/new_hm/actions/runs/44008057160)成功，03:16:21 UTC Apple 确认 `UPLOAD SUCCEEDED with no errors`。归档后的第一次状态查询未成功，[独立只读检查](https://github.com/limushu/new_hm/actions/runs/44009195927)于 03:18:11 UTC 确认 `processingState=VALID`、`internalBuildState=IN_BETA_TESTING`、`readyForInternalTesting=true`；构建 ID `c90946b0-7776-45d4-9f12-488e097f5ebe`，当前内部测试员可安装。没有重新提交 App Review 或发布 App Store。

产物源码 `e5bb72eda19a22b673d3009d996e5de331ee526f`，Xcode 26.3（17C529）/ iOS SDK 26.2。已下载实际 IPA，核对包名、1.8.1 / 33.1、两项日历用途说明、包根隐私清单与 Mach-O 签名权限：`application-identifier=UN356US9WL.com.limushu.hm`、容器 `iCloud.com.limushu.hm`、服务 `[CloudKit]`、环境 `Production`、`get-task-allow=false`。CI 严格分发签名、生产 schema 和发行隐私 API 检查通过；IPA SHA-256：`d0a41c42e0e12b1261fb8903a5bbe5f9aad94c1c7b58cba1471018c44c15ce92`。

[同一源码应用检查](https://github.com/limushu/new_hm/actions/runs/44006712139)通过公共 Rust 测试/Clippy、Windows 构建、77 项前端单元测试、135 项 Chromium 与 26 项 WebKit 回归；[移动检查](https://github.com/limushu/new_hm/actions/runs/44006712127)通过 Android 编译、iOS 构建/启动/持久化和 31 项原生测试。日期布局另核对四档宽度、深浅主题共 8 组，无页面横向溢出。真实锁屏提醒、系统日历写入与权限切换仍需在签名真机验收；原生测试使用隔离适配器，不替代这些实测。

公共规则与驱动边界见[设备日历与通知](../device-calendar-reminders.md)、[平台驱动表](../design/platform-driver-map.md)；长期抽象原则已写入根目录 [AGENTS.md](../../AGENTS.md)。桌面到期通知也复用公共用例，Windows/Mac/Android 系统日历驱动尚未接入。系统副本标识和权限保留本机，不加入案件同步或备份。

## 前一 iCloud 内测候选：1.8.0（32.1）

2026-11-17，[签名与上传](https://github.com/limushu/new_hm/actions/runs/43994035376)成功，01:26:40 UTC Apple 确认 `UPLOAD SUCCEEDED with no errors`。[独立只读状态检查](https://github.com/limushu/new_hm/actions/runs/43996117624)于 01:30:53 UTC 确认 `processingState=VALID`、`internalBuildState=IN_BETA_TESTING`、`readyForInternalTesting=true`；构建 ID `1f280fd7-e3aa-432f-b6c1-2e14bce7f848`，可供当前内部测试员安装。没有重新提交 App Review 或发布 App Store。

产物源码 `947631f41410e404c51b66480235eddcbfe615c4`，Xcode 26.3（17C529）/ iOS SDK 26.2。已下载 ZIP/IPA，核对 `com.limushu.hm`、版本 1.8.0、构建 32.1、Info.plist 中容器，以及 Mach-O 实际签名 entitlement：`application-identifier=UN356US9WL.com.limushu.hm`、容器 `iCloud.com.limushu.hm`、服务 `[CloudKit]`、环境 `Production`、`get-task-allow=false`。CI 另通过严格分发签名和包根隐私清单检查；发行二进制未发现未声明的受检 API 候选。IPA SHA-256：`dc7d275e19f24ca1a303327c53cbd891d066a6a75df6d58a720c12bae2f5fea3`。

新增可选 iCloud 自动同步：先在“设置 → 案笺账号”登录，再单独点击“开启 iCloud 同步”。首期用于同一案笺身份和同一系统 iCloud 账号的 iPhone / iPad；前台启动、保存后及周期检查同步案件、人员、关系、日程、收支、材料和录音。离线保留本机修改；编辑、录音或转写尚未处理时等待接收；并发修改保留双方完整版本并由用户选择，当前没有字段级自动合并。暂停、退出账号和恢复备份会停止后续自动同步。后台、锁屏和强制退出不保证即时传输，Windows / Mac 云驱动未开放。

[移动检查](https://github.com/limushu/new_hm/actions/runs/43991968234)通过对应客户端/Swift 驱动的 iOS 构建、启动、持久化和 27 项原生测试（CloudKit 5 项），以及 Android 编译；[发行源码应用检查](https://github.com/limushu/new_hm/actions/runs/43993510190)通过前端、Rust/Clippy 和 Windows 构建。[CloudKit Production schema](https://github.com/limushu/new_hm/actions/runs/43994282858)已经导出验证。真实 Apple 登录、个人 iCloud 传输与双设备数据往返仍需用户在签名候选上验收；模拟器和隔离数据库测试不替代这些实测。

建议使用虚构案件在两台设备测试：第一台开启并等待“已同步”，第二台以相同两个账号开启，检查案件、人员、收支和附件；再测试一项编辑、一份录音和断网补传。若第二台已有不同内容，应显示版本选择，不应直接覆盖。同步规则与分层见[跨设备同步](../cross-device-sync.md)。

## 前一账号内测候选：1.7.7（31.1）

新增「设置 → 案笺账号」，通过通用账号用例与 iOS 系统授权窗口/钥匙串接入托管身份；本项目当前已配置 Apple 登录，Google/Microsoft 尚未配置。登录、绑定、解绑、退出及显式确认删除都有客户端入口；真实 Apple 登录与删除仍需用户在 iPhone 上验收。本机案件可继续离线使用，自动 iCloud 同步尚未开放。

2026-11-16，[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43979292574)成功。23:34:01 UTC 确认 `UPLOAD SUCCEEDED with no errors`；23:35:46 UTC 从 Apple API 读到 `processingState=VALID`、`internalBuildState=IN_BETA_TESTING`，已进入内部测试。已下载产物核对源码 `bfe8e63eccaea78e36274a633dcfb09e221e7eb7`、版本 1.7.7、构建 31.1、分发签名、`anjian` 回调 scheme 和包根隐私清单。Xcode 26.3 / iOS SDK 26.2；IPA SHA-256：`8241acd93126c06fc7baa54efaa9942dd736b7d11263e463f4101a0a47d2dfe9`。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43979143538)通过前端、Rust/Clippy 和 Windows 构建。[同一源码的移动验证](https://github.com/limushu/new_hm/actions/runs/43979143545)通过 Android 编译、iOS 构建、启动、数据持久化和全部 26 项原生测试，包括真实系统钥匙串的读写、替换、项目隔离、删除，以及授权 URL/迟到回调边界。签名产物再次验证了更新后的隐私清单。

建议从 TestFlight 更新后先测试 Apple 登录、退出和重启后会话状态，确认本机案件保留；账号删除先使用专门的测试账号验证。新的账号隐私声明已覆盖用户标识、邮箱和姓名，用于 App 功能、与用户关联、不跟踪。现有审核视频、旧构建 Notes 与商店隐私问卷需按实际新功能更新后再重提 App Review。

## 前一备份候选：1.7.7（28.1）

此构建仅提供手动备份文件传输，尚未实现用户后续明确要求的 iCloud 跨设备持续同步。完整工作区 ZIP 备份通过通用备份子系统导出，并可经 iOS 系统文件保存到 iCloud 云盘。恢复先校验、显示摘要并显式确认，保留恢复前副本和目标设备的路径/设置。云盘上传由系统文件提供器处理，手动备份不等于自动同步。设计和验证边界见[备份子系统](../backup-subsystem.md)。

2026-11-16，[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43859095673)成功，11:41:12 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物并核对源码 `7e93359a4e0574470e0189eda3aa41197238c7c3`、版本 1.7.7、构建 28.1、分发签名检查状态、麦克风/语音识别权限与根目录隐私清单。IPA SHA-256：`a968775ce85dc047d0c6aa3a322b799e4c7644a5b9b8227fe9b5e2df7aa8750a`。上传状态为 `accepted-for-processing`，Apple 处理完成及 TestFlight 可安装状态尚未单独核实。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43859057615)通过 53 项单元测试、126 项 Chromium 界面回归、17 项 WebKit 触摸回归、Rust 测试与 Clippy、Windows 构建。[移动端检查](https://github.com/limushu/new_hm/actions/runs/43859057553)通过 Android 编译、iOS 模拟器启动/工作区持久化及 18 项原生驱动测试。本机完成隔离工作区 ZIP 往返、关系/收支/材料恢复、原音频字节核对、本机设置保留、恢复前副本、篡改拒绝、可替换内存驱动与令牌确认测试；另核对四档宽度和深浅主题共 8 组布局，新入口统一 44px 高且无横向溢出。

真实 iCloud 账号上传/下载和物理设备恢复仍需真机验收；自动化和模拟器不替代这些实测，未重新提交 App Review 或发布 App Store。

## 前一清单候选：1.7.7（27.1）

清单日期栏为今天添加主题色描边，选中日期沿用填充色；移除清单顶部独立的今天和前后切换，不新增日期选择入口。点击已有的底部/侧栏「今天」导航返回当天，时间表视图也可重新定位当前时间。月、周、日视图保留原有日期浏览操作。

2026-11-16，[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43852211681)成功，10:59:07 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物并核对源码 `bf37ed56b853f64ebc5aab50f4ccf8132d4eb09b`、版本 1.7.7、构建 27.1、分发签名检查状态、权限说明与根目录隐私清单。IPA SHA-256：`229752724131cd0f077ffcca894a773b9e4e1317e3e6d34213789d4dc1c5cac4`。上传状态为 `accepted-for-processing`，尚未单独核实 Apple 处理完成或 TestFlight 可安装状态。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43851497307)通过 53 项单元测试、124 项 Chromium 界面回归、15 项 WebKit 触摸回归、Rust 测试与 Clippy、Windows 构建。[移动端检查](https://github.com/limushu/new_hm/actions/runs/43851497525)通过 Android 编译、iOS 模拟器启动/持久化验收及 18 项原生驱动测试。本机另通过 12 项日程/时间表/导航回归，并在五档宽度、深浅主题共 10 组组合中核对今天描边、选择填充、已有导航返回当天与无横向溢出。浏览器及模拟器检查不代替真实 iPhone 验收或审核视频；本次未执行 App Review 重新提交或对外发布。

## 前一布局候选：1.7.7（26.1）

手机日历页将新建日程移到顶部日期标题旁，今天及前后切换移到下一行，保持统一按钮规格。清单、月、周、日视图沿用这一顺序，其他辅助操作仍保留。

2026-11-16，[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43843670189)成功，10:04:52 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物，核对源码 `baa0d42ca600237277348619100617e0278a9358`、版本 1.7.7、构建 26.1、分发签名检查状态、权限说明与根目录隐私清单。IPA SHA-256：`35d7b1561bb3fe02a62f5ea9967f78ffc587cf91367dd7d829a846a91cb4cbdf`。上传状态为 `accepted-for-processing`；Apple 处理完成与 TestFlight 可安装状态尚未单独核实。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43842858790)通过 53 项单元测试、122 项 Chromium 界面测试、13 项 WebKit 触摸回归、Rust 测试与 Clippy、Windows 构建。[移动端检查](https://github.com/limushu/new_hm/actions/runs/43842858838)通过 Android 编译、iOS 模拟器启动/持久化验收与 18 项原生驱动测试。本机另通过五项日程回归，并核对四个手机宽度、深浅主题、四种日历视图共 32 组组合，主按钮保持 44px，位于日期标题第一行，今天与前后切换在下一行，未见页面横向溢出。

此构建包含下方 25.1 的统一对象详情。自动化与浏览器预览不代替真实 iPhone 验收、审核视频或 App Review；本次未执行商店重新提交或对外发布。

## 前一交互候选：1.7.7（25.1）

时间轴条目统一进入对象详情，录音播放器与文本正文在页内显示，不再自动叠加预览；明确点击全屏预览才切换，返回详情后仍是原对象。省略号打开操作菜单，标签与重要程度在同一详情内明确保存或取消；自定义属性与关联入口保留。文档、工作记录、节点、日程、费用和联系人通过各自的内容与编辑适配器复用同一容器。见 [对象详情交互](../object-details.md)。

2026-11-16，[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43838341904)成功，09:26:31 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物并核对源码 `de2a3866d9ef1cba0f57dbf71894ba79deb28bff`、版本 1.7.7、构建 25.1、分发签名检查状态、麦克风及语音识别用途声明、根目录隐私清单。IPA SHA-256：`f3a2189d8acaa8cc8b503f132be6601d5be2c7b3df4636057622802ffb84aab2`。上传报告为 `accepted-for-processing`；Apple 处理完成及 TestFlight 可安装状态尚未单独核实。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43837325425)通过 53 项单元测试、122 项 Chromium 界面测试、13 项 WebKit 触摸回归、Rust 测试与 Clippy、Windows 构建。[移动端检查](https://github.com/limushu/new_hm/actions/runs/43837325172)通过 Android 编译、iOS 模拟器启动/工作区持久化及 18 项原生驱动测试。新增回归使用真实 WAV 验证页内播放和离开时暂停，覆盖信息取消/保存后保留自定义属性、全屏返回、关联导航与回收确认；另用虚构 PDF 核对页内渲染、明确全屏放大及返回详情。浅色模式下完成 320/390/430px 和桌面宽度核对，并检查手机深色录音详情，未见详情横向溢出。

上述自动化与浏览器截图不作为真机验收或审核视频。真实 iPhone 交互、语音识别质量、审核视频与 App Review 重新提交仍需实际完成。

## 前一界面候选：1.7.6（24.2）

统一页面主操作按钮：新建日程、新建案件、新建对象使用同一个组件，44px 高、14px 字号、18px 图标、8px 圆角和相同主题色；案件按钮不再只写“新建”。弹窗保存/取消、材料、录音与更新操作复用同一基础规格，移除分散在页面中的尺寸、配色覆盖。规范见 [按钮设计](../design/buttons.md)。

本次包含下方 23.1 的录音转写功能，保持应用版本 1.7.6，增加构建号为 24.2。24.1 在完整回归中发现按钮图标判定引起的窄页溢出，已取消该构建流程，不作为验收候选；24.2 修正判定并按统一悬停色更新测试。

2026-11-16，[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43830835466)成功，08:34:00 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物并核对源码 `5b5424aa6abba9de8aeec21e2c277260514c618d`、版本 1.7.6、构建 24.2、分发签名检查状态、麦克风及语音识别用途声明与根目录隐私清单。IPA SHA-256：`2a616b7497a95285cbbf72f0be38abbc33e6680bb820af6ef90aca7b87add3b6`。报告为 `accepted-for-processing`，尚未单独核实 Apple 处理完成或 TestFlight 可安装状态；使用 24.2 作为本次验收候选。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43830834554)通过 53 项前端单元测试、118 项 Chromium 界面测试、9 项 WebKit 触摸回归、Rust 测试及 Clippy、Windows 构建。[移动端检查](https://github.com/limushu/new_hm/actions/runs/43830834691)通过 Android 编译、iOS 模拟器启动/持久化验收及 18 项原生驱动回归。本机另完成 320/390/430px 与桌面、深浅主题的 24 次尺寸核对，三处手机主按钮均为 112×44px；材料页窄屏与录音失败重试回归通过。浏览器测量及模拟器自动化不代替 iPhone 真机验收。审核文案与录屏脚本已更新到 24.2；真机识别质量、视频和 Apple 后台重新提交仍需实际完成。

## 前一功能候选：1.7.6（23.1）

新增 iOS 录音结束后的设备内转写，也可在已有音频预览中发起。原录音先保存，识别文字可编辑后保存为关联文档；普通话、英语取决于设备内语言支持，不回退云端。中断或取消保留已识别部分供确认保存。权限及隐私说明同步更新，详见 [转写设计与验证边界](../speech-transcription.md)。联系对象页的新建按钮与标题同行，关系图移入搜索筛选区。

2026-11-16，[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43826173785)成功，07:53:44 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物并核对应用源码 `060a4d683ac6aa2813dc71465da145c7628b4718`、版本 1.7.6、构建 23.1、麦克风及语音识别用途声明、分发签名检查状态与根目录隐私清单。上传报告为 `accepted-for-processing`；Apple 处理完成及 TestFlight 可安装状态尚未单独核实。

IPA SHA-256：`9e6f8f18b1b0edbb4c97e44a22d2b092873f75e805e99cf2f200989f4e9a0ae8`。后续提交 `9b11461` 仅修正关系图回归等待实际尺寸的时序，并缩短审核备注，未改变应用代码。[应用检查](https://github.com/limushu/new_hm/actions/runs/43826792611)已通过 53 项前端单元测试、118 项 Chromium 界面测试、9 项 WebKit 触摸测试、Rust 测试及 Clippy、Windows 构建。[移动端检查](https://github.com/limushu/new_hm/actions/runs/43826172915)的 Android 编译、iOS 模拟器启动与持久化验收、18 项原生驱动测试均通过，其中 8 项覆盖转写策略、音频转换与任务生命周期。识别输出使用注入引擎；这些结果不代替真实 iPhone 识别效果或支持设备的真机验收。该次审核文案与录屏脚本曾切换至 1.7.6（23.1），现已由上方 24.2 更新；真机识别质量、视频与 Apple 后台重新提交仍待实际完成。

## 前一修复候选：1.7.5（22.1）

2026-11-16，法院添加修复已随 21.1 上传：先选类型、复用已有目录或新建，允许法院直接加入案件，详见 [对象添加设计](../relationship-design.md)。后续 `7ece8234d276183800072f76c1d1eb6b6dee5023` 将单选、已有对象候选、日期与身份建议统一为选择后收起，触摸设备结束输入，不自动提交整张表单。该修复保持应用版本 1.7.5，构建号增加为 22.1；[签名构建与上传](https://github.com/limushu/new_hm/actions/runs/43815544693)已成功，06:24:18 UTC 确认 `UPLOAD SUCCEEDED with no errors`。已下载产物并核对源码 `7ece823`、版本 1.7.5、构建 22.1、签名验证状态及根目录隐私清单，上传状态为 `accepted-for-processing`；Apple 处理完成及 TestFlight 可安装状态尚未单独核实。

[应用检查](https://github.com/limushu/new_hm/actions/runs/43815508773)已通过 113 项 Chromium 界面测试、4 项 WebKit 触摸回归、Rust 检查及 Windows 构建；[移动端检查](https://github.com/limushu/new_hm/actions/runs/43815508767)的 Android 编译、iOS 模拟器启动/工作区与原生驱动回归也均通过。自动化检查不代替用户真机验收。

该次文案及录屏脚本曾切换为 1.7.5（22.1），现已由上述 1.7.6 候选更新。此前交付的 `anjian-app-store-1.7.4.zip` 与下方九张原生截图记录仍属 1.7.4，不要把其中旧版审核备注直接粘贴为本次重提资料。新版本真机验收、录屏、Apple 后台构建替换与重新提交仍未完成。

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

1. 确认修复版上传处理完成，在 TestFlight 使用 1.7.7（27.1）完成实际支持设备上的主要流程验收，包含法院新建、已有档案复用、选择后收起、原录音保存与设备内转写；仅记录真实完成的测试。
2. 按 [2.1 录屏脚本](review-response-2.1.zh-CN.md) 录制从启动开始的真机演示，补全视频、设备和系统资料。
3. 商店画面应与提交版本一致；已有 1.7.4 原生素材须逐张确认对应页面在 1.7.6 中仍一致，变化页面应重采。模拟器素材与真机演示分别标注来源。
4. 在 Apple 后台更新商店版本、构建、六项 Notes 和真实审核联系人，核对隐私、年龄分级与中国大陆供应要求。
5. 核对支持和隐私链接可公开访问，保持免费、手动发布。重新提交审核和正式对外发布由用户在后台执行。
