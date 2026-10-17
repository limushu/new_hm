use hm_core::{StorageLocation, Store};

#[test]
fn portable_uses_executable_folder_and_installed_mode_keeps_existing_path() {
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("portable app 中文");
    std::fs::create_dir(&folder).unwrap();
    let exe = folder.join("workbench.exe");
    let installed = temp.path().join("user/appdata");
    let normal = StorageLocation::resolve(&exe, &installed, true);
    assert!(!normal.portable);
    assert_eq!(normal.data_directory, installed);
    std::fs::write(folder.join(".portable"), "portable").unwrap();
    let location = StorageLocation::resolve(&exe, &installed, true);
    assert!(location.portable);
    assert_eq!(location.data_directory, folder.join("data"));
    Store::open(&location.data_directory.join("workspace.sqlite3")).unwrap();
    assert!(folder.join("data/workspace.sqlite3").is_file());
    assert!(!installed.exists());
    assert!(!StorageLocation::resolve(&exe, &installed, false).portable);
}

#[test]
fn unwritable_portable_location_never_silently_falls_back() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join(".portable"), "portable").unwrap();
    std::fs::write(temp.path().join("data"), "blocked by a regular file").unwrap();
    let installed = temp.path().join("appdata");
    let location = StorageLocation::resolve(&temp.path().join("app.exe"), &installed, true);
    assert!(location.portable);
    assert!(Store::open(&location.data_directory.join("workspace.sqlite3")).is_err());
    assert!(!installed.exists());
}
