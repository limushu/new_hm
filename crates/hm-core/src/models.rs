use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaseStatus {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub id: String,
    pub title: String,
    pub case_type: String,
    pub status_id: String,
    pub current_proceeding_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Proceeding {
    pub id: String,
    pub case_id: String,
    pub kind: String,
    pub stage: String,
    pub case_number: String,
    pub court: String,
    pub judge: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub case_id: String,
    pub title: String,
    pub due_date: Option<String>,
    pub completed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkRecord {
    pub id: String,
    pub case_id: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub statuses: Vec<CaseStatus>,
    pub cases: Vec<Case>,
    pub proceedings: Vec<Proceeding>,
    pub tasks: Vec<Task>,
    pub work_records: Vec<WorkRecord>,
    pub calendar_events: Vec<CalendarEvent>,
    pub materials: Vec<Material>,
    pub contacts: Vec<Contact>,
    pub contact_links: Vec<ContactLink>,
    pub ledger_entries: Vec<LedgerEntry>,
    pub case_details: Vec<CaseDetail>,
    pub stages: Vec<Stage>,
    pub case_events: Vec<CaseEvent>,
    pub deleted_records: Vec<WorkRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub case_id: Option<String>,
    pub location: String,
    pub notes: String,
    #[serde(default)]
    pub reminder_minutes: Option<i64>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCase {
    pub id: String,
    pub title: String,
    pub case_type: String,
    pub status_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCase {
    pub id: String,
    pub title: String,
    pub case_type: String,
    pub status_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProceeding {
    pub id: String,
    pub stage: String,
    pub case_number: String,
    pub court: String,
    pub judge: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTask {
    pub case_id: String,
    pub title: String,
    pub due_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: String,
    pub case_id: String,
    pub proceeding_id: Option<String>,
    pub parent_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub size: u64,
    pub notes: String,
    pub record_id: Option<String>,
    pub created_at: String,
    pub deleted_at: Option<String>,
    pub trash_group: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MaterialTarget {
    pub case_id: String,
    pub proceeding_id: Option<String>,
    pub parent_id: Option<String>,
    #[serde(default)]
    pub record_id: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: usize,
    pub errors: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub phone: String,
    pub address: String,
    pub notes: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContactLink {
    pub id: String,
    pub contact_id: String,
    pub case_id: String,
    pub proceeding_id: Option<String>,
    pub role: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub id: String,
    pub case_id: String,
    pub proceeding_id: Option<String>,
    pub kind: String,
    pub amount_cents: i64,
    pub entry_date: String,
    pub category: String,
    pub notes: String,
    pub reimbursement: String,
    pub material_id: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaseDetail {
    pub case_id: String,
    pub agreed_fee_cents: i64,
    pub related_case_id: Option<String>,
    pub notes: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Stage {
    pub id: String,
    pub proceeding_id: String,
    pub name: String,
    pub position: i64,
    pub state: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaseEvent {
    pub id: String,
    pub case_id: String,
    pub proceeding_id: Option<String>,
    pub title: String,
    pub event_date: String,
    pub notes: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecordInput {
    pub id: String,
    pub case_id: String,
    pub body: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub directory: String,
    pub created_at: String,
    pub case_count: usize,
    pub file_count: usize,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub event_id: String,
    pub title: String,
    pub schedule_key: String,
    pub when: String,
}
