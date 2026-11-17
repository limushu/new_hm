use hm_application::workspace::WorkspaceCell;
use hm_core::Store;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex, Weak,
};
#[test]
fn every_writer_notifies_after_unlock_reads_do_not_and_one_guard_coalesces_writes() {
    let slot = Arc::new(Mutex::new(None::<Weak<WorkspaceCell>>));
    let calls = Arc::new(AtomicUsize::new(0));
    let callback_slot = slot.clone();
    let callback_calls = calls.clone();
    let cell = Arc::new(WorkspaceCell::new(Store::memory().unwrap(), move || {
        callback_calls.fetch_add(1, Ordering::SeqCst);
        assert!(
            callback_slot
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .upgrade()
                .unwrap()
                .try_lock()
                .is_ok(),
            "callback held business lock"
        );
    }));
    *slot.lock().unwrap() = Some(Arc::downgrade(&cell));
    {
        let store = cell.lock().unwrap();
        store.workspace().unwrap();
    }
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    {
        let store = cell.lock().unwrap();
        store.set_setting("theme", "dark").unwrap();
        store.set_setting("close_to_tray", "true").unwrap();
    }
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    {
        let mut store = cell.lock().unwrap();
        store.mark_changed();
    }
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}
#[test]
fn partial_writes_are_observed_even_when_the_surrounding_action_returns_an_error() {
    let calls = Arc::new(AtomicUsize::new(0));
    let copy = calls.clone();
    let cell = WorkspaceCell::new(Store::memory().unwrap(), move || {
        copy.fetch_add(1, Ordering::SeqCst);
    });
    let result: Result<(), &str> = {
        let store = cell.lock().unwrap();
        store.set_setting("notifications", "false").unwrap();
        Err("later phase failed")
    };
    assert!(result.is_err());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}
