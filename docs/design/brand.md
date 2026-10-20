# 案笺

2026-10-18 用户选定名称。案件为本，笺记工作：覆盖案件、日程、对象、材料和工作记录，保持个人本地软件的轻量感。

1.1.4 按用户指定改为手写花体 HM：H 对应用户、M 对应其妻子的名字首字母。两个字母共用中间的倾斜笔画，以细连笔、较厚下行笔画和自然收笔组成一体的签名字形。按用户建议参考无边记的自由形状与层叠思路，采用黑色 `#08090b` 底层、不规则深灰内层，以及从青色 `#a4eee5`、蓝色 `#92bdf7` 到淡紫 `#c6a0ef` 的连续字形渐变。两个字母共用同一个渐变，不分别切色。参考来源为 [Apple 无边记](https://support.apple.com/guide/freeform/welcome/mac)，本图标保留自绘 HM 字形与轮廓。

字形由贝塞尔矢量路径直接绘制，不调用或分发额外手写字体。细线适当加重以适配小图标；[尺寸预览](current/brand-1.1.4.png)按实际 16、20、24、32、48px 渲染，小尺寸会减少书写细节，完整连笔在 24px 及以上更清楚。1.1.1 的几何 HM、AJ 与折页纸张均属于历史标志，普通文件图标继续使用统一的线性图标。

Windows 同时配置可执行文件资源图标、窗口图标和安装器快捷方式图标。稳定 AppUserModelID、安装目录注册标识保持兼容；不通过删除用户系统图标缓存掩盖配置问题。

安装包额外携带 branding/hm-mark.ico，快捷方式明确引用该文件，不再依赖 exe 的默认图标索引，避免沿用旧折页图标的快捷方式缓存。已在运行的旧程序仍使用其加载时的资源，需用户退出旧实例、安装并重新启动后显示新版图标；不会为换图标强制关闭用户正在工作的程序。

在线升级模式通常跳过新建快捷方式，因此安装模板还会仅为目标等于本安装 exe 的已有快捷方式更新 IconLocation，保留启动参数、工作目录及描述；不创建用户主动删除的入口，不改其他安装目录的链接，并只通知 Explorer 更新该链接。[隔离快捷方式测试](../../tests/native/shortcut-icons.ps1)使用临时链接验证这些规则，不安装到用户注册表或桌面。

本项目锁定的 Tauri 2.12 / tao 路径中，set_icon 仅设置 Windows ICON_SMALL。额外通过 [windows_icon.rs](../../src-tauri/src/platforms/desktop/windows_icon.rs) 在 UI 线程设置 ICON_BIG，持有独立 CopyIcon 副本并在退出时释放，避免任务栏仍显示通用文件图标。原生验收分别读取 exe 资源、窗口小图标和大图标，不只检查侧栏图片。

矢量源为 [app-icon.svg](../../public/app-icon.svg)，Windows、macOS 和移动平台图标由 `npx tauri icon public/app-icon.svg --output src-tauri/icons` 生成。品牌仅改变显示名称，应用标识、升级公钥、本地数据位置与旧安装注册标识保持兼容。

安装器沿用 Tauri 模板并固定旧注册表身份，见 [installer.nsi](../../src-tauri/windows/installer.nsi)。模板源码来自 [Tauri 官方仓库](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)，更新 CLI 时应核对上游模板变化。启动项也沿用原身份，避免改名造成重复自启动。

1.2.0 补充 Windows Shell 缓存同步：窗口图标与 Shell 任务栏分组图标是不同来源。启动时在独立 COM 线程中定向通知本安装 exe、branding/hm-mark.ico 及图标资源属于本安装的已存在快捷方式，保留全部快捷方式属性。仅在旧图像资源位置非空时使用其实际位置与索引更新图像项；资源解析返回的 Windows verbatim 路径先恢复普通 UTF-16 Shell 路径。后台状态分别报告窗口和缓存错误，不把 exe 资源检查当成实际任务栏验收。
