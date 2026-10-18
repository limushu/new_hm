use hm_core::*;
use uuid::Uuid;
fn archive(s: &mut Store) -> Case {
    s.create_case(CreateCase {
        id: Uuid::new_v4().to_string(),
        title: "凭据验收（虚构）".into(),
        case_type: "other".into(),
        status_id: "in_progress".into(),
        tags: None,
    })
    .unwrap()
}
fn entry(c: &Case) -> LedgerEntry {
    LedgerEntry {
        id: Uuid::new_v4().to_string(),
        case_id: c.id.clone(),
        proceeding_id: None,
        kind: "expense".into(),
        amount_cents: 12050,
        entry_date: "2026-10-18".into(),
        category: "交通费".into(),
        notes: String::new(),
        reimbursement: "pending".into(),
        material_id: None,
    }
}
#[test]
fn upload_and_money_commit_together_retry_is_idempotent_and_backup_keeps_receipt() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.sqlite3");
    let mut s = Store::open(&path).unwrap();
    let c = archive(&mut s);
    let e = entry(&c);
    let source = dir.path().join("出租车发票.txt");
    std::fs::write(&source, "original receipt").unwrap();
    let receipt = Uuid::new_v4().to_string();
    s.save_ledger_with_receipt(e.clone(), &source, &receipt)
        .unwrap();
    s.save_ledger_with_receipt(e.clone(), &source, &receipt)
        .unwrap();
    assert_eq!(s.materials().unwrap().len(), 1);
    assert_eq!(s.ledger_entries().unwrap().len(), 1);
    assert_eq!(
        s.ledger_entries().unwrap()[0].material_id.as_deref(),
        Some(receipt.as_str())
    );
    assert_eq!(
        std::fs::read_to_string(&source).unwrap(),
        "original receipt"
    );
    let backup = s.create_backup(&dir.path().join("backups"), false).unwrap();
    s.delete_ledger(&e.id).unwrap();
    s.restore_backup(std::path::Path::new(&backup.directory), true)
        .unwrap();
    drop(s);
    let s = Store::open(&path).unwrap();
    assert_eq!(s.ledger_entries().unwrap()[0].amount_cents, 12050);
    assert_eq!(
        std::fs::read_to_string(s.material_path(&receipt).unwrap()).unwrap(),
        "original receipt"
    );
}
#[test]
fn rejected_entry_or_missing_file_leaves_no_receipt_record_or_copied_file() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(&dir.path().join("workspace.sqlite3")).unwrap();
    let c = archive(&mut s);
    let mut e = entry(&c);
    let source = dir.path().join("票据.txt");
    std::fs::write(&source, "receipt").unwrap();
    let receipt = Uuid::new_v4().to_string();
    e.amount_cents = 0;
    assert!(s
        .save_ledger_with_receipt(e.clone(), &source, &receipt)
        .is_err());
    assert!(s.materials().unwrap().is_empty());
    assert!(s.ledger_entries().unwrap().is_empty());
    assert!(!dir
        .path()
        .join("materials")
        .join(&c.id)
        .join(&receipt)
        .exists());
    assert_eq!(std::fs::read_to_string(&source).unwrap(), "receipt");
    e.amount_cents = 123;
    assert!(s
        .save_ledger_with_receipt(e, &dir.path().join("missing.pdf"), &receipt)
        .is_err());
    assert!(s.materials().unwrap().is_empty());
    assert!(s.ledger_entries().unwrap().is_empty());
}
#[test]
fn replacing_retains_old_receipt_and_wrong_case_cannot_claim_an_existing_upload() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(&dir.path().join("workspace.sqlite3")).unwrap();
    let c = archive(&mut s);
    let other = archive(&mut s);
    let e = entry(&c);
    let source = dir.path().join("票据.txt");
    std::fs::write(&source, "receipt").unwrap();
    let first = Uuid::new_v4().to_string();
    let second = Uuid::new_v4().to_string();
    s.save_ledger_with_receipt(e.clone(), &source, &first)
        .unwrap();
    s.save_ledger_with_receipt(e, &source, &second).unwrap();
    assert_eq!(s.materials().unwrap().len(), 2);
    assert_eq!(
        s.ledger_entries().unwrap()[0].material_id.as_deref(),
        Some(second.as_str())
    );
    assert!(s
        .save_ledger_with_receipt(entry(&other), &source, &first)
        .is_err());
    assert_eq!(s.ledger_entries().unwrap().len(), 1);
    assert!(s.material_path(&first).is_ok());
}
#[test]
fn theme_is_a_validated_workspace_preference() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.sqlite3");
    let s = Store::open(&path).unwrap();
    s.set_setting("theme", "light").unwrap();
    assert!(s.set_setting("theme", "unknown").is_err());
    drop(s);
    assert_eq!(
        Store::open(&path)
            .unwrap()
            .setting("theme")
            .unwrap()
            .as_deref(),
        Some("light")
    );
}
