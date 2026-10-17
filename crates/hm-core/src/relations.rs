use crate::*;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

pub(crate) fn contact_name(db: &Connection, id: &str, kind: &str) -> Result<String> {
    db.query_row(
        "SELECT name FROM contacts WHERE id=?1 AND kind=?2",
        params![id, kind],
        |r| r.get(0),
    )
    .optional()?
    .ok_or_else(|| Error::Validation("对象类型或关联无效".into()))
}
pub(crate) fn primary(db: &Connection, program: &str, kind: &str) -> Result<Option<String>> {
    let mut rows=db.prepare("SELECT DISTINCT c.id FROM contact_links l JOIN contacts c ON c.id=l.contact_id WHERE l.proceeding_id=?1 AND c.kind=?2 ORDER BY c.id")?;
    let ids = rows
        .query_map(params![program, kind], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(if ids.len() == 1 {
        ids.into_iter().next()
    } else {
        None
    })
}
fn write_participants(db: &Connection, input: &ProceedingContacts) -> Result<()> {
    let case_id:String=db.query_row("SELECT p.case_id FROM proceedings p JOIN cases c ON c.id=p.case_id WHERE p.id=?1 AND c.deleted_at IS NULL",[&input.proceeding_id],|r|r.get(0)).optional()?.ok_or(Error::NotFound)?;
    let court = input
        .court_id
        .as_ref()
        .map(|id| contact_name(db, id, "court"))
        .transpose()?;
    let judge = input
        .judge_id
        .as_ref()
        .map(|id| contact_name(db, id, "judge"))
        .transpose()?;
    if judge.is_some() && court.is_none() {
        return Err(Error::Validation("请先选择办理法院，再选择法官".into()));
    }
    if let (Some(j), Some(c)) = (&input.judge_id, &input.court_id) {
        let known: i64 = db.query_row(
            "SELECT count(*) FROM contact_relations WHERE judge_id=?1",
            [j],
            |r| r.get(0),
        )?;
        let belongs: bool = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM contact_relations WHERE judge_id=?1 AND court_id=?2)",
            params![j, c],
            |r| r.get(0),
        )?;
        let historical = primary(db, &input.proceeding_id, "judge")?.as_ref() == Some(j)
            && primary(db, &input.proceeding_id, "court")?.as_ref() == Some(c);
        if known > 0 && !belongs && !historical {
            return Err(Error::Validation(
                "该法官尚未关联此法院，请先在对象详情中补充法院关系".into(),
            ));
        }
        db.execute(
            "INSERT OR IGNORE INTO contact_relations(judge_id,court_id) VALUES(?1,?2)",
            params![j, c],
        )?;
    }
    // One primary court and judge per proceeding. Other roles and other proceedings are untouched.
    db.execute("DELETE FROM contact_links WHERE proceeding_id=?1 AND role IN ('法院','法官') AND contact_id IN (SELECT id FROM contacts WHERE kind IN ('court','judge'))",[&input.proceeding_id])?;
    for (id, role) in [(&input.court_id, "法院"), (&input.judge_id, "法官")] {
        if let Some(id) = id {
            let exists:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM contact_links WHERE proceeding_id=?1 AND contact_id=?2 AND role=?3)",params![input.proceeding_id,id,role],|r|r.get(0))?;
            if !exists {
                db.execute("INSERT INTO contact_links(id,contact_id,case_id,proceeding_id,role) VALUES(?1,?2,?3,?4,?5)",params![Uuid::new_v4().to_string(),id,case_id,input.proceeding_id,role])?;
            }
        }
    }
    db.execute(
        "UPDATE proceedings SET court=?1,judge=?2 WHERE id=?3",
        params![
            court.unwrap_or_default(),
            judge.unwrap_or_default(),
            input.proceeding_id
        ],
    )?;
    Ok(())
}
// Match only an unambiguous existing object; never silently merge namesakes.
fn resolve_name(
    db: &Connection,
    name: &str,
    kind: &str,
    court: Option<&str>,
) -> Result<Option<String>> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    let mut ids = db
        .prepare(
            "SELECT id FROM contacts WHERE trim(name)=?1 COLLATE NOCASE AND kind=?2 ORDER BY id",
        )?
        .query_map(params![name, kind], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if ids.len() > 1 && kind == "judge" {
        if let Some(court) = court {
            let matches=ids.iter().filter(|id|db.query_row("SELECT EXISTS(SELECT 1 FROM contact_relations WHERE judge_id=?1 AND court_id=?2)",params![id,court],|r|r.get::<_,bool>(0)).unwrap_or(false)).cloned().collect::<Vec<_>>();
            if matches.len() == 1 {
                return Ok(matches.into_iter().next());
            }
        }
    }
    if ids.len() > 1 {
        return Ok(None);
    }
    if let Some(id) = ids.pop() {
        return Ok(Some(id));
    }
    let id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO contacts(id,name,kind) VALUES(?1,?2,?3)",
        params![id, name, kind],
    )?;
    Ok(Some(id))
}
pub(crate) fn backfill(db: &Connection) -> Result<()> {
    backfill_program(db, None)
}
pub(crate) fn backfill_program(db: &Connection, only: Option<&str>) -> Result<()> {
    let rows = db
        .prepare("SELECT id,case_id,court,judge FROM proceedings WHERE (?1 IS NULL OR id=?1)")?
        .query_map([only], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (id, case_id, court, judge) in rows {
        let resolve = |name: &str, kind: &str, court: Option<&str>| -> Result<Option<String>> {
            let count:i64=db.query_row("SELECT count(DISTINCT c.id) FROM contact_links l JOIN contacts c ON c.id=l.contact_id WHERE l.proceeding_id=?1 AND c.kind=?2",params![id,kind],|r|r.get(0))?;
            if count > 1 {
                return Ok(None);
            }
            if let Some(id) = primary(db, &id, kind)? {
                return Ok(Some(id));
            }
            resolve_name(db, name, kind, court)
        };
        let court_id = resolve(&court, "court", None)?;
        let judge_id = resolve(&judge, "judge", court_id.as_deref())?;
        for (contact, role) in [(&court_id, "法院"), (&judge_id, "法官")] {
            if let Some(contact) = contact {
                let exists:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM contact_links WHERE proceeding_id=?1 AND contact_id=?2)",params![id,contact],|r|r.get(0))?;
                if !exists {
                    db.execute("INSERT INTO contact_links(id,contact_id,case_id,proceeding_id,role) VALUES(?1,?2,?3,?4,?5)",params![Uuid::new_v4().to_string(),contact,case_id,id,role])?;
                }
            }
        }
        if let Some(court) = &court_id {
            db.execute(
                "UPDATE proceedings SET court=?1 WHERE id=?2",
                params![contact_name(db, court, "court")?, id],
            )?;
        }
        if let Some(judge) = &judge_id {
            db.execute(
                "UPDATE proceedings SET judge=?1 WHERE id=?2",
                params![contact_name(db, judge, "judge")?, id],
            )?;
        }
        if let (Some(j), Some(c)) = (judge_id, court_id) {
            db.execute(
                "INSERT OR IGNORE INTO contact_relations(judge_id,court_id) VALUES(?1,?2)",
                params![j, c],
            )?;
        }
    }
    Ok(())
}
impl Store {
    pub fn contact_relations(&self) -> Result<Vec<ContactRelation>> {
        Ok(self
            .connection
            .prepare("SELECT judge_id,court_id FROM contact_relations ORDER BY judge_id,court_id")?
            .query_map([], |r| {
                Ok(ContactRelation {
                    judge_id: r.get(0)?,
                    court_id: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub fn save_contact_with_courts(
        &self,
        input: Contact,
        courts: Option<Vec<String>>,
    ) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        if let Some(ids) = &courts {
            if input.kind != "judge" && !ids.is_empty() {
                return Err(Error::Validation("只有法官可以关联任职法院".into()));
            }
            for id in ids {
                contact_name(&tx, id, "court")?;
            }
            tx.execute(
                "DELETE FROM contact_relations WHERE judge_id=?1",
                [&input.id],
            )?;
        }
        self.save_contact(input.clone())?;
        if let Some(ids) = courts {
            for id in ids {
                tx.execute(
                    "INSERT OR IGNORE INTO contact_relations(judge_id,court_id) VALUES(?1,?2)",
                    params![input.id, id],
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }
    pub fn set_proceeding_contacts(&self, input: ProceedingContacts) -> Result<()> {
        let tx = self.connection.unchecked_transaction()?;
        write_participants(&tx, &input)?;
        tx.commit()?;
        Ok(())
    }
}
