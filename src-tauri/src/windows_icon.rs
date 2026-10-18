use windows_sys::Win32::UI::WindowsAndMessaging::{
    CopyIcon, DestroyIcon, SendMessageW, HICON, ICON_BIG, ICON_SMALL, WM_GETICON, WM_SETICON,
};

// Own a separate copy: replacing the small icon must not invalidate the taskbar icon.
pub(crate) struct TaskbarIcon(isize);
impl Drop for TaskbarIcon {
    fn drop(&mut self) {
        // SAFETY: CopyIcon created this handle, retained until desktop state is dropped.
        unsafe { DestroyIcon(self.0 as HICON) };
    }
}
pub(crate) fn set_taskbar_icon(window: &tauri::WebviewWindow) -> Result<TaskbarIcon, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    // SAFETY: called on this window's UI thread, after Tauri sets its small icon.
    // Tauri 2.12 set_icon sets ICON_SMALL only; Explorer also needs ICON_BIG.
    let icon = unsafe {
        let small = SendMessageW(hwnd, WM_GETICON, ICON_SMALL as usize, 0) as HICON;
        if small.is_null() {
            return Err("窗口小图标尚未设置".into());
        }
        CopyIcon(small)
    };
    if icon.is_null() {
        return Err(std::io::Error::last_os_error().to_string());
    }
    // SAFETY: hwnd belongs to this app and the copied icon remains owned by DesktopState.
    unsafe { SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, icon as isize) };
    Ok(TaskbarIcon(icon as isize))
}
