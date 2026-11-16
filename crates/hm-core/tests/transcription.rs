use hm_core::*;
use uuid::Uuid;

fn setup() -> (tempfile::TempDir, Store, String) {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("workspace.sqlite3")).unwrap();
    let case = store
        .create_case(CreateCase {
            id: Uuid::new_v4().to_string(),
            title: "Speech fixture".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
            tags: None,
        })
        .unwrap();
    let id = store
        .save_recording(
            MaterialTarget {
                case_id: case.id,
                proceeding_id: None,
                parent_id: None,
                record_id: None,
                stage_id: None,
            },
            "original.m4a",
            b"fictional-audio-bytes",
        )
        .unwrap();
    (root, store, id)
}
#[test]
fn transcript_and_source_relation_persist_without_modifying_or_duplicating_audio() {
    let (root, store, audio) = setup();
    let bytes = std::fs::read(store.material_path(&audio).unwrap()).unwrap();
    let id = Uuid::new_v4().to_string();
    let text = "[00:00] Fictional, manually checked transcript.";
    assert_eq!(
        store
            .create_audio_transcript(&audio, &id, "Transcript.md", text)
            .unwrap(),
        id
    );
    assert_eq!(
        store
            .create_audio_transcript(&audio, &id, "Transcript.md", text)
            .unwrap(),
        id
    );
    assert!(store
        .create_audio_transcript(&audio, &id, "Changed.md", "Must not overwrite")
        .is_err());
    drop(store);
    let store = Store::open(&root.path().join("workspace.sqlite3")).unwrap();
    assert_eq!(store.materials().unwrap().len(), 2);
    assert_eq!(store.read_text_document(&id).unwrap(), text);
    assert_eq!(
        std::fs::read(store.material_path(&audio).unwrap()).unwrap(),
        bytes
    );
    let relation = store.resource_relations().unwrap().pop().unwrap();
    assert_eq!(relation.kind, "transcript_of");
    assert_eq!(relation.source.id, id);
    assert_eq!(relation.target.id, audio);
}
#[test]
fn relation_failure_rolls_back_the_derived_file_and_material_row() {
    let (root, store, audio) = setup();
    let id = Uuid::new_v4().to_string();
    let directory = store
        .material_path(&audio)
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join(&id);
    let db = rusqlite::Connection::open(root.path().join("workspace.sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER reject_transcript BEFORE INSERT ON resource_relations WHEN NEW.kind='transcript_of' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;").unwrap();
    assert!(store
        .create_audio_transcript(&audio, &id, "Transcript.md", "Draft")
        .is_err());
    assert!(!directory.exists());
    assert_eq!(store.materials().unwrap().len(), 1);
    assert!(store.resource_relations().unwrap().is_empty());
    assert_eq!(
        std::fs::read(store.material_path(&audio).unwrap()).unwrap(),
        b"fictional-audio-bytes"
    );
}
#[test]
fn invalid_or_deleted_sources_cannot_create_transcripts() {
    let (_root, mut store, audio) = setup();
    let item = store.material(&audio).unwrap();
    let target = MaterialTarget {
        case_id: item.case_id,
        proceeding_id: None,
        parent_id: None,
        record_id: None,
        stage_id: None,
    };
    let text = store
        .create_text_document(target, "Source.txt", "Not audio")
        .unwrap();
    assert!(store
        .create_audio_transcript(&text, &Uuid::new_v4().to_string(), "Bad.md", "Draft")
        .is_err());
    assert!(store
        .create_audio_transcript(&audio, &Uuid::new_v4().to_string(), "Bad.pdf", "Draft")
        .is_err());
    assert!(store
        .create_audio_transcript(&audio, &Uuid::new_v4().to_string(), "Empty.md", " ")
        .is_err());
    store.trash_item("material", &audio).unwrap();
    assert!(store
        .create_audio_transcript(&audio, &Uuid::new_v4().to_string(), "Deleted.md", "Draft")
        .is_err());
    assert_eq!(store.materials().unwrap().len(), 2);
}
