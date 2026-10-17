# 设计入口

当前以 Notion 为主要视觉参考：中性深灰、适度标题、可读正文、内容自适应分组和组间留白。当前配色与细节是暂定基线。

## 如何使用这些资料

| 位置 | 用途 |
| --- | --- |
| `current/` | 当前原型截图及已认可的方向参考，不代表正式应用全部实现 |
| `prototypes/` | 可交互 HTML 原型，使用临时虚构数据，重开即重置 |
| `archive/` | 历次评审、被替代的探索稿及生成提示词，保留供追溯 |

正式应用代码位于根目录 `src/`、`src-tauri/`、`crates/`；已实现范围见[项目进度](../progress.md)，业务约束见[需求文档](../requirements.md)。原型能力不能视为正式应用已完成。

## 当前参考

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
