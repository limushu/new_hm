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
    pub name: String,
    pub category: String,
    pub stage: String,
    pub case_number: String,
    pub court: String,
    pub judge: String,
    pub parent_id: Option<String>,
    pub state: String,
    pub completed_at: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaseTag {
    pub case_id: String,
    pub tag: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProceedingMeta {
    pub id: String,
    pub parent_id: Option<String>,
    pub state: String,
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
    pub work_links: Vec<WorkLink>,
    pub task_work: Vec<TaskWork>,
    pub fee_plans: Vec<FeePlan>,
    pub fee_allocations: Vec<FeeAllocation>,
    pub confirmed_fee_cases: Vec<String>,
    pub workflow_templates: Vec<WorkflowTemplate>,
    pub case_parties: Vec<CaseParty>,
    pub proceeding_party_roles: Vec<ProceedingPartyRole>,
    pub tag_catalog: Vec<String>,
    pub case_tags: Vec<CaseTag>,
    pub statuses: Vec<CaseStatus>,
    pub cases: Vec<Case>,
    pub proceedings: Vec<Proceeding>,
    pub tasks: Vec<Task>,
    pub work_records: Vec<WorkRecord>,
    pub calendar_events: Vec<CalendarEvent>,
    pub materials: Vec<Material>,
    pub contacts: Vec<Contact>,
    pub contact_links: Vec<ContactLink>,
    pub contact_relations: Vec<ContactRelation>,
    pub ledger_entries: Vec<LedgerEntry>,
    pub case_details: Vec<CaseDetail>,
    pub stages: Vec<Stage>,
    pub case_events: Vec<CaseEvent>,
    pub deleted_records: Vec<WorkRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkLink {
    pub id: String,
    pub case_id: String,
    pub proceeding_id: String,
    pub stage_id: Option<String>,
    pub kind: String,
    pub resource_id: String,
    #[serde(default)]
    pub label: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskWork {
    pub task_id: String,
    pub waiting_for: String,
    pub outcome: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkTask {
    pub task: Task,
    pub waiting_for: String,
    pub outcome: String,
    pub proceeding_id: Option<String>,
    pub stage_id: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeePlan {
    pub id: String,
    pub case_id: String,
    pub proceeding_id: Option<String>,
    pub stage_id: Option<String>,
    pub title: String,
    pub amount_cents: i64,
    pub due_date: Option<String>,
    pub condition: String,
    pub ready: bool,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeeAllocation {
    pub plan_id: String,
    pub ledger_id: String,
    pub amount_cents: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub category: String,
    pub stages: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaseParty {
    pub id: String,
    pub case_id: String,
    pub contact_id: Option<String>,
    pub name: String,
    pub side: String,
    pub service_type: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProceedingPartyRole {
    pub party_id: String,
    pub proceeding_id: String,
    pub role: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCaseParty {
    #[serde(flatten)]
    pub party: CaseParty,
    pub proceeding_id: Option<String>,
    #[serde(default)]
    pub role: String,
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
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    pub id: String,
    pub title: String,
    pub case_type: String,
    pub status_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCase {
    #[serde(default)]
    pub tags: Option<Vec<String>>,
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
    #[serde(default)]
    pub stage_id: Option<String>,
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
pub struct ContactRelation {
    pub judge_id: String,
    pub court_id: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProceedingContacts {
    pub proceeding_id: String,
    pub court_id: Option<String>,
    pub judge_id: Option<String>,
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
    #[serde(default = "milestone_kind")]
    pub kind: String,
    pub id: String,
    pub case_id: String,
    pub proceeding_id: Option<String>,
    pub title: String,
    pub event_date: String,
    pub notes: String,
}
fn milestone_kind() -> String {
    "milestone".into()
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
