use hm_runtime::platform::{DriverError, DriverResult, HostDriver};
use serde::Deserialize;
use tauri::{plugin::PluginHandle, Manager};
tauri::ios_plugin_binding!(init_plugin_hm_host);
#[derive(Clone)]
struct IosHost(PluginHandle<tauri::Wry>);
#[derive(Deserialize)]
struct Reply {
    error: Option<String>,
}
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-host")
        .setup(|app, api| {
            app.manage(IosHost(api.register_ios_plugin(init_plugin_hm_host)?));
            Ok(())
        })
        .build()
}
pub fn driver(app: &tauri::AppHandle) -> Box<dyn HostDriver> {
    Box::new(app.state::<IosHost>().inner().clone())
}
impl HostDriver for IosHost {
    fn set_theme(&self, theme: Option<&str>) -> DriverResult<()> {
        let reply: Reply = self
            .0
            .run_mobile_plugin("setTheme", serde_json::json!({"theme":theme}))
            .map_err(|_| DriverError::invalid_state("host_theme_failed"))?;
        if let Some(code) = reply.error {
            return Err(DriverError::invalid_state(code));
        }
        Ok(())
    }
}
