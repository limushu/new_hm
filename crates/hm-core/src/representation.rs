use crate::{
    people::{checked_text, valid_id},
    *,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl Store {
    pub fn case_parties(&self) -> Result<Vec<CaseParty>> {
        Ok(self.connection.prepare("SELECT id,case_id,contact_id,name,side,service_type FROM case_parties ORDER BY rowid")?.query_map([],|r|Ok(CaseParty{id:r.get(0)?,case_id:r.get(1)?,contact_id:r.get(2)?,name:r.get(3)?,side:r.get(4)?,service_type:r.get(5)?}))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn proceeding_party_roles(&self) -> Result<Vec<ProceedingPartyRole>> {
        Ok(self
            .connection
            .prepare(
                "SELECT party_id,proceeding_id,role FROM proceeding_party_roles ORDER BY rowid",
            )?
            .query_map([], |r| {
                Ok(ProceedingPartyRole {
                    party_id: r.get(0)?,
                    proceeding_id: r.get(1)?,
                    role: r.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn save_case_party(&mut self, input: SaveCaseParty) -> Result<()> {
        let party = input.party;
        valid_id(&party.id)?;
        self.active_case(&party.case_id)?;
        self.validate_proceeding(&party.case_id, input.proceeding_id.as_deref())?;
        if !["client", "opponent", "other"].contains(&party.side.as_str()) {
            return Err(Error::Validation("当事人关系无效".into()));
        }
        let owner: Option<String> = self
            .connection
            .query_row(
                "SELECT case_id FROM case_parties WHERE id=?1",
                [&party.id],
                |r| r.get(0),
            )
            .optional()?;
        if owner.is_some_and(|id| id != party.case_id) {
            return Err(Error::Validation("当事人不属于此案件".into()));
        }
        let name = if let Some(contact) = &party.contact_id {
            self.connection
                .query_row("SELECT name FROM contacts WHERE id=?1", [contact], |r| {
                    r.get::<_, String>(0)
                })
                .optional()?
                .ok_or(Error::NotFound)?
        } else {
            checked_text(&party.name, "当事人名称", 120, false)?
        };
        let service = checked_text(&party.service_type, "服务身份", 80, false)?;
        let role = checked_text(&input.role, "流程身份", 80, false)?;
        if input.proceeding_id.is_none() && !role.is_empty() {
            return Err(Error::Validation("请为流程身份选择办理流程".into()));
        }
        if name.is_empty() && role.is_empty() {
            return Err(Error::Validation("请填写名称或当前流程中的身份".into()));
        }
        let tx = self.connection.transaction()?;
        tx.execute("INSERT INTO case_parties(id,case_id,contact_id,name,side,service_type) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET contact_id=excluded.contact_id,name=excluded.name,side=excluded.side,service_type=excluded.service_type",params![party.id,party.case_id,party.contact_id,name,party.side,service])?;
        if let Some(program) = input.proceeding_id {
            if role.is_empty() {
                tx.execute(
                    "DELETE FROM proceeding_party_roles WHERE party_id=?1 AND proceeding_id=?2",
                    params![party.id, program],
                )?;
            } else {
                tx.execute("INSERT INTO proceeding_party_roles(party_id,proceeding_id,role) VALUES(?1,?2,?3) ON CONFLICT(party_id,proceeding_id) DO UPDATE SET role=excluded.role",params![party.id,program,role])?;
            }
        }
        // Maintain only the backlink owned by this party, never a user's other links.
        tx.execute("DELETE FROM contact_links WHERE party_id=?1", [&party.id])?;
        if let Some(contact) = party.contact_id {
            let role = match party.side.as_str() {
                "client" => "我方委托人",
                "opponent" => "对方当事人",
                _ => "其他参与人",
            };
            tx.execute("INSERT INTO contact_links(id,contact_id,case_id,role,party_id) VALUES(?1,?2,?3,?4,?5)",params![Uuid::new_v4().to_string(),contact,party.case_id,role,party.id])?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn delete_case_party(&self, id: &str) -> Result<()> {
        let owner: String = self
            .connection
            .query_row("SELECT case_id FROM case_parties WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&owner)?;
        self.connection
            .execute("DELETE FROM case_parties WHERE id=?1", [id])?;
        Ok(())
    }
}
