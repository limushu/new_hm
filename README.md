# 案笺

原“律师工作台”，现更名为“案笺”。[名称与图标设计](docs/design/brand.md)。

面向独立执业律师的本地工作应用：案件、办理程序、材料归档、日程、联系人和简单收支。无需登录，离线使用。技术栈为 Tauri 2、React/TypeScript、Rust、SQLite。

当前交付版本 **1.1.1，Windows x64 安装版**。macOS、Android、iOS 是后续目标，尚未做发布验收。视觉延续已确认的 Notion 式深灰、圆角和舒展留白。

## 使用与验收

安装包、签名与更新清单位于本地 artifacts/windows/1.1.1/；公开分发见 [GitHub Releases](https://github.com/limushu/new_hm/releases)。安装包不含个人数据。Node 与 Rust 只在开发和构建时需要。

详见[1.0 使用与验收](docs/v1.0-acceptance.md)：功能检查、数据位置、备份、提醒与升级边界。软件尚无 Windows 发布者代码签名证书，在线升级使用独立签名验证。

- 案件：Notion 式侧页新建、跨状态拖拽、自定义状态、办理程序与阶段、事件、待办及工作记录。
- 材料：复制导入、拖入、同名保留、文件夹、程序归属、PDF/图片预览、音频播放、系统打开、导出、回收站。
- 录音、联系人与案件身份、双向关系、关系图、整数金额收支与报销记录。
- 日/周/月日历、半小时创建、可选案件关联、重叠布局、当前时间线及提前提醒。
- 名称搜索、每天完整备份、手动备份、校验恢复、托盘、可选自启动、用户确认在线升级。

1.1 新增[案件全貌与并行程序模型](docs/case-model.md)、持久 #标签、案件/日历共用日程、明确材料归档范围、收支环图，以及后台更新提示与可配置 HTTPS 更新源。[字体映射规范](docs/design/typography.md)约束全局排版。

## 开发

需要 Node.js 22.13+（22.x）、Rust 1.90+，Windows 还需 MSVC、Windows SDK 与 WebView2。可运行 npm run doctor 检查。

~~~powershell
npm ci
npm run desktop:dev

npm run check
npm run format:check
npm run docs:check
npm test
npm run test:core
npm run test:ui

npm run desktop:build -- --ci
npm run artifacts:release
~~~

发布构建需要升级签名私钥，见[发布流程](docs/releasing.md)。仅检查桌面编译可用 npx tauri build --no-bundle --ci。

前端独立预览：npm run dev 后打开 http://127.0.0.1:1420/?preview=1，仅开发可用，数据在内存，不能代替桌面持久化验收。正式程序通过 Rust 使用 SQLite，绝不用浏览器存储代替数据库。

## 工程资料与目录

| 目录 | 用途 |
| --- | --- |
| src/features/ | 案件、日历、材料、联系人、收支、设置 |
| src/components/ | 共用弹窗、全局搜索、回收站和通知 |
| src/domain/、src/services/ | 类型、工具、Tauri 调用与开发预览适配器 |
| crates/hm-core/ | Rust 业务、SQLite 迁移、文件服务和核心测试 |
| src-tauri/ | 桌面 IPC、系统集成、权限及平台配置 |
| tests/ui/ | 界面流程回归；小工具测试就近放源码 |
| scripts/ | 构建、PDF 离线资源、发布整理与文档检查 |
| docs/design/current/ | 当前设计和应用截图 |
| docs/design/archive/、docs/design/prototypes/ | 历史评审及独立 HTML 原型 |
| artifacts/、.local/ | 本地交付与调试文件，不提交 |

[架构](docs/architecture.md) · [需求](docs/requirements.md) · [进度](docs/progress.md) · [验收清单](docs/v1.0-checklist.md)。node_modules、dist、target、PDF 自动生成资源、测试报告均不提交。用户数据位于系统应用数据目录，不进入源码或安装包。

保留 DESIGN-NOTION-COLOR 和 DESIGN-NOTION-DETAIL：配色、圆角、字体与图标继续打磨。历史效果图和 HTML 是设计依据，当前能力以实际应用与验收说明为准。

当前[案件看板预览](docs/design/current/case-board-preview-1.0.0.png)与[原生材料页](docs/design/current/materials-app-1.0.0.png)均使用虚构数据；原生截图在隔离目录运行，不读取个人工作区。

1.0.2 改名为案笺，统一菜单、日期和字体；对象默认看资料，有关联也可删除；案件删除入口常驻并支持拖拽回收与撤销。设计与数据规则见[对象关系优化](docs/relationship-design.md)；文档位于 docs 目录。

[1.0.1 案件信息](docs/design/current/case-info-app-1.0.1.png) · [对象局部关系图](docs/design/current/object-relations-app-1.0.1.png)：Windows 正式构建的隔离验收截图。

[1.0.2 对象资料](docs/design/current/contact-details-1.0.2.png) · [统一菜单](docs/design/current/contacts-menu-1.0.2.png) · [待办日期](docs/design/current/task-date-1.0.2.png)：开发预览的虚构数据截图。
