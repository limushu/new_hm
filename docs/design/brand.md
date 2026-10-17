# 案笺

2026-10-18 用户选定名称。案件为本，笺记工作：覆盖案件、日程、对象、材料和工作记录，保持个人本地软件的轻量感。

图标使用折页案卷和后方的一页纸。深灰蓝底 `#263e51`、纸页 `#e5edf1`、辅助蓝 `#8cb7d3`，不使用天平、法槌或渐变。线条在小图标尺寸下保持清楚；界面中的普通文件图标继续使用统一的线性图标。

矢量源为 [app-icon.svg](../../public/app-icon.svg)，Windows、macOS 和移动平台图标由 `npx tauri icon public/app-icon.svg --output src-tauri/icons` 生成。品牌仅改变显示名称，应用标识、升级公钥、本地数据位置与旧安装注册标识保持兼容。

安装器沿用 Tauri 模板并固定旧注册表身份，见 [installer.nsi](../../src-tauri/windows/installer.nsi)。模板源码来自 [Tauri 官方仓库](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)，更新 CLI 时应核对上游模板变化。启动项也沿用原身份，避免改名造成重复自启动。
