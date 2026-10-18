use crate::*;
use uuid::Uuid;
impl Store {
    pub fn seed_example(&mut self, id: &str) -> Result<String> {
        crate::people::valid_id(id)?;
        if self.workspace()?.cases.iter().any(|c| c.id == id) {
            return Ok(id.into());
        }
        let item = self.create_case(CreateCase {
            tags: None,
            id: id.into(),
            title: "示例 · 借款合同纠纷".into(),
            case_type: "civil".into(),
            status_id: "in_progress".into(),
        })?;
        let person = Contact {
            id: Uuid::new_v4().to_string(),
            name: "示例当事人甲".into(),
            kind: "person".into(),
            phone: String::new(),
            address: "以下均为虚构演示数据".into(),
            notes: "可安全删除此示例，不包含真实个人信息。".into(),
        };
        self.save_contact(person.clone())?;
        self.save_contact_link(ContactLink {
            id: Uuid::new_v4().to_string(),
            contact_id: person.id,
            case_id: item.id.clone(),
            proceeding_id: None,
            role: "委托人".into(),
        })?;
        self.add_task(AddTask {
            case_id: item.id.clone(),
            title: "核对示例借条与转账材料".into(),
            due_date: None,
        })?;
        self.add_record(
            &item.id,
            "这是可选示例案件。可以查看办理程序、材料、关联对象和收支，再建立自己的案件。",
        )?;
        self.save_case_detail(CaseDetail {
            case_id: item.id.clone(),
            agreed_fee_cents: 500000,
            related_case_id: None,
            notes: "演示数据，非法律意见。删除案件不会删除独立联系对象。".into(),
        })?;
        let date: String =
            self.connection
                .query_row("SELECT date('now','localtime')", [], |r| r.get(0))?;
        self.save_ledger(LedgerEntry {
            id: Uuid::new_v4().to_string(),
            case_id: item.id.clone(),
            proceeding_id: item.current_proceeding_id.clone(),
            kind: "income".into(),
            amount_cents: 200000,
            entry_date: date,
            category: "律师费".into(),
            notes: "示例首笔收款".into(),
            reimbursement: "none".into(),
            material_id: None,
        })?;
        let directory = self.data_directory()?.join("example-staging");
        std::fs::create_dir_all(&directory)?;
        let staging = tempfile::Builder::new()
            .prefix("示例-")
            .tempdir_in(directory)?;
        let file = staging.path().join("材料归档说明.txt");
        std::fs::write(&file,"示例材料说明\n\n这里可以归档借条、转账凭证与沟通记录。软件将文件复制到案件目录，原始文件保持不变。\n所有示例内容均为虚构。")?;
        let imported = self.import_materials(
            MaterialTarget {
                case_id: item.id.clone(),
                proceeding_id: None,
                parent_id: None,
                record_id: None,
            },
            &[file],
        )?;
        if !imported.errors.is_empty() {
            return Err(Error::Validation(imported.errors.join("；")));
        }
        Ok(item.id)
    }
}
