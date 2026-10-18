use crate::people::{checked_date, checked_text, valid_id};
use crate::*;
use rusqlite::{params, OptionalExtension};
impl Store {
    pub fn save_ledger_with_receipt(
        &self,
        input: LedgerEntry,
        source: &std::path::Path,
        receipt_id: &str,
    ) -> Result<()> {
        self.save_receipt_context(input, source, receipt_id, None, false)
    }
    pub fn save_work_ledger(
        &self,
        input: LedgerEntry,
        stage_id: Option<String>,
        source: Option<&std::path::Path>,
        receipt_id: Option<&str>,
    ) -> Result<()> {
        self.validate_work_scope(
            &input.case_id,
            input.proceeding_id.as_deref(),
            stage_id.as_deref(),
        )?;
        if let Some(path) = source {
            return self.save_receipt_context(
                input,
                path,
                receipt_id.ok_or_else(|| Error::Validation("缺少凭据编号".into()))?,
                stage_id,
                true,
            );
        }
        let tx = self.connection.unchecked_transaction()?;
        let id = input.id.clone();
        let owner = input.case_id.clone();
        let proceeding = input.proceeding_id.clone();
        self.save_ledger(input)?;
        self.set_resource_scope(
            &owner,
            "ledger",
            &id,
            proceeding.as_deref(),
            stage_id.as_deref(),
        )?;
        tx.commit()?;
        Ok(())
    }
    fn save_receipt_context(
        &self,
        mut input: LedgerEntry,
        source: &std::path::Path,
        receipt_id: &str,
        stage_id: Option<String>,
        scoped: bool,
    ) -> Result<()> {
        let target = MaterialTarget {
            stage_id: stage_id.clone(),
            case_id: input.case_id.clone(),
            proceeding_id: input.proceeding_id.clone(),
            parent_id: None,
            record_id: None,
        };
        let existed: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM materials WHERE id=?1)",
            [receipt_id],
            |r| r.get(0),
        )?;
        let tx = self.connection.unchecked_transaction()?;
        let id = self.import_one_with_id(&target, source, receipt_id)?;
        let path = self.material_path(&id)?;
        input.material_id = Some(id);
        let result = (|| -> Result<()> {
            let id = input.id.clone();
            let owner = input.case_id.clone();
            let proceeding = input.proceeding_id.clone();
            self.save_ledger(input)?;
            if scoped {
                self.set_resource_scope(
                    &owner,
                    "ledger",
                    &id,
                    proceeding.as_deref(),
                    stage_id.as_deref(),
                )?;
            }
            tx.commit()?;
            Ok(())
        })();
        if result.is_err() && !existed {
            // Only the newly copied UUID object is ours to remove. Original and
            // previously attached receipts are never modified or deleted.
            let _ = std::fs::remove_file(&path);
            if let Some(parent) = path.parent() {
                let _ = std::fs::remove_dir(parent);
            }
        }
        result
    }
    pub fn ledger_entries(&self) -> Result<Vec<LedgerEntry>> {
        Ok(self.connection.prepare("SELECT id,case_id,proceeding_id,kind,amount_cents,entry_date,category,notes,reimbursement,material_id FROM ledger_entries ORDER BY entry_date DESC,created_at DESC,id")?.query_map([],|r|Ok(LedgerEntry{id:r.get(0)?,case_id:r.get(1)?,proceeding_id:r.get(2)?,kind:r.get(3)?,amount_cents:r.get(4)?,entry_date:r.get(5)?,category:r.get(6)?,notes:r.get(7)?,reimbursement:r.get(8)?,material_id:r.get(9)?}))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn save_ledger(&self, input: LedgerEntry) -> Result<()> {
        valid_id(&input.id)?;
        self.validate_proceeding(&input.case_id, input.proceeding_id.as_deref())?;
        checked_date(&input.entry_date)?;
        if !["income", "expense"].contains(&input.kind.as_str())
            || input.amount_cents <= 0
            || input.amount_cents > 1_000_000_000_000
        {
            return Err(Error::Validation("收支类型或金额无效".into()));
        }
        if !["none", "pending", "received"].contains(&input.reimbursement.as_str())
            || (input.kind == "income" && input.reimbursement != "none")
        {
            return Err(Error::Validation("报销状态无效".into()));
        }
        if let Some(id) = &input.material_id {
            if self.material(id)?.case_id != input.case_id {
                return Err(Error::Validation("凭证不属于当前案件".into()));
            }
        }
        let category = checked_text(&input.category, "类别", 60, false)?;
        let notes = checked_text(&input.notes, "备注", 10000, false)?;
        let owner: Option<String> = self
            .connection
            .query_row(
                "SELECT case_id FROM ledger_entries WHERE id=?1",
                [&input.id],
                |r| r.get(0),
            )
            .optional()?;
        if owner.is_some_and(|id| id != input.case_id) {
            return Err(Error::Validation("不能修改其他案件的收支".into()));
        }
        let allocated: i64 = self.connection.query_row(
            "SELECT coalesce(sum(amount_cents),0) FROM fee_allocations WHERE ledger_id=?1",
            [&input.id],
            |r| r.get(0),
        )?;
        if allocated > 0
            && (input.kind != "income" || category != "律师费" || input.amount_cents < allocated)
        {
            return Err(Error::Validation(
                "此收款已用于核销，请先调整核销关联".into(),
            ));
        }
        self.connection.execute("INSERT INTO ledger_entries(id,case_id,proceeding_id,kind,amount_cents,entry_date,category,notes,reimbursement,material_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET proceeding_id=excluded.proceeding_id,kind=excluded.kind,amount_cents=excluded.amount_cents,entry_date=excluded.entry_date,category=excluded.category,notes=excluded.notes,reimbursement=excluded.reimbursement,material_id=excluded.material_id",params![input.id,input.case_id,input.proceeding_id,input.kind,input.amount_cents,input.entry_date,category,notes,input.reimbursement,input.material_id])?;
        Ok(())
    }
    pub fn delete_ledger(&self, id: &str) -> Result<()> {
        let owner: String = self
            .connection
            .query_row(
                "SELECT case_id FROM ledger_entries WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        self.connection
            .execute("DELETE FROM ledger_entries WHERE id=?1", [id])?;
        Ok(())
    }
}
