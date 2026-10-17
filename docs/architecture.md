# 应用架构与首个研发里程碑

日期：2026 年 10 月 17 日（北京时间）。产品名称待定，当前工程名 hm。

## 产品与平台

这是本地优先的跨平台律师工作应用。Windows 为第一交付平台，后续适配 macOS、Android 和 iOS。无需登录，离线保存数据；同步、团队协作和 AI 不在当前实现范围。

采用 **Tauri 2 + React + TypeScript + Rust + SQLite**。Tauri 提供应用容器，React 处理界面，Rust 承担业务校验和数据库事务，SQLite 保存在应用沙箱中。技术依据：[Tauri 平台说明](https://v2.tauri.app/start/)、[调用 Rust](https://v2.tauri.app/develop/calling-rust/)、[平台前置要求](https://v2.tauri.app/start/prerequisites/)。

桌面与移动端共享业务和部分界面，平台集成与交互需要单独适配。iOS 编译需要 macOS/Xcode；Windows 本机不能验证 iOS。当前尚未生成或验证移动安装包。

## 工程边界

```text
src/                          React 正式应用
  features/calendar/          月历与日期待办
  features/cases/             案件看板、侧页和完整工作区
  domain/                     类型契约、日期工具
  services/repository.ts      Tauri 命令入口
  services/preview.ts         仅开发时显式开启的内存预览
crates/hm-core/                与窗口无关的 Rust 业务和存储
  migrations/                 SQLite 版本迁移
  tests/                      重开数据库、隔离、回收站等集成测试
src-tauri/                    应用启动、IPC 与平台配置
tests/ui/                     浏览器界面流程测试
scripts/                      环境检查、交付整理和文档链接检查
docs/design/prototypes/       已讨论原型，保留作为设计依据
docs/design/current/          当前参考图及原型截图
docs/design/archive/          历次探索、提示词和完整评审记录
artifacts/                    本地安装包与分发文件，不提交
.local/                       调试、安装日志与临时文件，不提交
```

正式应用的数据库操作均经 Rust 命令完成，界面不直接执行 SQL，也不使用 localStorage 充当生产数据库。Rust 核心可独立测试，不依赖 Tauri 窗口。

## 数据结构与约束

- `case_statuses`：首批提供未开始、进行中、已结案；自定义状态尚待实现。
- `cases`：案件名称、类型、当前状态、当前程序引用、时间与回收站标记。
- `proceedings`：一审、二审、再审、执行等程序，各自保存案号、法院、法官与当前阶段。
- `tasks`：当前里程碑先实现案件关联待办，截止日期可选、可勾选完成。
- `work_records`：案件文字记录及创建时间。

新建民商事案件在同一数据库事务内建立一审，并设置当前程序。建案请求使用前端生成的稳定 UUID 作为幂等标识，同一次提交重试不会创建两个案件。其他类型案件可自行添加办理程序。

切换当前程序必须验证程序属于当前案件；新增程序不改写原程序、不自动改变案件结案状态。阶段仅保存当前值，历史事件和自定义阶段管理后续完善。

删除案件采用软删除，子程序、待办和记录保留；软删除期间拒绝修改子记录，恢复后继续使用。此版本不提供永久删除。

SQLite 启用外键、WAL、FULL 同步和 busy timeout；迁移在事务中执行，通过 `user_version` 管理版本。遇到更高数据库版本拒绝打开，避免旧应用写坏新版数据。

数据库由 `app.path().app_local_data_dir()` 确定位置，文件名 `workspace.sqlite3`。Windows 通常位于 `%LOCALAPPDATA%\com.limushu.hm\`；其他平台由 Tauri 定位。备份与恢复的正式方案仍待接入，不通过复制运行中的数据库文件实现备份。

## 本次范围与验收

首条流程：**新建案件 → 默认一审 → 新增/切换程序 → 待办和文字记录 → 退出并重开数据保留 → 删除恢复**。

界面延续已确认的 Notion 式右侧页内建案，名称是唯一必填项；有效名称失焦或回车提交，空白草稿关闭取消；可展开完整工作区。首页默认月历，当前先呈现有日期的案件待办，无日期待办单独收起。

正式文件复制归档、录音、日程与通知、联系人及关系图、收支、自动备份、系统托盘和开机启动不属于本次已完成能力，不能因界面占位而视为实现。原型中已有的材料功能尚未接入正式 Rust 文件服务。

## 开发与验证

```powershell
npm ci
npm run doctor
npm run desktop:dev

npm run build
npm test
npm run test:core
npm exec -- playwright test
npm run desktop:build
```

Rust 需要 1.90 或以上版本，Node 使用 22.12 或以上的 22.x。依赖版本由 `Cargo.lock` 与 `package-lock.json` 固定。Windows 若缺少 MSVC/SDK，可在管理员 PowerShell 中运行 `scripts/setup-windows.ps1`；脚本从 Microsoft 官方地址下载并验证签名，安装内容见 `.vsconfig`，不会自动重启。

开发时 `npm run dev` 仅启动前端，`http://127.0.0.1:1420/?preview=1` 是明确标识的内存界面预览。正常桌面程序永远调用 Rust 和 SQLite；生产构建无法通过此参数启用预览适配器。浏览器预览不用于验证本地数据持久化，重开数据库由 Rust 测试和桌面实测验证。

GitHub 工作流提供前端、Rust 核心和 Windows 桌面编译检查；工作流尚未推送/远程运行。macOS 和移动端暂不宣称验收通过。

## 设计待办

继续保留 `DESIGN-NOTION-COLOR` 与 `DESIGN-NOTION-DETAIL`：当前颜色和组件细节为暂定基线，配色、圆角、字体和图标需参考 Notion 整体打磨。四个固定入口（概览、材料、案件信息、收支）和“案件 → 程序 → 阶段”的业务关系延续已确认需求。
