# 开通 Apple 登录

本页对应案笺的原生系统浏览器 OAuth 接入。iOS 界面和凭据驱动已写入代码，下面的 Apple 平台配置尚需账号持有人完成；准备好凭据不代表真实登录验收通过。官方依据：[Supabase Apple 登录](https://supabase.com/docs/guides/auth/social-login/auth-apple)。

## Apple Developer

1. 在 [Identifiers](https://developer.apple.com/account/resources/identifiers/list) 打开 `Anjian`，核对 App ID 为 `com.limushu.hm`。勾选 Sign in with Apple，保存；如要求配置主 App ID，选择 Enable as a primary App ID。
2. 返回列表，用右上角 App IDs 下拉切换到 Services IDs，点加号。Description 可填 `Anjian Sign In`，Identifier 可填 `com.limushu.hm.auth`。如该标识已被使用，选择自己控制的其他唯一标识，并在后续始终使用同一值。
3. 打开新建的 Services ID，启用 Sign in with Apple，点 Configure。Primary App ID 选择 `com.limushu.hm`。Domains 填 `vfbufazqpzetjkmkvjwp.supabase.co`；Return URLs 填 `https://vfbufazqpzetjkmkvjwp.supabase.co/auth/v1/callback`。域名栏不加 `https://` 或路径，回调填完整 HTTPS 地址。保存并确认注册。
4. 到 [Keys](https://developer.apple.com/account/resources/authkeys/list)，创建新密钥，名称可填 `Anjian Sign In`。勾选 Sign in with Apple 并配置为同一个 Primary App ID，注册后记录 Key ID，下载 `.p8` 文件并自行保管。这里需要 Sign in with Apple 密钥，不是已经用于 TestFlight 的 App Store Connect API 密钥。
5. 记下开发者 Team ID（当前团队为 `UN356US9WL`），不要把 Team ID、Key ID 与 Services ID 混用。`.p8` 只能下载一次，不发聊天或提交仓库。

## 使用仓库中的配置工具

在 [GitHub 仓库 Secrets](https://github.com/limushu/new_hm/settings/secrets/actions) 添加四项 Repository secrets：

| Secret 名称 | 填写内容 |
| --- | --- |
| `APPLE_SIGN_IN_TEAM_ID` | 开发者 Team ID，例如当前团队 `UN356US9WL` |
| `APPLE_SIGN_IN_KEY_ID` | 刚创建的 Sign in with Apple Key ID |
| `APPLE_SIGN_IN_CLIENT_ID` | 刚创建的 Services ID，例如 `com.limushu.hm.auth` |
| `APPLE_SIGN_IN_PRIVATE_KEY` | `.p8` 文件的全部文本，包括 BEGIN/END 行与换行 |

已有的 `SUPABASE_ACCESS_TOKEN` 继续用于同一个 Supabase 项目。以上值不会进入客户端安装包。GitHub 页面填写后，可以通知开发者执行配置；也可自己在 [Hosted identity preparation](https://github.com/limushu/new_hm/actions/workflows/identity.yml) 选择 main，勾选 `configure_apple`，其余开关保持 false 后运行。

配置工具先为删除接口安装四项服务端 Apple 撤销凭据，再启用 Supabase Apple 提供器；自动生成 ES256 client-secret JWT，配置原生回调和手动身份绑定。不会打印 JWT、私钥或完整 Auth 配置，也不会修改 Google/Microsoft 凭据。若项目已有不同 Apple client ID 则停止，避免覆盖。

脚本会生成脱敏的 `apple-configuration.json`，记录配置完成状态和 JWT 到期日期。当前有效期为 150 天，须在到期前再次运行同一配置任务更新；不需要重新生成 Apple `.p8`。不要把原始 `.p8` 直接粘到 Supabase 的 OAuth Secret Key 字段，那一项需要的是签名 JWT。

## 配置后的验收

安装包含账号驱动的新测试构建，打开「设置 → 案笺账号 → 刷新状态」，确认 Apple 从等待配置变为可登录。使用系统授权窗口完成首次登录、退出、再次登录；涉及绑定时确认仍是同一个案笺账号。先用专门的测试账号验证账号删除及 Apple 授权撤销，不用真实工作账号冒险测试。

当前账号功能不自动上传本机案件，也不代表 iCloud 同步已启用。Google/Microsoft、CloudKit 发行配置和两台设备的同步验收分别进行。包含可选账号的新构建提交 App Review 前，须更新隐私问卷、外部服务说明和真实账号演示；不要沿用旧版“无账号服务”的审核材料。
