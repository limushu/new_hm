use hm_core::{CreateCase, StorageLocation, Store};

#[test]
fn sandbox_ignores_portable_markers_and_persists_across_reopen() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join(".portable"), "portable").unwrap();
    let directory = temp.path().join("应用沙盒");
    let location = StorageLocation::sandbox(&directory);
    assert!(!location.portable);
    assert_eq!(location.data_directory, directory);
    let mut store = Store::open(&location.data_directory.join("workspace.sqlite3")).unwrap();
    store.set_setting("theme", "light").unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    store
        .create_case(CreateCase {
            id: id.clone(),
            title: "移动沙盒持久化（虚构）".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap();
    drop(store);
    let reopened = Store::open(
        &StorageLocation::sandbox(&directory)
            .data_directory
            .join("workspace.sqlite3"),
    )
    .unwrap();
    assert_eq!(reopened.setting("theme").unwrap().as_deref(), Some("light"));
    assert_eq!(
        reopened
            .workspace()
            .unwrap()
            .cases
            .iter()
            .find(|case| case.id == id)
            .unwrap()
            .title,
        "移动沙盒持久化（虚构）"
    );
    assert!(!temp.path().join("data").exists());
}

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
