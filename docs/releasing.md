# Windows 安装与升级发布

1. 保持 package.json、package-lock.json、Cargo.toml（workspace）、Cargo.lock 与 src-tauri/tauri.conf.json 的版本一致。稳定版本使用 v 前缀标签。
2. npm ci，执行格式、文档、Rust、前端与界面检查；再 npm run desktop:build -- --ci、npm run artifacts:release。
3. 本机构建从用户目录 .hm-release/updater.key 取签名私钥，或使用 TAURI_SIGNING_PRIVATE_KEY 与 TAURI_SIGNING_PRIVATE_KEY_PASSWORD 环境变量。绝不提交私钥，不在日志回显。安全离线备份私钥，丢失后无法用当前公钥发布有效升级。
4. artifacts/windows/<version>/ 包含 x64 NSIS 安装包、.sig、latest.json、SHA256SUMS.txt 和使用说明。签名清单的 URL 指向同版本 GitHub Release；不能只上传 latest.json 而缺失对应包。
5. .github/workflows/release.yml 支持手动构建和版本标签。标签发布会构建、上传并发布对应版本；Actions 中需配置同一私钥的 TAURI_SIGNING_PRIVATE_KEY secret，密码若为空则无需配置。普通 CI 不需要私钥。
6. 安装版通过 releases/latest/download/latest.json 获取稳定版。发布后检查清单、下载哈希与签名；后续版本在旧版“设置 → 检查更新”由用户确认安装。不要为测试虚构高版本公开清单。

当前仅发布 Windows x64；macOS updater 签名与 Apple 公证、其他平台发布另行接入。Tauri 升级签名不是 Windows Authenticode，当前安装包可能出现未知发布者提示。GitHub 访问失败时应用报告网络错误，不宣称已是最新。

旧版安装目录保留应用标识 com.limushu.hm，用户业务数据不装进程序目录。旧绿色版若需搬入安装版，使用完整备份恢复；不要悄悄复制个人数据。

本机复验：先关闭正在运行的工作台（脚本不会替你关闭现有应用），构建后 npm run test:native；脚本只创建隔离的虚构数据。发布后可设置 HM_CHECK_UPDATE=1 再运行，以验证原生客户端能访问线上清单。npm run release:verify 校验当前整理包、公钥、清单签名、版本与篡改拒绝。
