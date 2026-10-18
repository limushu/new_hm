# 字体映射规范

## 字体族

应用 UI 统一使用 styles.css 中 --font-ui：Segoe UI、Microsoft YaHei UI、PingFang SC、Microsoft YaHei、system-ui、sans-serif，按平台可用字体依次回退。Windows 拉丁字符通常使用 Segoe UI，中文使用 Microsoft YaHei UI；macOS 中文使用 PingFang SC。统一原则是同一平台下相同内容角色一致，而非强制所有平台加载同一个外部字体。

按钮、输入框、下拉框、弹层、日期选择器、SVG 图内文字继承同一字体族，不让原生控件落回另一套字体。font-synthesis: none 避免浏览器制造伪粗体。无需联网下载字体，保持离线可用。

## 语义尺寸

所有应用 CSS 引用全局变量，不在组件中另写任意字号。根变量定义是像素值的唯一来源。

| 变量 | 大小 | 用途 |
| --- | --- | --- |
| --text-xs | 11px | 辅助标记、标签数量、图注 |
| --text-sm | 12px | 次要说明、字段名、紧凑菜单与日程元信息 |
| --text-base | 13px | 默认界面、列表、按钮、属性值 |
| --text-body | 14px | 阅读正文、主要卡片、分区标题 |
| --text-heading | 16px | 对话框及信息组标题 |
| --text-title-sm | 18px | 当前程序摘要、统计数字 |
| --text-title | 22px | 局部页面标题 |
| --text-display-mobile | 24px | 窄屏主标题 |
| --text-display | 28px | 案件名称及宽屏主标题 |

数字不随重要性无限放大。小字最小 11px；文本可读性主要靠对比、留白和层级，不靠增加所有控件高度。

## 字重、行距与图标

正文使用 400，强调、选中项使用 500，标题使用 600。避免 550 等缺乏跨平台一致性的中间字重。正文默认行高 1.5；标题和紧凑按钮可按现有组件使用更紧的行高，禁止用固定高度裁掉中文基线。

金额、时间、日期和统计数使用 font-variant-numeric: tabular-nums，以便对齐。图表中的金额与账目共用金额格式化，不在图中省略影响理解的单位。默认界面图标使用同一 Lucide 线性图标族，常规 16px，辅助 12–14px；品牌标志使用独立 SVG，不把 emoji 混作功能图标。

## 检查方式

检查案件标题、案号输入、Select 弹层、DateField、侧栏、联系对象及 SVG 图表的 computed font-family；Windows 原生 WebView2 再用 CDP 检查中文实际渲染字体。确认日期和数字没有使用另一套系统原生控件字体。

不改写用户材料本身的排版：PDF、图片、导入文档的预览保持原文件字体与内容。历史 HTML 设计原型不是应用 CSS 的规范来源。
