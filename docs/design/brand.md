# 案笺

2026-10-18 用户选定名称。案件为本，笺记工作：覆盖案件、日程、对象、材料和工作记录，保持个人本地软件的轻量感。

1.1 图标改为案笺拼音 AJ 的几何组合：浅色 A 门形与一笔蓝色 J，使用圆角深灰蓝底 `#243d50`、浅白 `#edf1f1`、辅助蓝 `#85bed9`。不再用容易被误认成系统空白文件的折页纸张，也不使用天平、法槌或渐变；16–32px 小尺寸保留两笔可辨识轮廓。普通文件图标继续使用统一的线性图标。

Windows 同时配置可执行文件资源图标、窗口图标和安装器快捷方式图标。稳定 AppUserModelID、安装目录注册标识保持兼容；不通过删除用户系统图标缓存掩盖配置问题。

本项目锁定的 Tauri 2.12 / tao 路径中，set_icon 仅设置 Windows ICON_SMALL。额外通过 [windows_icon.rs](../../src-tauri/src/windows_icon.rs) 在 UI 线程设置 ICON_BIG，持有独立 CopyIcon 副本并在退出时释放，避免任务栏仍显示通用文件图标。原生验收分别读取 exe 资源、窗口小图标和大图标，不只检查侧栏图片。

矢量源为 [app-icon.svg](../../public/app-icon.svg)，Windows、macOS 和移动平台图标由 `npx tauri icon public/app-icon.svg --output src-tauri/icons` 生成。品牌仅改变显示名称，应用标识、升级公钥、本地数据位置与旧安装注册标识保持兼容。

安装器沿用 Tauri 模板并固定旧注册表身份，见 [installer.nsi](../../src-tauri/windows/installer.nsi)。模板源码来自 [Tauri 官方仓库](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)，更新 CLI 时应核对上游模板变化。启动项也沿用原身份，避免改名造成重复自启动。
