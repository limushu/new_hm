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
- `calendar_events`：独立日程，可选关联案件；名称、开始/结束日期、可选时间、地点和备注。创建与更新使用稳定 UUID，删除采用软删除。

日历中的待办与日程使用不同数据来源，筛选和显示时合并，不复制案件待办。月历中可点击日期格的“+”或双击空白处创建日程，点击已有日程编辑，超出三项的条目折叠到当天详情。全天安排优先，定时安排按时间排序；案件回收期间隐藏其日程，恢复后重新呈现，个人日程不受影响。

日程使用本地墙上时间（`YYYY-MM-DD` 与 `HH:mm`），避免 UTC 转换造成日期偏移。两项时间均为空表示全天，全天日期区间包含结束日；定时日程结束时刻不包含在区间内，跨日零点结束不多占一天。不包含时区转换、重复规则、拖动改期或系统通知能力。交互参考 [Notion Calendar 官方说明](https://www.notion.com/en-gb/help/manage-your-calendars-and-events)。

0.1.2 增加周/日时间表，左侧小月历定位日期，桌面默认周、窄屏默认日；用户切换的视图在页间导航时保留。空白时间按半小时提供创建入口；0.1.3 已将默认时长修正为半小时，含跨午夜处理。全天与待办独立置顶。定时安排按高度表达时长，重叠组分配并排宽度，跨日安排按天裁切。当前时间线对齐分钟刷新，窗口激活/恢复可见时立即刷新，跨日切换到新的今天；只有含今天的视图显示时间线。初次进入及点击“今天”会定位到当前时段，周期刷新不会抢走用户手动滚动的位置。

新建日程从不预选案件，用户通过“＋ 关联案件”展开可搜索列表主动选择，选中后显示案件名，“×”清除；选择列表内 Escape 只关闭选择，不丢弃日程草稿。统一卡片样式不再区分案件关联状态，0.1.3 按最新反馈采用暗蓝底（#162D46）与蓝色（#295A8C）细侧边，侧边色不代表优先级。

新建民商事案件在同一数据库事务内建立一审，并设置当前程序。建案请求使用前端生成的稳定 UUID 作为幂等标识，同一次提交重试不会创建两个案件。其他类型案件可自行添加办理程序。

切换当前程序必须验证程序属于当前案件；新增程序不改写原程序、不自动改变案件结案状态。阶段仅保存当前值，历史事件和自定义阶段管理后续完善。

删除案件采用软删除，子程序、待办和记录保留；软删除期间拒绝修改子记录，恢复后继续使用。此版本不提供永久删除。

SQLite 启用外键、WAL、FULL 同步和 busy timeout；迁移在事务中执行，通过 `user_version` 管理版本。遇到更高数据库版本拒绝打开，避免旧应用写坏新版数据。

0.1.1 的 `002_calendar_events.sql` 将数据库从版本 1 升至 2；自动保留原案件、程序、待办与工作记录，迁移回归测试使用独立的旧版数据库。升级后的数据库不能由 0.1.0 再次打开。

数据库由 `app.path().app_local_data_dir()` 确定位置，文件名 `workspace.sqlite3`。Windows 通常位于 `%LOCALAPPDATA%\com.limushu.hm\`；其他平台由 Tauri 定位。备份与恢复的正式方案仍待接入，不通过复制运行中的数据库文件实现备份。

Windows 绿色模式由 EXE 同目录的 `.portable` 标记启用，业务数据位于同目录的 `data/workspace.sqlite3`。主窗口在 setup 中手动创建，以 [WebviewWindowBuilder::data_directory](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html#method.data_directory) 将 WebView 缓存定向到 `data/webview/`。不支持绿色模式的平台忽略该标记。目录不可写时不回退到安装版目录；`storage_info` 命令为设置页返回当前模式和数据位置。

`npm run artifacts:portable` 从新建临时目录仅打包 EXE、标记和使用说明，不压缩既有绿色目录或个人数据库，生成 ZIP 和 SHA-256 校验文件。0.1.4 继续使用数据库版本 2。

## 本次范围与验收

首条流程：**新建案件 → 默认一审 → 新增/切换程序 → 待办和文字记录 → 退出并重开数据保留 → 删除恢复**。

界面延续已确认的 Notion 式右侧页内建案，名称是唯一必填项；有效名称失焦或回车提交，空白草稿关闭取消；可展开完整工作区。首页支持周/日时间表和月视图，案件待办自动呈现，无日期待办单独收起。

0.1.1 已接入独立日程及其案件关联。正式文件复制归档、录音、通知提醒、联系人及关系图、收支、自动备份、系统托盘和开机启动不属于当前已完成能力，不能因界面占位而视为实现。原型中已有的材料功能尚未接入正式 Rust 文件服务。

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

## 案件看板状态移动（0.1.4）

`set_case_status` 仅修改存活案件的状态与更新时间，校验目标状态存在，不以整份案件表单覆盖其他字段。看板使用 Pointer Events，兼容桌面 WebView 和浏览器触屏；横向滚动容器在边缘自动滚动。键盘空格拿起、方向键选列、回车放下、Escape 取消。界面先临时移动，命令成功后更新工作空间状态，失败恢复原列并保留重试入口。拖拽代码与样式位于 `src/features/cases/useBoardDrag.ts` 和 `case-board.css`，不额外引入拖拽依赖。
