use crate::{access, AppState};
#[cfg(windows)]
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

#[derive(Default)]
pub struct HostState {
    #[cfg(windows)]
    icons: Mutex<Vec<crate::platforms::desktop::windows_icon::TaskbarIcon>>,
}

pub(super) fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_window(app)
        }))
        // Preserve the original installation identity through display-name changes.
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("律师工作台")
                .build(),
        )
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray =
                    access(&window.state::<AppState>(), |s| s.setting("close_to_tray"))
                        .ok()
                        .flatten()
                        .is_none_or(|v| v != "false");
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
#[tauri::command]
pub fn autostart_status(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|e| e.to_string())
}
pub(super) fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(HostState::default());
    // Explicitly set the window icon as well as the executable/installer icons.
    // This also covers the separately-created legacy portable window.
    if let Some(icon) = app.default_window_icon() {
        for window in app.webview_windows().values() {
            window.set_icon(icon.clone())?;
            #[cfg(windows)]
            {
                let owned = window.clone();
                window.run_on_main_thread(move || {
                    match crate::platforms::desktop::windows_icon::set_taskbar_icon(&owned) {
                        Ok(icon) => {
                            if let Ok(mut icons) = owned.state::<HostState>().icons.lock() {
                                icons.push(icon);
                            }
                        }
                        Err(error) => {
                            super::health::report(
                                owned.app_handle(),
                                std::collections::BTreeMap::from([("iconError".into(), error)]),
                            );
                        }
                    }
                })?;
            }
        }
    }
    #[cfg(windows)]
    {
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            let result = crate::platforms::desktop::windows_icon::refresh_shell_icons(&handle);
            let status = match result {
                Ok(()) => ("iconCacheReady".into(), "true".into()),
                Err(error) => ("iconCacheError".into(), error),
            };
            super::health::report(&handle, std::collections::BTreeMap::from([status]));
        });
    }
    let show = tauri::menu::MenuItem::with_id(app, "show", "打开案笺", true, None::<&str>)?;
    let quit = tauri::menu::MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
    let mut tray = tauri::tray::TrayIconBuilder::with_id("main")
        .tooltip("案笺 · 后台提醒运行中")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                tauri::tray::TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Left,
                    button_state: tauri::tray::MouseButtonState::Up,
                    ..
                }
            ) {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
pub fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
