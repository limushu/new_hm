use crate::{models::*, Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use uuid::Uuid;

pub struct Store {
    pub(crate) connection: Connection,
    pub(crate) directory: Option<PathBuf>,
}

fn text(value: &str, label: &str, max: usize) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(Error::Validation(format!(
            "{label}不能为空，且不能超过{max}个字符"
        )));
    }
    Ok(value.to_owned())
}
fn case_type(value: &str) -> Result<()> {
    if !["civil", "other"].contains(&value) {
        return Err(Error::Validation("案件类型无效".into()));
    }
    Ok(())
}
fn map_case(r: &rusqlite::Row<'_>) -> rusqlite::Result<Case> {
    Ok(Case {
        id: r.get(0)?,
        title: r.get(1)?,
        case_type: r.get(2)?,
        status_id: r.get(3)?,
        current_proceeding_id: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
        deleted_at: r.get(7)?,
    })
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent)?;
        }
        let directory = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let mut connection = Connection::open(path)?;
        crate::backup::recover_on_open(&mut connection, directory)?;
        let version: i64 = connection.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 0 && version < 7 {
            let safety = directory.join("migration-backups");
            std::fs::create_dir_all(&safety)?;
            connection.backup(
                "main",
                safety.join(format!(
                    "before-v7-from-v{version}-{}.sqlite3",
                    Uuid::new_v4()
                )),
                None,
            )?;
        }
        let mut store = Self::initialize(connection)?;
        store.directory = Some(directory.to_path_buf());
        Ok(store)
    }
    pub fn memory() -> Result<Self> {
        Self::initialize(Connection::open_in_memory()?)
    }
    fn initialize(mut connection: Connection) -> Result<Self> {
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )?;
        Self::migrate(&mut connection)?;
        Ok(Self {
            connection,
            directory: None,
        })
    }
    pub(crate) fn migrate(connection: &mut Connection) -> Result<()> {
        let version: i64 = connection.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 7 {
            return Err(Error::Validation(
                "数据库来自较新版本，请使用新版软件打开".into(),
            ));
        }
        if version < 7 {
            // SQLite cannot remove the legacy kind CHECK in place. Disable FK
            // enforcement before the atomic rebuild, validate before committing,
            // and restore enforcement on success and failure alike.
            connection.execute_batch("PRAGMA foreign_keys=OFF;")?;
            let result = (|| -> Result<()> {
                let tx = connection.transaction()?;
                if version == 0 {
                    tx.execute_batch(include_str!("../migrations/001_initial.sql"))?;
                }
                if version < 2 {
                    tx.execute_batch(include_str!("../migrations/002_calendar_events.sql"))?;
                }
                if version < 3 {
                    tx.execute_batch(include_str!("../migrations/003_v1_workspace.sql"))?;
                }
                if version < 4 {
                    tx.execute_batch(include_str!("../migrations/004_contact_relations.sql"))?;
                    crate::relations::backfill(&tx)?;
                }
                if version < 5 {
                    tx.execute_batch(include_str!("../migrations/005_case_overview.sql"))?;
                }
                if version < 6 {
                    tx.execute_batch(include_str!(
                        "../migrations/006_workflows_and_representation.sql"
                    ))?;
                }
                tx.execute_batch(include_str!("../migrations/007_case_workspace.sql"))?;
                if tx.prepare("PRAGMA foreign_key_check")?.exists([])? {
                    return Err(Error::Validation(
                        "升级关系校验未通过，已保留原数据库".into(),
                    ));
                }
                tx.commit()?;
                Ok(())
            })();
            connection.execute_batch("PRAGMA foreign_keys=ON;")?;
            result?;
        }
        Ok(())
    }
    pub(crate) fn active_case(&self, id: &str) -> Result<()> {
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM cases WHERE id=?1 AND deleted_at IS NULL)",
            [id],
            |r| r.get(0),
        )?;
        if !exists {
            return Err(Error::NotFound);
        }
        Ok(())
    }
    fn status(&self, id: &str) -> Result<()> {
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM case_statuses WHERE id=?1)",
            [id],
            |r| r.get(0),
        )?;
        if !exists {
            return Err(Error::Validation("案件状态无效".into()));
        }
        Ok(())
    }
    pub fn workspace(&self) -> Result<Workspace> {
        let statuses = self
            .connection
            .prepare("SELECT id,name,color FROM case_statuses ORDER BY position")?
            .query_map([], |r| {
                Ok(CaseStatus {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    color: r.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let cases=self.connection.prepare("SELECT id,title,case_type,status_id,current_proceeding_id,created_at,updated_at,deleted_at FROM cases ORDER BY created_at DESC,id")?.query_map([],map_case)?.collect::<rusqlite::Result<Vec<_>>>()?;
        let proceedings=self.connection.prepare("SELECT id,case_id,kind,stage,case_number,court,judge,parent_id,state,completed_at,name,category FROM proceedings ORDER BY created_at,id")?.query_map([],|r|Ok(Proceeding{id:r.get(0)?,case_id:r.get(1)?,kind:r.get(2)?,stage:r.get(3)?,case_number:r.get(4)?,court:r.get(5)?,judge:r.get(6)?,parent_id:r.get(7)?,state:r.get(8)?,completed_at:r.get(9)?,name:r.get(10)?,category:r.get(11)?}))?.collect::<rusqlite::Result<Vec<_>>>()?;
        let tasks = self
            .connection
            .prepare(
                "SELECT id,case_id,title,due_date,completed FROM tasks ORDER BY created_at,id",
            )?
            .query_map([], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    case_id: r.get(1)?,
                    title: r.get(2)?,
                    due_date: r.get(3)?,
                    completed: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let work_records = self
            .connection
            .prepare(
                "SELECT id,case_id,body,created_at FROM work_records WHERE deleted_at IS NULL ORDER BY created_at DESC,id",
            )?
            .query_map([], |r| {
                Ok(WorkRecord {
                    id: r.get(0)?,
                    case_id: r.get(1)?,
                    body: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(Workspace {
            work_links: self.work_links()?,
            task_work: self.task_work()?,
            fee_plans: self.fee_plans()?,
            fee_allocations: self.fee_allocations()?,
            confirmed_fee_cases: self.confirmed_fee_cases()?,
            workflow_templates: self.workflow_templates()?,
            case_parties: self.case_parties()?,
            proceeding_party_roles: self.proceeding_party_roles()?,
            tag_catalog: self
                .connection
                .prepare("SELECT name FROM tag_catalog ORDER BY name")?
                .query_map([], |r| r.get(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            case_tags: self
                .connection
                .prepare("SELECT case_id,tag FROM case_tags ORDER BY case_id,tag")?
                .query_map([], |r| {
                    Ok(CaseTag {
                        case_id: r.get(0)?,
                        tag: r.get(1)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            statuses,
            cases,
            proceedings,
            tasks,
            work_records,
            calendar_events: self.calendar_events()?,
            materials: self.materials()?,
            contacts: self.contacts()?,
            contact_links: self.contact_links()?,
            contact_relations: self.contact_relations()?,
            ledger_entries: self.ledger_entries()?,
            case_details: self.case_details()?,
            stages: self.stages()?,
            case_events: self.case_events()?,
            deleted_records: self.deleted_records()?,
        })
    }
    pub fn create_case(&mut self, input: CreateCase) -> Result<Case> {
        Uuid::parse_str(&input.id).map_err(|_| Error::Validation("建案请求标识无效".into()))?;
        let title = text(&input.title, "案件名称", 120)?;
        case_type(&input.case_type)?;
        self.status(&input.status_id)?;
        let tags = crate::case_overview::normalized_tags(input.tags.as_deref().unwrap_or(&[]))?;
        if let Some(existing)=self.connection.query_row("SELECT id,title,case_type,status_id,current_proceeding_id,created_at,updated_at,deleted_at FROM cases WHERE id=?1",[&input.id],map_case).optional()? { return Ok(existing); }
        let tx = self.connection.transaction()?;
        tx.execute(
            "INSERT INTO cases(id,title,case_type,status_id) VALUES(?1,?2,?3,?4)",
            params![input.id, title, input.case_type, input.status_id],
        )?;
        crate::case_overview::write_tags(&tx, &input.id, &tags)?;
        tx.commit()?;
        Ok(self.connection.query_row("SELECT id,title,case_type,status_id,current_proceeding_id,created_at,updated_at,deleted_at FROM cases WHERE id=?1",[input.id],map_case)?)
    }
    pub fn update_case(&self, input: UpdateCase) -> Result<()> {
        let title = text(&input.title, "案件名称", 120)?;
        case_type(&input.case_type)?;
        self.status(&input.status_id)?;
        self.active_case(&input.id)?;
        let tags = input
            .tags
            .as_deref()
            .map(crate::case_overview::normalized_tags)
            .transpose()?;
        let tx = self.connection.unchecked_transaction()?;
        tx.execute("UPDATE cases SET title=?1,case_type=?2,status_id=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?4",params![title,input.case_type,input.status_id,input.id])?;
        if let Some(tags) = tags {
            crate::case_overview::write_tags(&tx, &input.id, &tags)?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn set_case_status(&self, id: &str, status_id: &str) -> Result<()> {
        self.status(status_id)?;
        let changed = self.connection.execute(
            "UPDATE cases SET status_id=?1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND deleted_at IS NULL",
            params![status_id, id],
        )?;
        if changed == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }
    pub fn add_proceeding(&mut self, case_id: &str, program_kind: &str) -> Result<String> {
        self.add_proceeding_from(case_id, program_kind, None)
    }
    pub fn add_proceeding_from(
        &mut self,
        case_id: &str,
        program_kind: &str,
        parent_id: Option<&str>,
    ) -> Result<String> {
        self.add_named_proceeding(case_id, program_kind, parent_id, None)
    }
    pub fn add_named_proceeding(
        &mut self,
        case_id: &str,
        program_kind: &str,
        parent_id: Option<&str>,
        name: Option<&str>,
    ) -> Result<String> {
        self.active_case(case_id)?;
        let template = self
            .workflow_templates()?
            .into_iter()
            .find(|t| t.id == program_kind)
            .ok_or_else(|| Error::Validation("请选择有效的办理流程模板".into()))?;
        let name = text(name.unwrap_or(&template.name), "流程名称", 80)?;
        if let Some(parent) = parent_id {
            self.validate_proceeding(case_id, Some(parent))?;
        }
        let id = Uuid::new_v4().to_string();
        let tx = self.connection.transaction()?;
        tx.execute(
            "INSERT INTO proceedings(id,case_id,kind,parent_id,name,category) VALUES(?1,?2,?3,?4,?5,?6)",
            params![id, case_id, program_kind, parent_id, name, template.category],
        )?;
        tx.execute(
            "UPDATE cases SET current_proceeding_id=?1 WHERE id=?2",
            params![id, case_id],
        )?;
        crate::stages::seed_stages(&tx, &id, &template.stages)?;
        tx.commit()?;
        Ok(id)
    }
    pub fn select_proceeding(&self, case_id: &str, proceeding_id: &str) -> Result<()> {
        self.active_case(case_id)?;
        let belongs: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM proceedings WHERE id=?1 AND case_id=?2 AND state='active')",
            params![proceeding_id, case_id],
            |r| r.get(0),
        )?;
        if !belongs {
            return Err(Error::Validation("该程序不属于当前案件".into()));
        }
        self.connection.execute(
            "UPDATE cases SET current_proceeding_id=?1 WHERE id=?2",
            params![proceeding_id, case_id],
        )?;
        Ok(())
    }
    pub fn update_proceeding(&self, input: UpdateProceeding) -> Result<()> {
        if input.stage.chars().count() > 80
            || [&input.case_number, &input.court, &input.judge]
                .iter()
                .any(|s| s.chars().count() > 200)
        {
            return Err(Error::Validation("程序字段长度超出限制".into()));
        }
        let tx = self.connection.unchecked_transaction()?;
        let court = crate::relations::primary(&tx, &input.id, "court")?
            .map(|id| crate::relations::contact_name(&tx, &id, "court"))
            .transpose()?
            .unwrap_or(input.court.trim().into());
        let judge = crate::relations::primary(&tx, &input.id, "judge")?
            .map(|id| crate::relations::contact_name(&tx, &id, "judge"))
            .transpose()?
            .unwrap_or(input.judge.trim().into());
        let changed=tx.execute("UPDATE proceedings SET stage=?1,case_number=?2,court=?3,judge=?4 WHERE id=?5 AND case_id IN (SELECT id FROM cases WHERE deleted_at IS NULL)",params![input.stage.trim(),input.case_number.trim(),court,judge,input.id])?;
        if changed == 0 {
            return Err(Error::NotFound);
        }
        // Legacy names are migrated once on opening schema v3. Routine edits must
        // not recreate a directory object that the user deliberately deleted.
        tx.commit()?;
        Ok(())
    }
    pub fn add_task(&self, input: AddTask) -> Result<String> {
        self.active_case(&input.case_id)?;
        let title = text(&input.title, "待办内容", 500)?;
        if let Some(date) = &input.due_date {
            if date.len() != 10 || chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
                return Err(Error::Validation("截止日期无效".into()));
            }
        }
        let id = Uuid::new_v4().to_string();
        self.connection.execute(
            "INSERT INTO tasks(id,case_id,title,due_date) VALUES(?1,?2,?3,?4)",
            params![id, input.case_id, title, input.due_date],
        )?;
        Ok(id)
    }
    pub fn toggle_task(&self, id: &str, completed: bool) -> Result<()> {
        let changed=self.connection.execute("UPDATE tasks SET completed=?1 WHERE id=?2 AND case_id IN (SELECT id FROM cases WHERE deleted_at IS NULL)",params![completed,id])?;
        if changed == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }
    pub fn add_record(&self, case_id: &str, body: &str) -> Result<String> {
        self.active_case(case_id)?;
        let body = text(body, "工作记录", 20000)?;
        let id = Uuid::new_v4().to_string();
        self.connection.execute(
            "INSERT INTO work_records(id,case_id,body) VALUES(?1,?2,?3)",
            params![id, case_id, body],
        )?;
        Ok(id)
    }
    pub fn trash_case(&self, id: &str) -> Result<()> {
        self.active_case(id)?;
        self.connection.execute(
            "UPDATE cases SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1",
            [id],
        )?;
        Ok(())
    }
    pub fn restore_case(&self, id: &str) -> Result<()> {
        let changed = self.connection.execute(
            "UPDATE cases SET deleted_at=NULL WHERE id=?1 AND deleted_at IS NOT NULL",
            [id],
        )?;
        if changed == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }
}
