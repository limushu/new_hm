# 律师个人工作平台

面向中国大陆二三线城市小型律所中独立执业律师的本地工作软件，重点是简单易用的案件管理、日程安排和资料归档。产品名称尚未确定，“律案”为设计稿占位名。

第一版优先 Windows，后续目标为 macOS、iOS 和 Android。正式工程采用 Tauri 2、React/TypeScript、Rust 与 SQLite；业务和存储层独立于窗口，可跨平台复用。

## 当前进度

截至 2026 年 10 月 18 日（北京时间），已进入正式研发，完成第一条本地数据流程与 Windows 预览程序构建：建案、办理程序、待办、工作记录、案件回收站和月历。0.1.1 增加可直接创建、编辑和删除的日程，支持个人/案件关联、全天及跨日安排。材料复制归档、通知提醒、联系人、收支与备份等仍在后续范围。

0.1.2 的桌面日历默认周时间表，提供小月历、日/周/月切换、空闲时间新建及重叠安排并排显示；手机默认日视图。关联案件完全可选，不继承上一次选择。新增 Windows 绿色 ZIP，解压后直接运行，业务数据与界面缓存保存在程序旁的 `data/`；见[绿色版说明](docs/portable-release.md)。

0.1.3 修正半小时格默认时长为半小时；统一暗蓝色（#162D46）日程卡片与蓝色（#295A8C）细侧边，增强今天的当前时间线并自动定位当前时段。可选关联改为“＋ 关联案件”，支持搜索选择和“×”清除。

0.1.4 打磨案件看板：圆角状态标签、标题优先的卡片层级及随内容展开的状态列；支持鼠标/触屏跨列拖拽与键盘移动，保存失败回到原列，案件信息和办理程序保持不变。

## 运行与构建

需要 Node.js 22.12+（22.x）、Rust 1.90+，以及对应平台的 Tauri 构建依赖。Windows 已安装 MSVC 与 Windows SDK，其他机器可运行 `npm run doctor` 检查。

```powershell
npm ci
npm run desktop:dev

npm run build
npm test
npm run test:core
npm run test:ui
npm run format:check
npm run docs:check
npm run desktop:build
npm run artifacts:portable
```

Node/npm 用于开发和构建，发布的软件运行时不需要 Node 或 Rust。正式桌面应用使用 Rust 和 SQLite 保存到当前用户的应用数据目录，无需注册登录。

- 首批 Windows 产物整理到 `artifacts/windows/`（不纳入 Git）；构建原始产物在 `target/debug/` 或 `target/release/`。
- 仅查看前端：`npm run dev` 后打开 `http://127.0.0.1:1420/?preview=1`。此入口是明确标注的内存预览，刷新即重置，不能代替桌面持久化验证。
- [技术架构与首个里程碑](docs/architecture.md)：工程结构、数据约束、跨平台计划和已实现范围。
- [预览版试用说明](docs/preview-release.md)：如何分发、使用与反馈。

## 项目资料

- [案件页可交互视觉原型](docs/design/prototypes/case-board.html)：以最新 Notion 参考调整的评审稿，可在浏览器打开，使用临时虚构数据，不保存业务数据。

- [第一版需求](docs/requirements.md)：已确认范围、后续能力与待细化事项。
- [设计说明与交互流程](docs/design/archive/decisions-2026-10-17.md)：视觉原则、页面状态和全部高保真图索引。
- [项目进度与下一步](docs/progress.md)：当前成果、未决事项和继续工作的位置。

## 文件与目录约定

| 目录 | 用途 |
| --- | --- |
| `src/features/` | 按功能组织的正式界面：`cases/` 案件，`calendar/` 月历 |
| `src/domain/`、`src/services/` | 共享类型、日期工具及调用 Rust 的接口 |
| `crates/hm-core/` | Rust 业务逻辑、SQLite 存储、迁移和核心测试 |
| `src-tauri/` | 应用启动、系统命令、权限、图标和各平台配置 |
| `tests/ui/` | 界面流程回归测试；小工具测试就近放在源码旁 |
| `docs/design/current/` | 当前设计参考和原型截图 |
| `docs/design/archive/` | 历史探索、生成提示词与完整评审记录 |
| `docs/design/prototypes/` | 独立 HTML 交互原型，不作为正式应用代码 |
| `scripts/` | 环境检查、交付整理和文档链接检查 |
| `artifacts/windows/` | 对外试用的程序和安装包，本地生成，不提交 Git |
| `.local/` | 临时截图、安装日志和开发调试文件，不提交 Git |

`node_modules/`、`dist/`、`target/` 和测试报告均为自动生成内容，已排除提交。用户数据库位于系统应用数据目录，不放入源码或安装包。根目录保留 Node、Rust、Tauri 构建所需的工程配置，不再另建重复的应用目录。

修改前端后运行 `npm run format`；`npm run format:check` 和 `npm run docs:check` 已纳入 CI。Rust 代码使用 `cargo fmt --all`。

## 已认可的视觉方向

中性深色背景、舒展留白、轻量字体、少量柔和强调色；参考 Apple、Notion 与 Notion Calendar。

### 月历首页

![已认可的月历首页](docs/design/current/home-calendar-dark-draft.png)

### 案件概览

![已认可的案件概览方向](docs/design/current/case-overview-dark.png)

图片用于视觉和布局评审，尚未实现为可交互软件。图中文字、日期和文件信息均为演示数据；生成图中的错字和局部细节以需求文档为准。
