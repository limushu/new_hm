use hm_core::*;
use std::io::{Cursor, Read, Write};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

fn workspace(title: &str) -> (tempfile::TempDir, Store, String) {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("workspace.sqlite3")).unwrap();
    let case = store
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: title.into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
            tags: Some(vec!["虚构测试".into()]),
        })
        .unwrap();
    (root, store, case.id)
}
#[test]
fn portable_round_trip_preserves_workspace_bytes_and_destination_settings_with_recovery_copy() {
    let (_source_root, mut source, case) = workspace("备份来源");
    source.seed_example(&Uuid::new_v4().to_string()).unwrap();
    let audio = source
        .save_recording(
            MaterialTarget {
                case_id: case.clone(),
                proceeding_id: None,
                parent_id: None,
                record_id: None,
                stage_id: None,
            },
            "庭审.m4a",
            b"fictional audio",
        )
        .unwrap();
    let transcript = Uuid::new_v4().to_string();
    source
        .create_audio_transcript(&audio, &transcript, "转写.md", "虚构庭审文字")
        .unwrap();
    source
        .set_setting("backup_directory", "/another-device/backups")
        .unwrap();
    source.set_setting("theme", "dark").unwrap();
    let expected = serde_json::to_value(source.workspace().unwrap()).unwrap();
    let archive = source.create_backup_archive().unwrap();
    let prepared = PreparedBackup::read(&mut archive.open().unwrap()).unwrap();
    assert_eq!(prepared.info.case_count, 2);
    assert_eq!(prepared.info.file_count, 3);
    let (destination_root, mut destination, old_case) = workspace("恢复前数据");
    let local_backup = destination_root.path().join("local-backups");
    destination
        .set_setting("backup_directory", &local_backup.to_string_lossy())
        .unwrap();
    destination.set_setting("theme", "light").unwrap();
    assert!(prepared.restore(&mut destination, false).is_err());
    assert_eq!(destination.workspace().unwrap().cases[0].id, old_case);
    let recovery = prepared.restore(&mut destination, true).unwrap();
    assert_eq!(
        serde_json::to_value(destination.workspace().unwrap()).unwrap(),
        expected
    );
    assert_eq!(
        std::fs::read(destination.material_path(&audio).unwrap()).unwrap(),
        b"fictional audio"
    );
    assert_eq!(
        destination.read_text_document(&transcript).unwrap(),
        "虚构庭审文字"
    );
    assert_eq!(
        destination.setting("theme").unwrap().as_deref(),
        Some("light")
    );
    assert_eq!(
        destination.setting("backup_directory").unwrap().unwrap(),
        local_backup.to_string_lossy()
    );
    assert!(Store::inspect_backup(std::path::Path::new(&recovery.directory)).is_ok());
    // The pre-restore workspace remains recoverable, including its device settings.
    destination
        .restore_backup(std::path::Path::new(&recovery.directory), true)
        .unwrap();
    assert_eq!(destination.workspace().unwrap().cases[0].id, old_case);
}
fn archive_with(entries: Vec<(&str, &[u8])>) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in entries {
        writer
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().into_inner()
}
#[test]
fn rejects_traversal_links_extras_and_corrupt_material_before_restore() {
    for name in [
        "../escaped.txt",
        "/escaped.txt",
        "materials/../../escape",
        "materials\\escape",
        "C:/escape",
    ] {
        assert!(
            PreparedBackup::read(&mut Cursor::new(archive_with(vec![(name, b"no")]))).is_err(),
            "{name}"
        );
    }
    let (_root, source, case) = workspace("损坏测试");
    source
        .save_recording(
            MaterialTarget {
                case_id: case,
                proceeding_id: None,
                parent_id: None,
                record_id: None,
                stage_id: None,
            },
            "original.m4a",
            b"original",
        )
        .unwrap();
    let archive = source.create_backup_archive().unwrap();
    let mut original = ZipArchive::new(archive.open().unwrap()).unwrap();
    for extra in [false, true] {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        for index in 0..original.len() {
            let mut entry = original.by_index(index).unwrap();
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).unwrap();
            if !extra && entry.name().starts_with("materials/") {
                bytes.push(1);
            }
            writer
                .start_file(entry.name(), SimpleFileOptions::default())
                .unwrap();
            writer.write_all(&bytes).unwrap();
        }
        if extra {
            writer
                .start_file("materials/extra.txt", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"extra").unwrap();
        }
        assert!(
            PreparedBackup::read(&mut Cursor::new(writer.finish().unwrap().into_inner())).is_err()
        );
    }
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    writer
        .add_symlink(
            "materials/link",
            "/tmp/escape",
            SimpleFileOptions::default(),
        )
        .unwrap();
    assert!(PreparedBackup::read(&mut Cursor::new(writer.finish().unwrap().into_inner())).is_err());
    assert!(PreparedBackup::read(&mut Cursor::new(b"not a ZIP")).is_err());
}
