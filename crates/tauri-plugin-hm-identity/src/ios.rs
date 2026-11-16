use hm_runtime::platform::{DriverError, DriverResult, IdentityDriver};
use serde::Deserialize;
use tauri::{plugin::PluginHandle, Manager};
tauri::ios_plugin_binding!(init_plugin_hm_identity);
#[derive(Clone)]
struct IosIdentity(PluginHandle<tauri::Wry>);
#[derive(Deserialize)]
struct Reply {
    error: Option<String>,
    credential: Option<String>,
    callback: Option<String>,
}
impl IosIdentity {
    fn call(&self, command: &str, payload: serde_json::Value) -> DriverResult<Reply> {
        // Bridge errors can contain arguments; expose only a stable code.
        let reply: Reply = self
            .0
            .run_mobile_plugin(command, payload)
            .map_err(|_| DriverError::invalid_state("identity_bridge_failed"))?;
        if let Some(error) = reply.error {
            return Err(DriverError::invalid_state(&error));
        }
        Ok(reply)
    }
}
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-identity")
        .setup(|app, api| {
            app.manage(IosIdentity(
                api.register_ios_plugin(init_plugin_hm_identity)?,
            ));
            Ok(())
        })
        .build()
}
pub fn driver(app: &tauri::AppHandle) -> Box<dyn IdentityDriver> {
    Box::new(app.state::<IosIdentity>().inner().clone())
}
impl IdentityDriver for IosIdentity {
    fn installed(&self) -> bool {
        true
    }
    fn load(&self, project: &str) -> DriverResult<Option<String>> {
        Ok(self
            .call("loadCredential", serde_json::json!({"project":project}))?
            .credential)
    }
    fn save(&self, project: &str, credential: Option<&str>) -> DriverResult<()> {
        self.call(
            "saveCredential",
            serde_json::json!({"project":project,"credential":credential}),
        )?;
        Ok(())
    }
    fn authorize(&self, url: &str, callback: &str) -> DriverResult<String> {
        self.call(
            "authorize",
            serde_json::json!({"url":url,"callback":callback}),
        )?
        .callback
        .ok_or_else(|| DriverError::invalid_state("identity_callback_invalid"))
    }
}
