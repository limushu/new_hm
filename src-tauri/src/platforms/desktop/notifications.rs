use hm_runtime::platform::{
    Authorization, DeviceNotification, DriverError, DriverResult, NotificationDriver,
    NotificationMode, NotificationSupport,
};
use tauri_plugin_notification::{NotificationExt, PermissionState};
pub struct DesktopNotifications(pub tauri::AppHandle);
fn auth(value: PermissionState) -> Authorization {
    match value {
        PermissionState::Granted => Authorization::Granted,
        PermissionState::Denied => Authorization::Denied,
        _ => Authorization::NotDetermined,
    }
}
impl NotificationDriver for DesktopNotifications {
    fn support(&self) -> DriverResult<NotificationSupport> {
        let permission = self
            .0
            .notification()
            .permission_state()
            .map_err(DriverError::io)?;
        Ok(NotificationSupport {
            installed: true,
            authorization: auth(permission),
            mode: NotificationMode::Immediate,
            pending_limit: 0,
        })
    }
    fn request_authorization(&self) -> DriverResult<Authorization> {
        self.0
            .notification()
            .request_permission()
            .map(auth)
            .map_err(DriverError::io)
    }
    fn show(&self, message: &DeviceNotification) -> DriverResult<()> {
        self.0
            .notification()
            .builder()
            .title(&message.title)
            .body(&message.body)
            .show()
            .map_err(DriverError::io)
    }
}
