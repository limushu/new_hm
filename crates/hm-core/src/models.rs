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
