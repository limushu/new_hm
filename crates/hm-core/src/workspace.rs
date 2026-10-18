use crate::people::{checked_date, checked_text, valid_id};
use crate::*;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl Store {
    pub(crate) fn set_resource_scope(
        &self,
        case_id: &str,
        kind: &str,
        resource_id: &str,
        proceeding_id: Option<&str>,
        stage_id: Option<&str>,
    ) -> Result<()> {
        self.validate_work_scope(case_id, proceeding_id, stage_id)?;
        self.connection.execute(
            "DELETE FROM work_links WHERE kind=?1 AND resource_id=?2",
            params![kind, resource_id],
        )?;
        if let Some(p) = proceeding_id {
            self.write_work_link(&WorkLink {
                id: Uuid::new_v4().to_string(),
                case_id: case_id.into(),
                proceeding_id: p.into(),
                stage_id: stage_id.map(str::to_owned),
                kind: kind.into(),
                resource_id: resource_id.into(),
                label: String::new(),
            })?;
        }
        Ok(())
    }
    pub fn save_work_event(
        &self,
        input: CalendarEvent,
        proceeding_id: Option<String>,
        stage_id: Option<String>,
    ) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        if let Some(c) = &input.case_id {
            self.validate_work_scope(c, proceeding_id.as_deref(), stage_id.as_deref())?;
        } else if proceeding_id.is_some() || stage_id.is_some() {
            return Err(Error::Validation("请先关联案件".into()));
        }
        let id = input.id.clone();
        let owner = input.case_id.clone();
        self.save_calendar_event(input)?;
        if let Some(c) = owner {
            self.set_resource_scope(
                &c,
                "event",
                &id,
                proceeding_id.as_deref(),
                stage_id.as_deref(),
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn save_work_record(
        &self,
        input: RecordInput,
        proceeding_id: Option<String>,
        stage_id: Option<String>,
    ) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        self.validate_work_scope(
            &input.case_id,
            proceeding_id.as_deref(),
            stage_id.as_deref(),
        )?;
        let id = input.id.clone();
        let owner = input.case_id.clone();
        self.save_record(input)?;
        self.set_resource_scope(
            &owner,
            "record",
            &id,
            proceeding_id.as_deref(),
            stage_id.as_deref(),
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn save_fee_agreement(&self, case_id: &str, amount_cents: i64) -> Result<()> {
        self.active_case(case_id)?;
        if !(0..=1_000_000_000_000).contains(&amount_cents) {
            return Err(Error::Validation("约定律师费金额超出范围".into()));
        }
        let tx = self.connection.unchecked_transaction()?;
        tx.execute("INSERT INTO case_details(case_id,agreed_fee_cents) VALUES(?1,?2) ON CONFLICT(case_id) DO UPDATE SET agreed_fee_cents=excluded.agreed_fee_cents",params![case_id,amount_cents])?;
        tx.execute(
            "INSERT OR IGNORE INTO fee_agreement_confirmation(case_id) VALUES(?1)",
            [case_id],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn work_links(&self) -> Result<Vec<WorkLink>> {
        Ok(self.connection.prepare("SELECT id,case_id,proceeding_id,stage_id,kind,resource_id,label FROM work_links ORDER BY id")?.query_map([], |r| Ok(WorkLink { id:r.get(0)?,case_id:r.get(1)?,proceeding_id:r.get(2)?,stage_id:r.get(3)?,kind:r.get(4)?,resource_id:r.get(5)?,label:r.get(6)? }))?.collect::<rusqlite::Result<_>>()?)
    }
    pub fn task_work(&self) -> Result<Vec<TaskWork>> {
        Ok(self
            .connection
            .prepare("SELECT task_id,waiting_for,outcome FROM task_work")?
            .query_map([], |r| {
                Ok(TaskWork {
                    task_id: r.get(0)?,
                    waiting_for: r.get(1)?,
                    outcome: r.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub fn fee_plans(&self) -> Result<Vec<FeePlan>> {
        Ok(self.connection.prepare("SELECT id,case_id,proceeding_id,stage_id,title,amount_cents,due_date,condition,ready FROM fee_plans ORDER BY due_date,id")?.query_map([], |r| Ok(FeePlan {id:r.get(0)?,case_id:r.get(1)?,proceeding_id:r.get(2)?,stage_id:r.get(3)?,title:r.get(4)?,amount_cents:r.get(5)?,due_date:r.get(6)?,condition:r.get(7)?,ready:r.get(8)?}))?.collect::<rusqlite::Result<_>>()?)
    }
    pub fn fee_allocations(&self) -> Result<Vec<FeeAllocation>> {
        Ok(self
            .connection
            .prepare("SELECT plan_id,ledger_id,amount_cents FROM fee_allocations")?
            .query_map([], |r| {
                Ok(FeeAllocation {
                    plan_id: r.get(0)?,
                    ledger_id: r.get(1)?,
                    amount_cents: r.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub fn confirmed_fee_cases(&self) -> Result<Vec<String>> {
        Ok(self
            .connection
            .prepare("SELECT case_id FROM fee_agreement_confirmation")?
            .query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub(crate) fn validate_work_scope(
        &self,
        case_id: &str,
        proceeding_id: Option<&str>,
        stage_id: Option<&str>,
    ) -> Result<()> {
        self.validate_proceeding(case_id, proceeding_id)?;
        if let Some(stage) = stage_id {
            let owner: Option<String> = self
                .connection
                .query_row(
                    "SELECT proceeding_id FROM stages WHERE id=?1",
                    [stage],
                    |r| r.get(0),
                )
                .optional()?;
            if owner.as_deref() != proceeding_id || owner.is_none() {
                return Err(Error::Validation("阶段不属于所选流程".into()));
            }
        }
        Ok(())
    }
    pub(crate) fn write_work_link(&self, input: &WorkLink) -> Result<()> {
        valid_id(&input.id)?;
        self.validate_work_scope(
            &input.case_id,
            Some(&input.proceeding_id),
            input.stage_id.as_deref(),
        )?;
        let table = match input.kind.as_str() {
            "task" => "tasks",
            "event" => "calendar_events",
            "material" => "materials",
            "record" => "work_records",
            "ledger" => "ledger_entries",
            _ => return Err(Error::Validation("关联类型无效".into())),
        };
        let owner: Option<String> = self
            .connection
            .query_row(
                &format!("SELECT case_id FROM {table} WHERE id=?1"),
                [&input.resource_id],
                |r| r.get(0),
            )
            .optional()?;
        if owner.as_deref() != Some(&input.case_id) {
            return Err(Error::Validation("只能关联本案件的记录".into()));
        }
        if input.kind == "material" {
            self.material(&input.resource_id)?;
        }
        if input.kind == "ledger" {
            let proceeding: Option<String> = self.connection.query_row(
                "SELECT proceeding_id FROM ledger_entries WHERE id=?1",
                [&input.resource_id],
                |r| r.get(0),
            )?;
            if proceeding.as_deref() != Some(&input.proceeding_id) {
                return Err(Error::Validation(
                    "账目流程与工作关联不一致，请在收支编辑中调整归属".into(),
                ));
            }
        }
        let existing: Option<(String, String, String)> = self
            .connection
            .query_row(
                "SELECT case_id,kind,resource_id FROM work_links WHERE id=?1",
                [&input.id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        if existing.is_some_and(|(c, k, r)| {
            c != input.case_id || k != input.kind || r != input.resource_id
        }) {
            return Err(Error::Validation("不能修改其他记录的关联".into()));
        }
        let label = checked_text(&input.label, "用途", 200, false)?;
        if input.kind == "material" {
            let same:Option<String>=self.connection.query_row("SELECT id FROM work_links WHERE kind='material' AND resource_id=?1 AND proceeding_id=?2 AND stage_id IS ?3 LIMIT 1",params![input.resource_id,input.proceeding_id,input.stage_id],|r|r.get(0)).optional()?;
            if let Some(id) = same {
                self.connection.execute(
                    "UPDATE work_links SET label=?1 WHERE id=?2",
                    params![label, id],
                )?;
                return Ok(());
            }
        }
        if input.kind != "material" {
            self.connection.execute(
                "DELETE FROM work_links WHERE kind=?1 AND resource_id=?2",
                params![input.kind, input.resource_id],
            )?;
        }
        self.connection.execute("INSERT INTO work_links(id,case_id,proceeding_id,stage_id,kind,resource_id,label) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT DO UPDATE SET proceeding_id=excluded.proceeding_id,stage_id=excluded.stage_id,label=excluded.label", params![input.id,input.case_id,input.proceeding_id,input.stage_id,input.kind,input.resource_id,label])?;
        Ok(())
    }
    pub fn save_work_link(&self, input: WorkLink) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        self.write_work_link(&input)?;
        tx.commit()?;
        Ok(())
    }
    pub fn delete_work_link(&self, id: &str) -> Result<()> {
        let owner: String = self
            .connection
            .query_row("SELECT case_id FROM work_links WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        self.connection
            .execute("DELETE FROM work_links WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn save_work_task(&self, input: SaveWorkTask) -> Result<()> {
        let task = &input.task;
        valid_id(&task.id)?;
        self.validate_work_scope(
            &task.case_id,
            input.proceeding_id.as_deref(),
            input.stage_id.as_deref(),
        )?;
        let title = checked_text(&task.title, "待办", 500, true)?;
        if let Some(date) = &task.due_date {
            checked_date(date)?;
        }
        let waiting = checked_text(&input.waiting_for, "等待事项", 200, false)?;
        let outcome = checked_text(&input.outcome, "完成结果", 10000, false)?;
        let owner: Option<String> = self
            .connection
            .query_row("SELECT case_id FROM tasks WHERE id=?1", [&task.id], |r| {
                r.get(0)
            })
            .optional()?;
        if owner.is_some_and(|c| c != task.case_id) {
            return Err(Error::Validation("不能修改其他案件的任务".into()));
        }
        let tx = self.connection.unchecked_transaction()?;
        tx.execute("INSERT INTO tasks(id,case_id,title,due_date,completed) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET title=excluded.title,due_date=excluded.due_date,completed=excluded.completed",params![task.id,task.case_id,title,task.due_date,task.completed])?;
        tx.execute("INSERT INTO task_work(task_id,waiting_for,outcome) VALUES(?1,?2,?3) ON CONFLICT(task_id) DO UPDATE SET waiting_for=excluded.waiting_for,outcome=excluded.outcome",params![task.id,waiting,outcome])?;
        tx.execute(
            "DELETE FROM work_links WHERE kind='task' AND resource_id=?1",
            [&task.id],
        )?;
        if let Some(proceeding) = input.proceeding_id {
            self.write_work_link(&WorkLink {
                id: Uuid::new_v4().to_string(),
                case_id: task.case_id.clone(),
                proceeding_id: proceeding,
                stage_id: input.stage_id,
                kind: "task".into(),
                resource_id: task.id.clone(),
                label: String::new(),
            })?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn apply_stage_tasks(&self, stage_id: &str, titles: Vec<String>) -> Result<()> {
        if titles.len() > 50 {
            return Err(Error::Validation("一次最多添加50项任务".into()));
        }
        let (proceeding,case_id):(String,String)=self.connection.query_row("SELECT s.proceeding_id,p.case_id FROM stages s JOIN proceedings p ON p.id=s.proceeding_id WHERE s.id=?1",[stage_id],|r| Ok((r.get(0)?,r.get(1)?))).optional()?.ok_or(Error::NotFound)?;
        self.active_case(&case_id)?;
        let tx = self.connection.unchecked_transaction()?;
        for title in titles {
            let title = checked_text(&title, "任务", 500, true)?;
            let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM tasks t JOIN work_links l ON l.resource_id=t.id AND l.kind='task' WHERE l.stage_id=?1 AND t.title=?2)",params![stage_id,title],|r|r.get(0))?;
            if !exists {
                let id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO tasks(id,case_id,title) VALUES(?1,?2,?3)",
                    params![id, case_id, title],
                )?;
                self.write_work_link(&WorkLink {
                    id: Uuid::new_v4().to_string(),
                    case_id: case_id.clone(),
                    proceeding_id: proceeding.clone(),
                    stage_id: Some(stage_id.into()),
                    kind: "task".into(),
                    resource_id: id,
                    label: String::new(),
                })?;
            }
        }
        tx.commit()?;
        Ok(())
    }
    pub fn save_fee_plan(&self, input: FeePlan) -> Result<()> {
        valid_id(&input.id)?;
        self.validate_work_scope(
            &input.case_id,
            input.proceeding_id.as_deref(),
            input.stage_id.as_deref(),
        )?;
        let title = checked_text(&input.title, "收费节点", 200, true)?;
        let condition = checked_text(&input.condition, "付款条件", 10000, false)?;
        if let Some(date) = &input.due_date {
            checked_date(date)?;
        }
        if input.amount_cents <= 0 || input.amount_cents > 1_000_000_000_000 {
            return Err(Error::Validation("收费金额无效".into()));
        }
        let owner: Option<String> = self
            .connection
            .query_row(
                "SELECT case_id FROM fee_plans WHERE id=?1",
                [&input.id],
                |r| r.get(0),
            )
            .optional()?;
        if owner.is_some_and(|c| c != input.case_id) {
            return Err(Error::Validation("不能修改其他案件的收费计划".into()));
        }
        let allocated: i64 = self.connection.query_row(
            "SELECT coalesce(sum(amount_cents),0) FROM fee_allocations WHERE plan_id=?1",
            [&input.id],
            |r| r.get(0),
        )?;
        if allocated > input.amount_cents {
            return Err(Error::Validation("约定金额不能少于已核销金额".into()));
        }
        self.connection.execute("INSERT INTO fee_plans(id,case_id,proceeding_id,stage_id,title,amount_cents,due_date,condition,ready) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET proceeding_id=excluded.proceeding_id,stage_id=excluded.stage_id,title=excluded.title,amount_cents=excluded.amount_cents,due_date=excluded.due_date,condition=excluded.condition,ready=excluded.ready",params![input.id,input.case_id,input.proceeding_id,input.stage_id,title,input.amount_cents,input.due_date,condition,input.ready])?;
        Ok(())
    }
    pub fn delete_fee_plan(&self, id: &str) -> Result<()> {
        let owner: String = self
            .connection
            .query_row("SELECT case_id FROM fee_plans WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        self.connection
            .execute("DELETE FROM fee_plans WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn save_fee_allocation(&self, input: FeeAllocation) -> Result<()> {
        let (owner, amount): (String, i64) = self
            .connection
            .query_row(
                "SELECT case_id,amount_cents FROM fee_plans WHERE id=?1",
                [&input.plan_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        let (ledger_owner, kind, category, ledger_amount): (String, String, String, i64) = self
            .connection
            .query_row(
                "SELECT case_id,kind,category,amount_cents FROM ledger_entries WHERE id=?1",
                [&input.ledger_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        if owner != ledger_owner
            || kind != "income"
            || category != "律师费"
            || input.amount_cents < 0
        {
            return Err(Error::Validation("只能使用本案实际收到的律师费核销".into()));
        }
        let tx = self.connection.unchecked_transaction()?;
        let used_plan:i64=tx.query_row("SELECT coalesce(sum(amount_cents),0) FROM fee_allocations WHERE plan_id=?1 AND ledger_id!=?2",params![input.plan_id,input.ledger_id],|r|r.get(0))?;
        let used_ledger:i64=tx.query_row("SELECT coalesce(sum(amount_cents),0) FROM fee_allocations WHERE ledger_id=?1 AND plan_id!=?2",params![input.ledger_id,input.plan_id],|r|r.get(0))?;
        if used_plan + input.amount_cents > amount
            || used_ledger + input.amount_cents > ledger_amount
        {
            return Err(Error::Validation(
                "核销不能超过收费节点或实际收款金额".into(),
            ));
        }
        if input.amount_cents == 0 {
            tx.execute(
                "DELETE FROM fee_allocations WHERE plan_id=?1 AND ledger_id=?2",
                params![input.plan_id, input.ledger_id],
            )?;
        } else {
            tx.execute("INSERT INTO fee_allocations(plan_id,ledger_id,amount_cents) VALUES(?1,?2,?3) ON CONFLICT(plan_id,ledger_id) DO UPDATE SET amount_cents=excluded.amount_cents",params![input.plan_id,input.ledger_id,input.amount_cents])?;
        }
        tx.commit()?;
        Ok(())
    }
}
