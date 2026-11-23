use hm_runtime::platform::{DriverError, DriverResult, HostDriver};
use serde::Deserialize;
use tauri::{plugin::PluginHandle, Manager};
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_hm_host);
#[derive(Clone)]
struct MobileHost(PluginHandle<tauri::Wry>);
#[derive(Deserialize)]
struct Reply {
    error: Option<String>,
    foreground: Option<bool>,
}
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-host")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_hm_host)?;
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin("com.limushu.hm.host", "HostPlugin")?;
            app.manage(MobileHost(handle));
            Ok(())
        })
        .build()
}
pub fn driver(app: &tauri::AppHandle) -> Box<dyn HostDriver> {
    Box::new(app.state::<MobileHost>().inner().clone())
}
impl HostDriver for MobileHost {
    fn foreground(&self) -> DriverResult<Option<bool>> {
        let reply: Reply = self
            .0
            .run_mobile_plugin("foreground", serde_json::json!({}))
            .map_err(|_| DriverError::invalid_state("host_state_failed"))?;
        if let Some(code) = reply.error {
            return Err(DriverError::invalid_state(&code));
        }
        reply
            .foreground
            .map(Some)
            .ok_or_else(|| DriverError::invalid_state("host_state_failed"))
    }
    fn set_theme(&self, theme: Option<&str>) -> DriverResult<()> {
        let reply: Reply = self
            .0
            .run_mobile_plugin("setTheme", serde_json::json!({"theme":theme}))
            .map_err(|_| DriverError::invalid_state("host_theme_failed"))?;
        if let Some(code) = reply.error {
            return Err(DriverError::invalid_state(&code));
        }
        Ok(())
    }
}
