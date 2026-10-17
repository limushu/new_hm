use crate::*;
use rusqlite::{params, OptionalExtension};

pub(crate) fn checked_text(value: &str, label: &str, max: usize, required: bool) -> Result<String> {
    let value = value.trim();
    if (required && value.is_empty()) || value.chars().count() > max {
        return Err(Error::Validation(format!("{label}不能为空或超过{max}字")));
    }
    Ok(value.into())
}
pub(crate) fn valid_id(id: &str) -> Result<()> {
    uuid::Uuid::parse_str(id).map_err(|_| Error::Validation("记录标识无效".into()))?;
    Ok(())
}
pub(crate) fn checked_date(date: &str) -> Result<()> {
    if date.len() != 10
        || !chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .is_ok_and(|d| d.format("%Y-%m-%d").to_string() == date)
    {
        return Err(Error::Validation("日期无效".into()));
    }
    Ok(())
}
impl Store {
    pub fn contacts(&self) -> Result<Vec<Contact>> {
        Ok(self.connection.prepare("SELECT id,name,kind,phone,address,notes FROM contacts ORDER BY name COLLATE NOCASE,id")?.query_map([],|r|Ok(Contact{id:r.get(0)?,name:r.get(1)?,kind:r.get(2)?,phone:r.get(3)?,address:r.get(4)?,notes:r.get(5)?}))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn contact_links(&self) -> Result<Vec<ContactLink>> {
        Ok(self
            .connection
            .prepare(
                "SELECT id,contact_id,case_id,proceeding_id,role FROM contact_links ORDER BY rowid",
            )?
            .query_map([], |r| {
                Ok(ContactLink {
                    id: r.get(0)?,
                    contact_id: r.get(1)?,
                    case_id: r.get(2)?,
                    proceeding_id: r.get(3)?,
                    role: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn save_contact(&self, input: Contact) -> Result<()> {
        valid_id(&input.id)?;
        let name = checked_text(&input.name, "名称", 120, true)?;
        if !["person", "organization", "court", "judge"].contains(&input.kind.as_str()) {
            return Err(Error::Validation("对象类型无效".into()));
        }
        let phone = checked_text(&input.phone, "电话", 80, false)?;
        let address = checked_text(&input.address, "地址", 500, false)?;
        let notes = checked_text(&input.notes, "备注", 20000, false)?;
        let old: Option<String> = self
            .connection
            .query_row("SELECT kind FROM contacts WHERE id=?1", [&input.id], |r| {
                r.get(0)
            })
            .optional()?;
        if old.as_ref().is_some_and(|kind| kind != &input.kind) {
            let referenced:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM contact_links WHERE contact_id=?1) OR EXISTS(SELECT 1 FROM contact_relations WHERE judge_id=?1 OR court_id=?1)",[&input.id],|r|r.get(0))?;
            if referenced {
                return Err(Error::Validation(
                    "此对象已有关系，请先解除关联再更改类型".into(),
                ));
            }
        }
        self.connection.execute("INSERT INTO contacts(id,name,kind,phone,address,notes) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,phone=excluded.phone,address=excluded.address,notes=excluded.notes",params![input.id,name,input.kind,phone,address,notes])?;
        for (kind, field) in [("court", "court"), ("judge", "judge")] {
            if input.kind == kind {
                self.connection.execute(&format!("UPDATE proceedings SET {field}=?1 WHERE id IN (SELECT proceeding_id FROM contact_links WHERE contact_id=?2 AND role=?3)"),params![name,input.id,if kind=="court"{"法院"}else{"法官"}])?;
            }
        }
        Ok(())
    }
    pub fn save_contact_link(&self, input: ContactLink) -> Result<()> {
        valid_id(&input.id)?;
        self.validate_proceeding(&input.case_id, input.proceeding_id.as_deref())?;
        let role = checked_text(&input.role, "身份", 50, true)?;
        let kind: Option<String> = self
            .connection
            .query_row(
                "SELECT kind FROM contacts WHERE id=?1",
                [&input.contact_id],
                |r| r.get(0),
            )
            .optional()?;
        let kind = kind.ok_or(Error::NotFound)?;
        if ["court", "judge"].contains(&kind.as_str()) && input.proceeding_id.is_none() {
            return Err(Error::Validation("法院和法官请关联到具体办理程序".into()));
        }
        if kind == "court" || kind == "judge" {
            let program = input.proceeding_id.as_ref().unwrap();
            let court = if kind == "court" {
                Some(input.contact_id.clone())
            } else {
                crate::relations::primary(&self.connection, program, "court")?
            };
            let judge = if kind == "judge" {
                Some(input.contact_id.clone())
            } else {
                None
            };
            return self.set_proceeding_contacts(ProceedingContacts {
                proceeding_id: program.clone(),
                court_id: court,
                judge_id: judge,
            });
        }
        let duplicate:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM contact_links WHERE contact_id=?1 AND case_id=?2 AND proceeding_id IS ?3 AND role=?4 AND id<>?5)",params![input.contact_id,input.case_id,input.proceeding_id,role,input.id],|r|r.get(0))?;
        if duplicate {
            return Err(Error::Validation("已有相同身份的关联".into()));
        }
        let changed = self.connection.execute("INSERT INTO contact_links(id,contact_id,case_id,proceeding_id,role) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET contact_id=excluded.contact_id,case_id=excluded.case_id,proceeding_id=excluded.proceeding_id,role=excluded.role WHERE contact_links.case_id=excluded.case_id",params![input.id,input.contact_id,input.case_id,input.proceeding_id,role])?;
        if changed == 0 {
            return Err(Error::Validation("不能将已有身份记录转移到其他案件".into()));
        }
        Ok(())
    }
    pub fn delete_contact_link(&self, id: &str) -> Result<()> {
        let case_id: String = self
            .connection
            .query_row("SELECT case_id FROM contact_links WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&case_id)?;
        let program: Option<String> = self.connection.query_row(
            "SELECT proceeding_id FROM contact_links WHERE id=?1",
            [id],
            |r| r.get(0),
        )?;
        let kind: String = self.connection.query_row(
            "SELECT c.kind FROM contact_links l JOIN contacts c ON c.id=l.contact_id WHERE l.id=?1",
            [id],
            |r| r.get(0),
        )?;
        if let Some(program) = program {
            if kind == "court" || kind == "judge" {
                return self.set_proceeding_contacts(ProceedingContacts {
                    court_id: if kind == "court" {
                        None
                    } else {
                        crate::relations::primary(&self.connection, &program, "court")?
                    },
                    judge_id: None,
                    proceeding_id: program,
                });
            }
        }
        self.connection
            .execute("DELETE FROM contact_links WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn delete_contact(&self, id: &str) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        tx.execute("DELETE FROM contact_links WHERE contact_id=?1", [id])?;
        tx.execute(
            "DELETE FROM contact_relations WHERE judge_id=?1 OR court_id=?1",
            [id],
        )?;
        // Proceeding names are historical snapshots; deleting an optional directory
        // entry must not erase case information or delete any other object.
        if tx.execute("DELETE FROM contacts WHERE id=?1", [id])? == 0 {
            return Err(Error::NotFound);
        }
        tx.commit()?;
        Ok(())
    }
    pub fn case_details(&self) -> Result<Vec<CaseDetail>> {
        Ok(self
            .connection
            .prepare("SELECT case_id,agreed_fee_cents,related_case_id,notes FROM case_details")?
            .query_map([], |r| {
                Ok(CaseDetail {
                    case_id: r.get(0)?,
                    agreed_fee_cents: r.get(1)?,
                    related_case_id: r.get(2)?,
                    notes: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn save_case_detail(&self, input: CaseDetail) -> Result<()> {
        self.active_case(&input.case_id)?;
        if input.agreed_fee_cents < 0 || input.agreed_fee_cents > 1_000_000_000_000 {
            return Err(Error::Validation("约定律师费金额超出范围".into()));
        }
        if let Some(id) = &input.related_case_id {
            if id == &input.case_id {
                return Err(Error::Validation("不能关联自身".into()));
            }
            self.active_case(id)?;
        }
        let notes = checked_text(&input.notes, "案件备注", 20000, false)?;
        self.connection.execute("INSERT INTO case_details(case_id,agreed_fee_cents,related_case_id,notes) VALUES(?1,?2,?3,?4) ON CONFLICT(case_id) DO UPDATE SET agreed_fee_cents=excluded.agreed_fee_cents,related_case_id=excluded.related_case_id,notes=excluded.notes",params![input.case_id,input.agreed_fee_cents,input.related_case_id,notes])?;
        Ok(())
    }
    pub fn save_case_status(&self, input: CaseStatus) -> Result<()> {
        let name = checked_text(&input.name, "状态名称", 30, true)?;
        if input.color.len() != 7
            || !input.color.starts_with('#')
            || !input.color[1..].chars().all(|c| c.is_ascii_hexdigit())
        {
            return Err(Error::Validation("状态颜色无效".into()));
        }
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM case_statuses WHERE id=?1)",
            [&input.id],
            |r| r.get(0),
        )?;
        if !exists {
            valid_id(&input.id)?;
        }
        self.connection.execute("INSERT INTO case_statuses(id,name,color,position) VALUES(?1,?2,?3,(SELECT COALESCE(max(position),-1)+1 FROM case_statuses)) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color",params![input.id,name,input.color])?;
        Ok(())
    }
    pub fn delete_case_status(&self, id: &str) -> Result<()> {
        if ["not_started", "in_progress", "closed"].contains(&id) {
            return Err(Error::Validation("默认状态可改名，不可删除".into()));
        }
        let count: i64 = self.connection.query_row(
            "SELECT count(*) FROM cases WHERE status_id=?1",
            [id],
            |r| r.get(0),
        )?;
        if count > 0 {
            return Err(Error::Validation(
                "请先将此状态中的案件（含回收站）移到其他状态".into(),
            ));
        }
        self.connection
            .execute("DELETE FROM case_statuses WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .connection
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
                r.get(0)
            })
            .optional()?)
    }
    pub fn settings(&self) -> Result<std::collections::BTreeMap<String, String>> {
        Ok(self
            .connection
            .prepare("SELECT key,value FROM settings")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        if ![
            "backup_directory",
            "last_backup_date",
            "close_to_tray",
            "notifications",
            "onboarding_done",
        ]
        .contains(&key)
            || value.len() > 4096
        {
            return Err(Error::Validation("设置项无效".into()));
        }
        self.connection.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value])?;
        Ok(())
    }
}
