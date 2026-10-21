# iOS 构建、签名与 TestFlight

本流程把模拟器验证与 iPhone 分发分开。付费会员开通后仍需将 Apple 团队、应用记录和签名权限接到 CI；目前不表示已完成签名或已有可安装测试版。

## 模拟器构建

[移动工作流](../.github/workflows/mobile.yml)在 macOS 上执行 npm run ios:verify：生成 Xcode 工程，构建当前 runner 架构的完整模拟器应用，在全新 iPhone 模拟器安装并启动，检查 SQLite 完整性、前台备份和重启持久化，最后保存两张截图、验证报告和 app.zip。

截图采用隔离模拟器；第二次启动前直接设置欢迎完成标记作为测试夹具，不代表已经通过按钮点击或业务表单原生 UI 自动化。该流程不访问个人手机、账号或业务工作区。

Actions 产物名为 ios-simulator-运行编号-尝试编号，可下载查看截图与 verification.json。其中 app.zip 只能用于 macOS 的 iOS 模拟器，不能直接在 iPhone 安装。

生成的 src-tauri/gen/apple 不提交，CLI 版本由 package-lock.json 锁定。模拟器检查无需 Apple 凭据。

## 一次性账号接入

### 1. 确认会员和 Team ID

在 [Apple 开发者账户](https://developer.apple.com/account/)确认 Apple Developer Program 已激活，并在会员信息中取得 10 位 Team ID。Apple 账户本身、免费开发者注册和付费会员资格是不同状态。项目已配置提供的 Team ID：UN356US9WL；这不是会员激活或签名授权的证明。

### 2. 创建 App Store Connect 应用记录

在 [App Store Connect](https://appstoreconnect.apple.com/)登录并完成待接受的协议。在 Apple 开发者后台登记明确的 App ID，Bundle ID 为 com.limushu.hm；然后在 App Store Connect 的“我的 App”新增 iOS 应用，选择该 Bundle ID、中文主要语言和自己的唯一 SKU。

若此 Bundle ID 不可用，先处理 iOS 标识选择，不直接改动现有 Windows 安装身份。TestFlight 使用的应用记录和构建包 Bundle ID 必须一致。

### 3. 创建团队 API 密钥

在 App Store Connect 的“用户和访问”→“集成”→“App Store Connect API”创建团队 API 密钥，取得 Key ID、Issuer ID 和下载的 .p8 私钥。若页面要求先申请 API 访问，由账户持有人完成申请。

密钥需能上传构建，并让 Xcode 访问该团队的签名资源。优先按 App Manager 等所需角色配置；实际证书/描述文件权限和云管理签名是否可用，须由第一次签名构建确认，不预先宣称成功。

### 4. 配置 GitHub 环境

打开仓库 [Settings → Environments](https://github.com/limushu/new_hm/settings/environments)，创建 ios-testflight 环境，添加：

| 类型          | 名称                  | 值                                             |
| ------------- | --------------------- | ---------------------------------------------- |
| 可选 Variable | APPLE_TEAM_ID         | 覆盖项目默认的 UN356US9WL；不填则读取 iOS 配置 |
| Secret        | APPLE_API_KEY         | App Store Connect Key ID                       |
| Secret        | APPLE_API_ISSUER      | App Store Connect Issuer ID                    |
| Secret        | APPLE_API_PRIVATE_KEY | 下载的 .p8 文件完整文本，保留换行              |

私钥、Apple 密码、验证码和恢复密钥不放入聊天或仓库。API 私钥由构建脚本写入 runner 的临时私有目录；子构建进程只接收其路径，任务结束后清理，不作为产物上传。

当前环境没有绑定这些 Apple 凭据，尚未执行 Apple 签名请求。Team ID 可分享用于确认配置，其他值直接填入 GitHub。

## 构建工具链

Apple 自 2026 年 4 月 28 日起要求 App Store Connect 上传使用 Xcode 26+ 和 iOS 26+ SDK，见 [官方要求](https://developer.apple.com/news/upcoming-requirements/)。签名工作流选择 runner 上最新的稳定 Xcode，归档脚本在构建前验证 Xcode 和 SDK 版本，避免使用 macOS runner 默认的旧版本。失败任务也保留 Rust 编译缓存，便于修复 Apple 配置后重试。

## 签名与上传

[签名工作流](../.github/workflows/ios-testflight.yml)只支持手动触发且只运行 main 分支。它需先合并到主分支，才会在 Actions 显示手动入口；草稿 PR 检查不会读取发布凭据。

1. 第一次运行保持 upload 不勾选，先验证归档、自动签名与 IPA 导出。
2. 流程使用正式设备 arm64 release 构建和 app-store-connect 导出方式，不启用 no-sign。自动签名失败时，应根据实际错误补齐 Apple 权限、App ID、证书或描述文件，不伪装生成成功。
3. 导出后校验代码签名、Team ID、Bundle ID、构建编号和分发 entitlement；校验成功才保留 IPA。
4. 需要上传时，运行工作流并勾选 upload；通过 API 密钥提交至 App Store Connect。上传成功只表示已被接收，仍需等待 Apple 处理及可能的合规问项。
5. 在 App Store Connect → 应用 → TestFlight 确认可用构建，添加内部测试人员；在 iPhone 的 TestFlight 接受邀请后安装。外部测试可能还需 Beta 审核。

默认构建编号为工作流运行编号.尝试编号，重跑也生成新的编号。已有更高编号或需要自定义时，可填写 build_number；脚本按 Apple 的 1–3 段数字规则校验。iOS 版本号仍来自当前应用版本，不为签名改动 SQLite schema。

若团队自动签名不可用，可在确认原因后使用手动分发凭据；工作流预留 IOS_CERTIFICATE（base64 加密 p12）、IOS_CERTIFICATE_PASSWORD、IOS_MOBILE_PROVISION（base64 App Store profile）三个可选 Secret，需成套配置。它们不是首次接入的必填项，也未在当前环境验证。

## 当前限制

上传 TestFlight 不等于功能完成。当前移动版文件导入/导出、录音和系统通知仍未接入；本机备份不能防止卸载和设备丢失。首次测试仅使用虚构数据，不作为真实案件的唯一存储。

模拟器启动与数据库检查不替代真机上的 WebKit、系统权限、文件提供器、后台中断和升级验收。签名构建、Apple 处理及 TestFlight 安装结果应分别记录。
