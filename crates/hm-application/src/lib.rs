//! Use cases depend on core rules and driver contracts, never Tauri or OS APIs.
pub mod backup;
pub mod dictation;
pub mod documents;
pub mod recording;
pub mod speech;
pub mod sync;

pub mod errors;

pub mod case_system;
pub mod identity;

pub mod agenda;
pub mod workspace;
