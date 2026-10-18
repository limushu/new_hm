# Windows 安装与升级发布

1. 保持 package.json、package-lock.json、Cargo.toml（workspace）、Cargo.lock 与 src-tauri/tauri.conf.json 的版本一致。稳定版本使用 v 前缀标签。
2. npm ci，执行格式、文档、Rust、前端与界面检查；再 npm run desktop:build -- --ci、npm run artifacts:release。
3. 本机构建从用户目录 .hm-release/updater.key 取签名私钥，或使用 TAURI_SIGNING_PRIVATE_KEY 与 TAURI_SIGNING_PRIVATE_KEY_PASSWORD 环境变量。绝不提交私钥，不在日志回显。安全离线备份私钥，丢失后无法用当前公钥发布有效升级。
4. artifacts/windows/<version>/ 包含 x64 NSIS 安装包、.sig、latest.json、SHA256SUMS.txt 和使用说明。签名清单的 URL 指向同版本 GitHub Release；不能只上传 latest.json 而缺失对应包。
5. .github/workflows/release.yml 支持手动构建和版本标签。标签发布会构建、上传并发布对应版本；Actions 中需配置同一私钥的 TAURI_SIGNING_PRIVATE_KEY secret，密码若为空则无需配置。普通 CI 不需要私钥。
6. 安装版通过 releases/latest/download/latest.json 获取稳定版。发布后检查清单、下载哈希与签名；后续版本在旧版“设置 → 检查更新”由用户确认安装。不要为测试虚构高版本公开清单。

当前仅发布 Windows x64；macOS updater 签名与 Apple 公证、其他平台发布另行接入。Tauri 升级签名不是 Windows Authenticode，当前安装包可能出现未知发布者提示。GitHub 访问失败时应用报告网络错误，不宣称已是最新。

## 后台提示与替代更新源

1.1 起启动 15 秒后及每 6 小时由 Rust 检查更新；成功发现更高版本才在侧栏显示提示。后台失败不弹窗，用户手动检查可看到错误。点击侧栏进入设置查看版本说明，下载和安装仍需明确确认。Rust 负责清单请求、内置公钥验签、升级前备份和安装；TypeScript 负责展示状态、进度和确认交互。

“设置 → 版本与更新 → 更新源”可填写自有 HTTPS latest.json 地址。自定义源优先、请求失败回退 GitHub。留空使用默认源。无需把访问令牌存进软件；只接受无用户名密码的 HTTPS 地址。

GitLab Release、GitLab Pages、自建 GitLab 或对象存储都可作为静态分发位置，前提是清单及对应安装包允许客户端直接 HTTPS 下载。不能只镜像清单，否则清单中的安装包 URL 仍走 GitHub。GitLab 公共服务不保证中国大陆访问质量，实际部署后应在目标网络验证。

先生成正式发布包，再运行 `npm run artifacts:mirror -- https://下载域名/releases/1.1.0/`。脚本生成 artifacts/update-mirror/<version>，保留同一安装包及签名，只替换清单 URL，并重新生成哈希和校验签名。该命令不上传文件，示例域名不是已上线服务。

上传顺序是不可变版本目录中的安装包与签名先就绪，再原子替换固定地址 latest.json；保留旧版本便于回溯。给客户端配置固定清单入口，清单中的安装包指向不可变版本路径。真实 GitLab 项目或下载域名尚未提供时，只准备本地镜像包，不宣称国内更新服务已经部署。

旧版安装目录保留应用标识 com.limushu.hm，用户业务数据不装进程序目录。旧绿色版若需搬入安装版，使用完整备份恢复；不要悄悄复制个人数据。

本机复验：先关闭正在运行的工作台（脚本不会替你关闭现有应用），构建后 npm run test:native；脚本只创建隔离的虚构数据。发布后可设置 HM_CHECK_UPDATE=1 再运行，以验证原生客户端能访问线上清单。npm run release:verify 校验当前整理包、公钥、清单签名、版本与篡改拒绝。
