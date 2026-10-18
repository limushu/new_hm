# 设计入口

1.3.2 重新平衡阅读与操作的视觉比例：[深色材料](current/materials-dark-1.3.2.png)、[浅色材料](current/materials-light-1.3.2.png)、[800×600 小窗口](current/materials-desktop-small-1.3.2.png)为实际渲染、虚构材料。标题与图标同行、属性行内排列，删除材料页重复标题及根目录路径；正文/文件名 15px、操作 14px、元信息 13px，常规文件行 44px，优先让内容进入首屏。此规则替代 1.3.1 的全局 16px 下限；仍保持真实内容清晰，不依赖小字说明解释布局。完整映射见[字体规范](typography.md)。


1.3.1 根据用户再次指出的小字与过多说明修订全局字体：[浅色材料](current/materials-light-1.3.1.png)、[深色材料](current/materials-dark-1.3.1.png)、[窄屏材料](current/materials-small-1.3.1.png)为实际界面、虚构文件。正文/文件名/路径/主要操作统一 16px，辅助信息 14px；灰色用于字段名、占位和提示，实际文件日期、大小、备注与标题同色。材料页不再重复办理路径，采用单一归档范围与可点击逐级文件夹路径，删除长段归档教程。窄屏通过换行与隐藏次要列适配，不能缩小正文。此规则替代历史版本中的 11/12/13px 主界面字号；完整映射见[字体规范](typography.md)。


1.3.1 的[Windows 原生浅色材料](current/materials-light-app-1.3.1.png)来自正式构建的隔离虚构工作区，CDP 验证中文实际为 Microsoft YaHei UI、拉丁为 Segoe UI，主要材料文字 16px。截图随 Windows DPI 缩放，未通过浏览器缩放放大。

1.3.0 的[浅色案件](current/case-light-1.3.0.png)、[深色案件](current/case-dark-1.3.0.png)、[浅色记账凭据](current/receipt-light-1.3.0.png)、[浅色看板](current/board-light-1.3.0.png)、[浅色日历](current/calendar-light-1.3.0.png)来自实际渲染，均为虚构示例。参考用户提供的 Notion 模板：浅色大底、柔和语义色、统一字形和图标；概览保持逐行分区。主标签前移、选中明确；路径用真实承接箭头，查看与关注分别标记，独立流程不假连线。主题规则见[字体与颜色规范](typography.md)。

1.3.0 的[Windows 原生浅色收支](current/finance-light-app-1.3.0.png)来自隔离虚构工作区，主题和凭据经过恢复与重启验证，材料、流程详情、收支仅保留紧凑路径导航，避免关系图挤占主要内容。

1.2.0 的[案件概览与我方身份](current/representation-overview-1.2.0.png)、[身份联想编辑](current/representation-editor-1.2.0.png)、[非诉模板编辑](current/workflow-template-1.2.0.png)使用虚构数据。概览按当前关注流程显示身份，法院和法官不替代委托关系；编辑使用共用深色选择器与联想浮层。各功能保持整行，卡片右上角明确删除，拖拽仅移动状态。

1.2.0 的[Windows 原生概览](current/representation-app-1.2.0.png)与[800×600 原生流程页](current/workflow-app-small-1.2.0.png)来自隔离虚构工作区，未读取个人数据；截图像素随系统 DPI 缩放。

1.1.4 的 [HM 手写花体标志](current/brand-1.1.4.png)采用黑色底层、不规则内层与青蓝紫渐变花体，H、M 共用中间笔画。几何 HM 为旧版，不再作为当前方向。阶段删除从当前阶段状态面板或管理阶段进入，确认后清空被删的当前阶段并保留历史与程序材料。

[案件概览](current/case-text-1.1.4.png)与[程序详情](current/program-text-1.1.4.png)使用虚构数据，展示正文、属性值与标题同色，灰色区分空值和辅助标签；不再堆叠操作说明。

[原生阶段删除后](current/stage-deletion-app-1.1.4.png)使用隔离虚构工作区，演示二审当前阶段清空、一审仍保持当前关注及其阶段；图中绿色模式标记仅为原生隔离验收方式，正式交付为安装版。

当前以 Notion 为主要视觉参考：中性深灰、适度标题、可读正文、内容自适应分组和组间留白。当前配色与细节是暂定基线。

1.1.3 的[状态联想](current/status-suggestions-1.1.3.png)与[标签联想](current/tag-suggestions-1.1.3.png)使用虚构数据。参考新的 Notion 详情截图，正文改为中性灰、功能分区标题统一字号与字重、属性使用一致的小型图标，案件页增加柔和书页标识。概览减少重复分隔线，以标题和组间距建立层次，继续保持每行一个功能。实际字体族保持离线系统映射，不声称使用了 Notion 的专有字体。

[案件页字体、图标与布局](current/case-notion-details-1.1.3.png)为本轮浏览器实渲染预览，使用虚构案件。

[原生更新面板](current/update-dialog-app-1.1.3.png)是在隔离 Windows 进程中发出私有模拟事件验证的界面；图中的 99.0.0 为虚构测试版本，没有发布此版本或发起安装。

1.1.2 程序详情调整：[宽屏侧页](current/case-programs-side-1.1.2.png)、[1024×768 小窗口](current/case-programs-small-1.1.2.png)、[800×600 最小桌面验收](current/case-programs-minimum-1.1.2.png)、[手机宽度布局](current/case-programs-mobile-1.1.2.png)使用浏览器与虚构数据，移动端安装包尚未发布。

正式 Windows 程序的[1024×768 原生窗口](current/case-programs-app-small-1.1.2.png)及[800×600 原生窗口](current/case-programs-app-minimum-1.1.2.png)在隔离虚构工作区拍摄；尺寸为逻辑客户区，截图像素随系统 DPI 缩放，未靠浏览器缩放模拟桌面窗口大小。

详情的阅读顺序是“正在查看的程序 → 当前办理阶段 → 程序资料 → 程序事项 → 案件联系人”。案号、前序、法院、法官各占一行属性。程序导航在详情页默认紧凑，按需展开关系图；不再重复提供程序选择下拉框。阶段帮助和变更历史按需展开，空分区只保留一行提示。

响应式以案件侧页容器宽度为准，而不是只看整个窗口。600px 以内的侧页阶段自动换行，资料始终逐行排列，工具栏允许换行，边距随可用宽度缩减；程序关系图的横向滚动仅发生在图内。选择菜单使用窗口边界定位，不能被侧页裁掉。字号仍遵循[字体规范](typography.md)，不靠整体缩小解决拥挤。

[HM 标志](current/brand-1.1.1.png)、[单列概览](current/case-overview-1.1.1.png)、[阶段重开](current/case-stage-reopen-1.1.1.png)为 1.1.1 历史预览。

1.1.1 正式 Windows 程序的[单列概览](current/case-overview-app-1.1.1.png)及[程序详情](current/case-programs-app-1.1.1.png)使用隔离虚构数据，窗口及任务栏实际图标均验证为 HM。

2026-10-18 布局修订：案件概览使用单列纵向阅读，每行一个功能分区。当前关注、案情摘要、相关人员、待办、案件日程、材料与工作记录依次占满内容宽度，用克制的间距与细分隔线建立层次；宽屏、展开侧页和窄屏均不把不同功能并排。办理路径中的程序节点仍属于同一个路径功能。

正式应用 1.1 的案件信息层次见[案件建模](../case-model.md)，字体、字号、字重与图标映射见[字体规范](typography.md)，品牌源与 Windows 图标配置见[品牌说明](brand.md)。[案件概览](current/case-overview-1.1.0.png)、[程序节点与详情](current/case-programs-1.1.0.png)、[收支图表](current/case-finance-1.1.0.png)、[AJ 标志](current/brand-1.1.0.png)使用虚构数据。

这些规范优先于下方历史原型说明；正式应用已实现材料管理、自定义状态和程序节点。

1.1 正式 Windows 程序的[案件概览](current/case-overview-app-1.1.0.png)、[程序详情](current/case-programs-app-1.1.0.png)为隔离虚构数据的实机截图。字号按[统一映射](typography.md)渲染，未读取用户已有案件。

## 如何使用这些资料

| 位置 | 用途 |
| --- | --- |
| `current/` | 当前原型截图及已认可的方向参考，不代表正式应用全部实现 |
| `prototypes/` | 可交互 HTML 原型，使用临时虚构数据，重开即重置 |
| `archive/` | 历次评审、被替代的探索稿及生成提示词，保留供追溯 |

正式应用代码位于根目录 `src/`、`src-tauri/`、`crates/`；已实现范围见[项目进度](../progress.md)，业务约束见[需求文档](../requirements.md)。原型能力不能视为正式应用已完成。

## 当前参考

0.1.4 案件看板按 10 月 18 日提供的 Notion 截图调整：状态胶囊、12px 卡片圆角、标题优先、柔和的中性/蓝/绿分组，列高跟随内容，保持页面留白。卡片没有常驻“⋯”，首列底部保留文字新建入口，各列标题提供小型“＋”。[当前看板](current/case-board-app-0.1.4.png)、[拖拽反馈](current/case-board-drag-app-0.1.4.png)、[窄屏布局](current/case-board-mobile-app-0.1.4.png)均使用虚构案件。跨列拖拽与键盘移动已接入正式存储，自定义状态仍未实现。


0.1.3 保留已认可的小月历＋周时间表布局，按最新反馈统一为暗蓝色（#162D46）卡片与蓝色（#295A8C）细侧边，保留深灰整体背景；参考用户提供的日历截图，整点使用细实线、半点使用更弱的虚线，红色仅保留给 1px 当前时间线。重叠日程仍等宽并排，不按案件关联或优先级区分卡片风格。时间线带时间标记，今天可定位当前时段；点击半小时格默认半小时。关联入口改为“＋ 关联案件”，按需搜索选择，选中后显示名称与“×”清除。[当前周视图](current/calendar-week-app-0.1.3.png)、[日程编辑](current/calendar-editor-app-0.1.3.png)、[加号关联入口](current/calendar-plus-association-0.1.3.png)使用虚构数据，当前配色仍待用户评审。

0.1.2 的灰色卡片已由上述蓝色修订替代，历史[周视图截图](archive/explorations/calendar-week-app-0.1.2.png)、[编辑截图](archive/explorations/calendar-editor-app-0.1.2.png)保留供追溯。

正式应用 0.1.1 已实现月历内创建和编辑日程：日期格“+”/双击空白处、轻量编辑面板、时间与全天分层、日程/待办筛选，以及下方当天详情。此版为待用户评审的实现，不将旧月历效果图视为当前页面的精确规格；通知提醒仍待实现。

- [打开案件原型](prototypes/case-board.html)：案件看板、侧页新建、展开案件工作区。
- [看板](current/case-board-neutral-v4.png)、[侧页详情](current/case-board-detail-neutral-v4.png)。
- [空白新建侧页](current/create-case-sidepage-v5.png)、[输入名称后](current/create-case-sidepage-filled-v5.png)。
- [完整案件概览](current/case-overview-browser-v6.png)、[办理程序](current/case-program-info-browser-v6.png)、[材料交互](current/case-materials-browser-v6.png)。
- 已认可的方向参考：[月历首页](current/home-calendar-dark-draft.png)、[案件概览](current/case-overview-dark.png)、[材料列表](current/case-materials-dark-v2.png)、[文件行菜单](current/case-materials-menu-dark-draft.png)、[PDF 预览](current/case-pdf-preview-dark-draft.png)。

## 必须延续的交互

- 侧页内新建案件，仅名称必填；有效名称失焦、回车或关闭时提交，空白草稿关闭取消。可展开完整案件工作区。
- 案件卡片点击进入，不加常驻“⋯”；原型的列标题提供“⋯ / +”，文字新建入口位于首列条目下方。自定义状态仍待正式实现。
- 完整工作区保留“概览 / 材料 / 案件信息 / 收支”；案件 → 办理程序 → 阶段，程序结束不等于案件结案。
- 材料采用文件列表，行尾仅“⋯”，右键提供同样菜单；复制归档，原文件不变，同名保留两份。这些材料能力尚待接入正式应用。

## 持续设计待办

- **DESIGN-NOTION-COLOR**：参考 Notion，整体校准背景、卡片、状态色和文字层级，避免逐页单独选色。当前色值不作为正式规范。
- **DESIGN-NOTION-DETAIL**：统一圆角、字体家族、字号、字重、行高及中文呈现；统一图标尺寸、线条和文字对齐。不能用整体放大或缩小代替设计。

完整讨论与每轮取舍保留在[设计评审归档](archive/decisions-2026-10-17.md)，包括已否定方案及原因。历史稿不作为当前实施方向。
