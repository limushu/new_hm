use std::{
    mem::size_of,
    os::windows::ffi::{OsStrExt, OsStringExt},
    path::Path,
    ptr,
};
use tauri::Manager;
use windows_sys::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows_sys::Win32::UI::Shell::{
    SHChangeNotify, SHGetFileInfoW, SHUpdateImageW, SHCNE_UPDATEITEM, SHCNF_FLUSHNOWAIT,
    SHCNF_PATHW, SHFILEINFOW, SHGFI_ICONLOCATION, SHGFI_SYSICONINDEX,
};
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
    // SAFETY: hwnd belongs to this app and the copied icon remains owned by HostState.
    unsafe { SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, icon as isize) };
    Ok(TaskbarIcon(icon as isize))
}
// WM_SETICON does not invalidate Explorer's separately cached taskbar group icon.
// Refresh the old icon's system image-list entry, rather than clearing the user's
// global cache, restarting Explorer, or changing the stable AppUserModelID.
pub(crate) fn refresh_shell_icons(app: &tauri::AppHandle) -> Result<(), String> {
    // Shell extraction requires COM; never change the UI thread's apartment.
    let initialized = unsafe { CoInitializeEx(ptr::null(), COINIT_APARTMENTTHREADED as u32) };
    if initialized < 0 {
        return Err(format!("Shell 图标初始化失败：{initialized:#x}"));
    }
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            // SAFETY: balances this worker's successful CoInitializeEx, including S_FALSE.
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = Apartment;
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    refresh_shell_icon(&executable)?;
    let resource = app
        .path()
        .resolve("branding/hm-mark.ico", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    // A legacy standalone/portable exe may have no external branding resource.
    if resource.is_file() {
        refresh_shell_icon(&resource)?;
    }
    let mut folders = Vec::new();
    if let Ok(desktop) = app.path().desktop_dir() {
        folders.push(desktop);
    }
    if let Ok(roaming) = app.path().data_dir() {
        let programs = roaming.join("Microsoft/Windows/Start Menu/Programs");
        folders.push(programs.join("案笺"));
        folders.push(programs);
    }
    let owned_icons: Vec<_> = [&executable, &resource]
        .into_iter()
        .filter_map(|p| p.canonicalize().ok())
        .collect();
    for folder in folders {
        for name in ["案笺.lnk", "律师工作台.lnk"] {
            let shortcut = folder.join(name);
            if !shortcut.is_file() {
                continue;
            }
            let wide = shell_path(&shortcut);
            let mut location = SHFILEINFOW::default();
            // SAFETY: initialized COM worker; sized writable struct and live path.
            if unsafe {
                SHGetFileInfoW(
                    wide.as_ptr(),
                    0,
                    &mut location,
                    size_of::<SHFILEINFOW>() as u32,
                    SHGFI_ICONLOCATION,
                )
            } == 0
            {
                continue;
            }
            let end = location
                .szDisplayName
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(0);
            let icon = std::ffi::OsString::from_wide(&location.szDisplayName[..end]);
            // The actual icon resource must belong to this installation. Never
            // rewrite a link's target, arguments, location or other user metadata.
            if let Ok(icon) = Path::new(&icon).canonicalize() {
                if owned_icons.iter().any(|p| {
                    p.as_os_str()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(&icon.as_os_str().to_string_lossy())
                }) {
                    refresh_shell_icon(&shortcut)?;
                }
            }
        }
    }
    Ok(())
}

fn refresh_shell_icon(path: &Path) -> Result<(), String> {
    let display = path.display().to_string();
    let path = shell_path(path);
    let mut location = SHFILEINFOW::default();
    let mut image = SHFILEINFOW::default();
    let size = size_of::<SHFILEINFOW>() as u32;
    // SAFETY: these are valid, NUL-terminated paths owned by this installation;
    // output structs are correctly sized. Neither flag allocates an owned HICON.
    let located =
        unsafe { SHGetFileInfoW(path.as_ptr(), 0, &mut location, size, SHGFI_ICONLOCATION) };
    let indexed = unsafe { SHGetFileInfoW(path.as_ptr(), 0, &mut image, size, SHGFI_SYSICONINDEX) };
    if located == 0 || indexed == 0 {
        return Err(format!("无法读取 Shell 图标缓存项 {display} (location={located}, image={indexed}, size={size})"));
    }
    if location.szDisplayName[0] != 0 && location.szDisplayName.contains(&0) {
        // SAFETY: use the OLD icon's actual location/index and system-list index,
        // as required by SHUpdateImageW. Only this image entry is invalidated.
        unsafe {
            SHUpdateImageW(
                location.szDisplayName.as_ptr(),
                location.iIcon,
                0,
                image.iIcon,
            );
        }
    }
    // SAFETY: path remains alive for the call. This is a per-item notification,
    // not SHCNE_ASSOCCHANGED, which would invalidate unrelated cached icons.
    unsafe {
        SHChangeNotify(
            SHCNE_UPDATEITEM as i32,
            SHCNF_PATHW | SHCNF_FLUSHNOWAIT,
            path.as_ptr().cast(),
            ptr::null(),
        );
    }
    Ok(())
}

fn shell_path(path: &Path) -> Vec<u16> {
    // Resource resolution can return verbatim paths. Shell APIs do not accept
    // that filesystem namespace; preserve UTF-16 while restoring normal syntax.
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    let prefix: Vec<u16> = r"\\?\".encode_utf16().collect();
    if let Some(body) = wide.strip_prefix(prefix.as_slice()) {
        if body.get(1) == Some(&(b':' as u16)) {
            wide = body.to_vec();
        } else if body.starts_with(&[b'U' as u16, b'N' as u16, b'C' as u16, b'\\' as u16]) {
            wide = [b'\\' as u16, b'\\' as u16]
                .into_iter()
                .chain(body[4..].iter().copied())
                .collect();
        }
    }
    wide.push(0);
    wide
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shell_paths_preserve_unicode_and_normalize_disk_and_unc_namespaces() {
        for (input, expected) in [
            (r"\\?\F:\案笺\图标.ico", r"F:\案笺\图标.ico"),
            (r"\\?\UNC\server\共享\图标.ico", r"\\server\共享\图标.ico"),
            (r"F:\案笺\图标.ico", r"F:\案笺\图标.ico"),
        ] {
            let wide = shell_path(Path::new(input));
            assert_eq!(wide.last(), Some(&0));
            assert_eq!(
                std::ffi::OsString::from_wide(&wide[..wide.len() - 1]),
                expected
            );
        }
    }
}
