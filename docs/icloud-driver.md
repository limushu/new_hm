# iOS CloudKit 驱动准备

实现位于 [tauri-plugin-hm-cloudkit](../crates/tauri-plugin-hm-cloudkit/src/ios.rs)，通过 [平台装配](../src-tauri/src/platforms/mod.rs) 注入统一 SyncDriver。[源码接入地图](design/platform-driver-map.md) 区分真实驱动与测试实现。

用户已于 2026-11-17 确认容器关联，统一账号服务已配置。客户端已接入自动调度，发行 profile、CloudKit Production schema 和新候选真机往返仍在验证。**尚未完成可用云同步发布验收。** 普通插件初始化不创建 CKContainer，避免现有无 iCloud 权限的安装包访问该 API。

## 驱动实现

- 连接先确认配置和系统云账号，比较已绑定的 provider subject；账号变化使会话及未完成操作失效，不继续用其他账号上传。
- 每个案笺用户/工作区使用独立私有 record zone；案笺身份与 iCloud 身份分开，均由上层提供并核对。
- 云端 head 使用 record change tag 和 `.ifServerRecordUnchanged` 条件更新，首创也使用 create-only 语义。读取后并发更改不会被静默覆盖。
- 内容按 SHA-256 寻址。较大附件由 Rust 分成 16 MiB 块，先上传块，再提交索引，避免直接把长录音作为超大 CKAsset。
- 读取校验块指纹、总大小和整个内容指纹，临时文件仅在私有目录，释放读取流后清理。二进制不通过前端 JSON/base64。
- CloudKit 权限、网络、容量和账号错误返回稳定错误码，不转用开发者服务器存案件。

## 激活前需要的 Apple 配置

1. 在 Apple Developer 中为当前 App ID 启用 iCloud/CloudKit，关联用户所属团队的容器，例如 `iCloud.com.limushu.hm`。
2. 配置 `com.apple.developer.icloud-container-identifiers` 与 `com.apple.developer.icloud-services = [CloudKit]`，使发行 provisioning profile 和签名产物确实具有对应权限。不能只写 Info.plist 开关。
3. 在开发环境建立并检查 record types：`AnjianSyncHead`（revision 字符串）、`AnjianSyncIndex`（sha/json 字符串）、`AnjianSyncChunk`（sha 字符串、data Asset），再部署到生产环境，核对私有库权限。
4. 在与已验证签名匹配的构建中设置 Info.plist `AnjianCloudKitContainer`，指向已配置容器。现有配置中没有设置该键，也未宣称上述能力已启用。
5. 配置托管账号服务和客户端安全会话；使用服务端确认的案笺用户 ID / 工作区 ID，并通过 `storage_account` 获取系统云账号后绑定。不能拿客户端手填 UUID 作为已验证登录的替代。
6. 完成签名真机、真实 Apple 账号、生产数据库以及至少两台设备的数据往返后，再开放 UI。

原生测试使用真实 CloudKit 类型/代码，数据库访问通过可替换适配器隔离，不依赖 CI 登录个人 iCloud。它能验证编译、条件更新、账号变化、原生桥和文件处理，不能验证实际生产授权、网络传输或多设备一致性。

2026-11-16，iOS 编译及上述 4 项 CloudKit 原生适配测试通过，连同既有录音/文件/转写共 22 项原生测试通过。工作流和源码见[平台驱动验证记录](design/platform-driver-map.md)。签名权限、真实账号、大附件云传输和多设备验证仍未完成。

## 自动部署与签名核验

[生产配置工作流](../.github/workflows/cloudkit.yml)首先读取 App ID 能力；选择部署时从 GitHub Secret `CLOUDKIT_MANAGEMENT_TOKEN` 读取管理令牌，导入[审核过的 schema](../cloudkit/schema.ckdb)，部署并导出生产 schema 校验。该令牌不打入客户端。CloudKit Console 的账户菜单可创建 Management Token；只填 GitHub Secret，不发送聊天。

[签名脚本](../scripts/ios-cloudkit-signing.mjs)匹配现有发行证书，必要时为同一 App ID 创建更新后的 profile，不撤销证书。启用 CloudKit 的发行构建先验证生产 schema 和 profile，才给临时 Xcode 模板写入容器与 Production entitlement；导出 IPA 后再次检查实际签名。默认模拟器和普通构建不添加激活标记。`ios-testflight.yml` 的 `cloudkit` 参数默认关闭，必须明确开启才生成同步候选。
