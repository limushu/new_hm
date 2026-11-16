# 托管账号与用户自选云：部署与接入

用户已确认统一案笺身份，可以绑定 Apple、Google 和 Microsoft，案件保存到用户选择的云；按不需要自管服务器的 Supabase 托管方案接入。

**状态：真实 Supabase 项目已部署账号目录、权限规则和删除账号函数；原生应用回调与手动身份绑定配置已保存并复核。三家 OAuth 应用尚未配置，客户端登录、账号绑定 UI、云存储配置与生产多设备同步仍未接通。** 本地实现了通用同步原型，iOS CloudKit 驱动源码和装配已补充，具体边界见[驱动接入地图](design/platform-driver-map.md)。TestFlight 1.7.7（28.1）只有手动备份，不能作为账号或同步功能验收。

## 方案与边界

采用 Supabase Auth 管理统一用户 ID、OAuth 登录和身份绑定；Apple、Google、Microsoft（Supabase provider 名为 `azure`）是登录方式。Apple 私密转发邮箱可能与其他登录邮箱不同，须提供明确的绑定/解绑流程。客户端只信任服务端确认的用户 ID，不按邮箱自己拼接账号。托管服务可能按已验证邮箱自动关联身份，正式接入时还需核对并验收其账号策略，不宣称已经实现完全手动的关联规则。

Supabase Postgres 只存账号显示资料、工作区目录、云存储绑定与不含令牌的远端定位信息。案件、正文、关系、属性、材料和录音仍由本地 SQLite 与用户选定的 iCloud / OneDrive / Google Drive 承载。登录提供器与存储提供器分开；同一工作区的所有设备必须访问同一份云端数据。

第一期没有团队共享或跨用户邀请，数据库仅允许所有者访问目录。若增加团队，须新建成员模型、授权与测试，不能简单放宽现有 RLS。

当前 [同步内核](cross-device-sync.md) 的会话绑定“案笺用户 ID + 工作区 ID + 云存储账号”。退出或切换登录账号不能继续沿用前一账号的工作区状态；同一云账号也不能替代案笺身份检查。

## 服务端资料

- [账号目录迁移](../supabase/migrations/202611160001_account_catalog.sql)：账号资料、云绑定、工作区、外键与行级权限；不存案件内容或云令牌。
- [删除账号入口](../supabase/functions/delete-account/handler.ts)：向 Auth 服务验证 bearer，只删除该会话对应的用户；客户端指定其他用户 ID 无效。Apple 已绑定时须先重验证并提供可撤销的刷新令牌，服务端撤销 Apple 授权后再删除账号。Apple 配置或撤销失败时保留账号并返回失败。
- [Supabase 本地配置](../supabase/config.toml)：允许的原生回调与手动身份绑定；实际 OAuth 提供器仍需在托管项目中配置。
- [公共客户端配置检查](../scripts/identity-config.mjs)：接受 Project URL 与 publishable/anon key，拒绝 service_role、secret key、用户访问令牌或非 HTTPS 地址。

`npm run identity:prepare` 生成 `artifacts/identity/`，包含迁移 SQL、删除函数和此说明。不创建项目、不启用真实登录；只包含公开客户端配置，不包含管理凭据或私钥。

## 首次开通

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 注册并创建项目；选择适合的区域及套餐，付费资源由用户决定。项目密码自行保管，不发送到聊天或提交到仓库。
2. 从项目连接/API 页面取得 **Project URL** 和 **publishable key**（旧项目可用 `anon` key）。这两项是公开客户端配置。`service_role`、secret key、数据库密码和三家 OAuth 私钥都不能放入安装包。
3. 将迁移 SQL 在项目 SQL Editor 执行一次，或使用下面的自动部署流程。两种初始化方式择一；现有同名表不应被脚本静默覆盖。
4. 在 Auth URL Configuration 添加原生回调 `anjian://auth/callback`。桌面其他回调如后续采用 loopback，需与已实现客户端严格匹配后再加入，不使用宽泛生产通配符。
5. 在 Auth Providers 配置 Apple、Google、Azure。提供器的服务器回调为该项目的 `/auth/v1/callback`，与返回原生 app 的回调不同。Apple Web 登录需要 Services ID、签名密钥和有效的 client-secret JWT；Google 需要 OAuth 应用；Azure 需要 Microsoft Entra 应用及正确的账户范围。个人 Microsoft 账号与组织租户都需按实际目标验收。
6. 启用托管服务的 manual identity linking。验证首次注册、已有账号登录、Apple 私密邮箱、绑定已有他人身份、解绑最后一个身份、撤销登录授权与账号删除。

Project URL 和 publishable/anon key 可以提供给开发者用于客户端接入。其他凭据通过托管控制台或 GitHub Secrets 配置，不直接发聊天。

## 自动部署资料

[Hosted identity preparation](../.github/workflows/identity.yml) 仅允许 main 手动触发。默认只检查和打包资料；`apply=true` 才会调用管理 API 执行迁移并部署 Edge Function。`configure_auth=true` 独立配置原生回调和手动身份绑定，保留已有回调、正式 Site URL 与提供器凭据；只有未设置或默认 localhost 的 Site URL 才会替换为原生回调。不启用或代建三家 OAuth 应用。

实际部署以仓库中的 `supabase/client.public.json` 为项目定位，不必额外设置仓库变量；需要 GitHub Secret `SUPABASE_ACCESS_TOKEN`（Supabase 个人管理令牌）。不把管理令牌交给客户端。脚本不会创建新项目、选择付费套餐或修改三家 OAuth 应用；两个显式开关分别控制目录/函数部署与原生认证路由配置。工作流只输出权限、开关和配置是否存在等脱敏状态，不打印令牌或完整 Auth 配置；GitHub 连接无法读取 Secrets 列表时也可以通过这一方式检查。API 和 CLI 通过环境读取令牌，不将其放在命令参数中。

Edge Function 使用平台注入的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。Apple 账号删除另外需要函数私密配置：`APPLE_KEY_ID`、`APPLE_TEAM_ID`、`APPLE_OAUTH_CLIENT_ID`、`APPLE_PRIVATE_KEY`；与实际 Apple OAuth 应用保持一致。这些值只放在 Supabase Function Secrets。函数每次生成短时 client-secret JWT，不把 Apple 私钥或刷新令牌写进日志、目录表或响应。

账号删除入口当前针对原生客户端，不提供浏览器 CORS 接口。日后增加 Web 端须单独配置允许来源。账号目录删除会级联清除自己的服务端元数据，不代表已经删除用户云盘中的案件文件；产品删除流程还须明确本机与外部云内容的处理范围。

## 客户端仍需接入的工作

三家登录通过系统授权窗口和 PKCE / nonce 完成，刷新凭据保存到 iOS/macOS Keychain 或 Windows 凭据存储，不写 localStorage、普通设置或同步快照。服务端的 secret/service_role 不能用于原生客户端。

统一账号登录不等于已获得云盘权限。首次选择工作区云服务时还要完成对应数据授权，存储驱动必须验证云账号与绑定一致。iCloud 私有容器还需要 Apple App ID 能力、容器及发行签名；OneDrive/Google Drive 需要相应 OAuth 数据权限和令牌刷新。切换云服务是迁移流程，不是切换一个登录按钮。

缺少 OAuth 配置或客户端接入时，不展示可用登录或“已同步”的假状态。接好上述资料后还须完成真实登录/绑定/删除、签名包、生产云权限和至少两台设备的验收，才能开放功能。

## 已有验证

测试在真实 PostgreSQL 引擎（PGlite）中运行迁移和 RLS，覆盖匿名拒绝、跨用户访问、身份字段不可冒认、跨用户/提供器绑定拒绝、令牌字段拒绝、引用约束和账号删除级联。删除函数测试验证服务端用户 ID、无效会话、请求大小、故障时不假报成功，以及 Apple ES256 签名和撤销先于删除的顺序。

Rust 同步测试使用两份隔离 SQLite 和可替换内存云驱动，验证版本接续、附件复用、离线失败、账号隔离、并发冲突和保留双方版本。这些测试不代表真实登录或实际云盘同步已经可用。

## 线上部署与验证记录

用户提供的项目为 `vfbufazqpzetjkmkvjwp`，公开服务地址与 publishable key 保存在 [client.public.json](../supabase/client.public.json)。2026-11-16 已执行以下操作，管理凭据只由仓库 Secret 交给工作流：

- [账号目录与函数部署](https://github.com/limushu/new_hm/actions/runs/43887889810)：在 14:39 UTC 成功应用迁移并部署 `delete-account`。三个目录表为 `account_profiles`、`cloud_bindings`、`workspaces`。
- [认证路由配置与权限复核](https://github.com/limushu/new_hm/actions/runs/43888944441)：在 14:45 UTC 确认 `anjian://auth/callback` 已列入允许回调，manual identity linking 已开启；三个目录表均启用 RLS，匿名角色没有 SELECT 权限，认证角色具备受策略约束的 SELECT 权限。该次运行的 12 项账号测试通过。
- 使用公开 key 实测三个目录表的匿名查询均返回 HTTP 401 / PostgreSQL `42501`；没有读取用户记录。删除接口 GET 返回 405，缺少会话或使用无效 bearer 的 POST 返回 401；没有执行真实用户删除。

Apple、Google、Azure 的 OAuth client ID 与 secret 均未配置，三项外部登录均关闭。尚未验证真实注册、登录、绑定或删除，云同步仍未开放。

`node scripts/check-identity-project.mjs` 输出公开连接、提供器开关、凭据是否存在、目录权限和认证路由的脱敏状态，不输出 key、提供器密钥或管理令牌。权限查询只读 PostgreSQL 系统目录，不读案件或账号行。提供器 OAuth 密钥仍应放在 Supabase 控制台，管理令牌放 GitHub Secrets，不发送到聊天。
