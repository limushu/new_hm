use hm_core::*;
use uuid::Uuid;

fn target(store: &mut Store) -> MaterialTarget {
    let item = store
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: "Document test".into(),
            case_type: "other".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap();
    MaterialTarget {
        case_id: item.id,
        proceeding_id: None,
        stage_id: None,
        parent_id: None,
        record_id: None,
    }
}

#[test]
fn text_documents_round_trip_reopen_and_preserve_duplicate_originals() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let target = target(&mut store);
    let first = store
        .create_text_document(
            target.clone(),
            "meeting.md",
            "# Notes\n<script>literal text</script>\n中文内容",
        )
        .unwrap();
    let second = store
        .create_text_document(target, "meeting.md", "Second copy")
        .unwrap();
    assert_ne!(first, second);
    assert_ne!(
        store.material(&first).unwrap().name,
        store.material(&second).unwrap().name
    );
    drop(store);
    let store = Store::open(&path).unwrap();
    assert_eq!(
        store.read_text_document(&first).unwrap(),
        "# Notes\n<script>literal text</script>\n中文内容"
    );
    assert_eq!(store.read_text_document(&second).unwrap(), "Second copy");
}

#[test]
fn text_documents_reject_invalid_payloads_and_foreign_targets_without_archiving() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("workspace.sqlite3")).unwrap();
    let target = target(&mut store);
    for (name, body) in [
        ("bad.html", "body"),
        ("empty.md", "  "),
        ("../outside.md", "body"),
    ] {
        assert!(store
            .create_text_document(target.clone(), name, body)
            .is_err());
    }
    assert!(store
        .create_text_document(target.clone(), "huge.md", &"a".repeat(2 * 1024 * 1024 + 1))
        .is_err());
    let mut wrong = target.clone();
    wrong.case_id = Uuid::new_v4().to_string();
    assert!(store
        .create_text_document(wrong, "missing.md", "body")
        .is_err());
    assert!(store.workspace().unwrap().materials.is_empty());
    assert!(!dir.path().join("outside.md").exists());
    let invalid = store
        .import_reader(
            &target,
            "invalid.txt",
            &mut std::io::Cursor::new([0xff, 0xfe]),
        )
        .unwrap();
    assert!(store.read_text_document(&invalid).is_err());
    let oversized = store
        .import_reader(
            &target,
            "oversized.txt",
            &mut std::io::Cursor::new(vec![b'x'; 2 * 1024 * 1024 + 1]),
        )
        .unwrap();
    assert!(store.read_text_document(&oversized).is_err());
}
