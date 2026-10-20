use crate::{Error, Result, Store};
use crate::{ImportReport, Material, MaterialTarget};
use rusqlite::{params, OptionalExtension};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) fn valid_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty()
        || name.chars().count() > 180
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || [".", ".."].contains(&name)
    {
        return Err(Error::Validation(
            "名称为空、过长或包含不能用于文件名的字符".into(),
        ));
    }
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    if [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .contains(&stem.as_str())
    {
        return Err(Error::Validation("此名称为系统保留名称".into()));
    }
    Ok(name.into())
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Material> {
    Ok(Material {
        id: r.get(0)?,
        case_id: r.get(1)?,
        proceeding_id: r.get(2)?,
        parent_id: r.get(3)?,
        name: r.get(4)?,
        kind: r.get(5)?,
        size: r.get::<_, i64>(6)? as u64,
        notes: r.get(7)?,
        record_id: r.get(8)?,
        created_at: r.get(9)?,
        deleted_at: r.get(10)?,
        trash_group: r.get(11)?,
    })
}
const COLUMNS:&str="id,case_id,proceeding_id,parent_id,name,kind,size,notes,record_id,created_at,deleted_at,trash_group";
impl Store {
    pub(crate) fn data_directory(&self) -> Result<&Path> {
        self.directory
            .as_deref()
            .ok_or_else(|| Error::Validation("此工作区没有文件存储目录".into()))
    }
    pub fn materials(&self) -> Result<Vec<Material>> {
        Ok(self
            .connection
            .prepare(&format!(
                "SELECT {COLUMNS} FROM materials ORDER BY kind DESC,name COLLATE NOCASE,id"
            ))?
            .query_map([], row)?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub(crate) fn validate_proceeding(
        &self,
        case_id: &str,
        proceeding: Option<&str>,
    ) -> Result<()> {
        self.active_case(case_id)?;
        if let Some(id) = proceeding {
            let belongs: bool = self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM proceedings WHERE id=?1 AND case_id=?2)",
                params![id, case_id],
                |r| r.get(0),
            )?;
            if !belongs {
                return Err(Error::Validation("办理程序不属于此案件".into()));
            }
        }
        Ok(())
    }
    fn target(&self, target: &MaterialTarget) -> Result<()> {
        self.validate_work_scope(
            &target.case_id,
            target.proceeding_id.as_deref(),
            target.stage_id.as_deref(),
        )?;
        if let Some(id) = &target.parent_id {
            let parent = self.material(id)?;
            if parent.kind != "folder"
                || parent.case_id != target.case_id
                || parent.proceeding_id != target.proceeding_id
            {
                return Err(Error::Validation("目标文件夹不属于此材料范围".into()));
            }
        }
        if let Some(id) = &target.record_id {
            let belongs:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM work_records WHERE id=?1 AND case_id=?2 AND deleted_at IS NULL)",params![id,target.case_id],|r|r.get(0))?;
            if !belongs {
                return Err(Error::Validation("工作记录不属于此案件".into()));
            }
        }
        Ok(())
    }
    pub fn material(&self, id: &str) -> Result<Material> {
        let item = self
            .connection
            .query_row(
                &format!("SELECT {COLUMNS} FROM materials WHERE id=?1 AND deleted_at IS NULL"),
                [id],
                row,
            )
            .optional()?
            .ok_or(Error::NotFound)?;
        self.active_case(&item.case_id)?;
        Ok(item)
    }
    pub(crate) fn unique_name(
        &self,
        target: &MaterialTarget,
        name: &str,
        except: Option<&str>,
    ) -> Result<String> {
        let name = valid_name(name)?;
        let path = Path::new(&name);
        let extension = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{s}"))
            .unwrap_or_default();
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(&name);
        for number in 0..10000 {
            let candidate = if number == 0 {
                name.clone()
            } else {
                format!("{stem} ({number}){extension}")
            };
            let exists:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM materials WHERE case_id=?1 AND proceeding_id IS ?2 AND parent_id IS ?3 AND deleted_at IS NULL AND lower(name)=lower(?4) AND (?5 IS NULL OR id<>?5))",params![target.case_id,target.proceeding_id,target.parent_id,candidate,except],|r|r.get(0))?;
            if !exists {
                return Ok(candidate);
            }
        }
        Err(Error::Validation("同名材料过多，请先更换名称".into()))
    }
    pub fn create_material_folder(&self, target: MaterialTarget, name: &str) -> Result<String> {
        self.target(&target)?;
        let name = self.unique_name(&target, name, None)?;
        let id = Uuid::new_v4().to_string();
        self.connection.execute("INSERT INTO materials(id,case_id,proceeding_id,parent_id,name,kind) VALUES(?1,?2,?3,?4,?5,'folder')",params![id,target.case_id,target.proceeding_id,target.parent_id,name])?;
        Ok(id)
    }
    pub(crate) fn material_root(&self) -> Result<PathBuf> {
        let name = self
            .setting("materials_directory")?
            .unwrap_or_else(|| "materials".into());
        if name != "materials"
            && name
                .strip_prefix("materials-restore-")
                .is_none_or(|id| Uuid::parse_str(id).is_err())
        {
            return Err(Error::Validation("材料存储目录无效".into()));
        }
        let root = self.data_directory()?.join(name);
        std::fs::create_dir_all(&root)?;
        if std::fs::symlink_metadata(&root)?.file_type().is_symlink() {
            return Err(Error::Validation("材料目录不能为符号链接".into()));
        }
        Ok(root.canonicalize()?)
    }
    pub(crate) fn object_dir(&self, case_id: &str, id: &str, create: bool) -> Result<PathBuf> {
        Uuid::parse_str(case_id).map_err(|_| Error::Validation("案件文件标识无效".into()))?;
        Uuid::parse_str(id).map_err(|_| Error::Validation("材料文件标识无效".into()))?;
        let root = self.material_root()?;
        let mut path = root.clone();
        for component in [case_id, id] {
            path.push(component);
            if create {
                match std::fs::create_dir(&path) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                    Err(error) => return Err(Error::Io(error)),
                }
            }
            if std::fs::symlink_metadata(&path)?.file_type().is_symlink() {
                return Err(Error::Validation("材料目录不能包含符号链接".into()));
            }
            path = path.canonicalize()?;
            if !path.starts_with(&root) || !path.is_dir() {
                return Err(Error::Validation("材料路径超出工作区".into()));
            }
        }
        Ok(path)
    }
    pub fn material_path(&self, id: &str) -> Result<PathBuf> {
        let item = self.material(id)?;
        if item.kind != "file" {
            return Err(Error::Validation("请打开文件而非文件夹".into()));
        }
        let stored: String = self.connection.query_row(
            "SELECT storage_name FROM materials WHERE id=?1",
            [id],
            |r| r.get(0),
        )?;
        valid_name(&stored)?;
        let dir = self.object_dir(&item.case_id, id, false)?;
        let path = dir.join(stored).canonicalize()?;
        if !path.starts_with(&dir) || !path.is_file() {
            return Err(Error::Validation("归档文件不存在或不在工作区内".into()));
        }
        Ok(path)
    }
    pub fn import_materials(
        &self,
        target: MaterialTarget,
        paths: &[PathBuf],
    ) -> Result<ImportReport> {
        self.target(&target)?;
        if paths.len() > 500 {
            return Err(Error::Validation("单次最多添加500个文件".into()));
        }
        let mut report = ImportReport {
            imported: 0,
            errors: vec![],
        };
        for path in paths {
            match self.import_one(&target, path) {
                Ok(_) => report.imported += 1,
                Err(error) => report.errors.push(format!(
                    "{}：{error}",
                    path.file_name().unwrap_or_default().to_string_lossy()
                )),
            }
        }
        Ok(report)
    }
    fn import_one(&self, target: &MaterialTarget, path: &Path) -> Result<String> {
        self.import_one_with_id(target, path, &Uuid::new_v4().to_string())
    }
    pub(crate) fn import_one_with_id(
        &self,
        target: &MaterialTarget,
        path: &Path,
        id: &str,
    ) -> Result<String> {
        self.target(target)?;
        crate::people::valid_id(id)?;
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM materials WHERE id=?1)",
            [id],
            |r| r.get(0),
        )?;
        if exists {
            let item = self.material(id)?;
            if item.case_id != target.case_id
                || item.proceeding_id != target.proceeding_id
                || item.parent_id != target.parent_id
                || item.kind != "file"
            {
                return Err(Error::Validation("凭据归属与本次记录不一致".into()));
            }
            return Ok(id.into());
        }
        let source = path.canonicalize()?;
        if !source.is_file() {
            return Err(Error::Validation(
                "请添加文件；文件夹请在材料页内创建".into(),
            ));
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| Error::Validation("文件名无法读取".into()))?;
        self.import_reader_with_id(target, name, &mut std::fs::File::open(source)?, id)
    }

    /// Archive an external stream without depending on its provider or address.
    /// A failed read leaves neither a material row nor a partial archived file.
    pub fn import_reader(
        &self,
        target: &MaterialTarget,
        name: &str,
        reader: &mut dyn std::io::Read,
    ) -> Result<String> {
        self.import_reader_with_id(target, name, reader, &Uuid::new_v4().to_string())
    }

    fn import_reader_with_id(
        &self,
        target: &MaterialTarget,
        name: &str,
        reader: &mut dyn std::io::Read,
        id: &str,
    ) -> Result<String> {
        self.target(target)?;
        crate::people::valid_id(id)?;
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM materials WHERE id=?1)",
            [id],
            |r| r.get(0),
        )?;
        if exists {
            let item = self.material(id)?;
            if item.case_id != target.case_id
                || item.proceeding_id != target.proceeding_id
                || item.parent_id != target.parent_id
                || item.kind != "file"
            {
                return Err(Error::Validation("凭据归属与本次记录不一致".into()));
            }
            return Ok(id.into());
        }
        let stored = valid_name(name)?;
        let name = self.unique_name(target, &stored, None)?;
        let stored = name.clone();
        let dir = self.object_dir(&target.case_id, id, true)?;
        let result = (|| {
            let mut temporary = tempfile::NamedTempFile::new_in(&dir)?;
            let size = std::io::copy(reader, &mut temporary)?;
            temporary.as_file().sync_all()?;
            temporary
                .persist_noclobber(dir.join(&stored))
                .map_err(|e| Error::Io(e.error))?;
            self.connection.execute_batch("SAVEPOINT material_import")?;
            let inserted = (|| -> Result<()> {
                self.connection.execute("INSERT INTO materials(id,case_id,proceeding_id,parent_id,name,kind,storage_name,size,record_id) VALUES(?1,?2,?3,?4,?5,'file',?6,?7,?8)",params![id,target.case_id,target.proceeding_id,target.parent_id,name,stored,size as i64,target.record_id])?;
                if let (Some(stage), Some(proceeding)) = (&target.stage_id, &target.proceeding_id) {
                    self.write_work_link(&crate::WorkLink {
                        id: Uuid::new_v4().to_string(),
                        case_id: target.case_id.clone(),
                        proceeding_id: proceeding.clone(),
                        stage_id: Some(stage.clone()),
                        kind: "material".into(),
                        resource_id: id.into(),
                        label: String::new(),
                    })?;
                }
                Ok(())
            })();
            if inserted.is_err() {
                self.connection
                    .execute_batch("ROLLBACK TO material_import")?;
            }
            self.connection.execute_batch("RELEASE material_import")?;
            inserted?;
            Ok(id.to_string())
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(dir.join(&stored));
            let _ = std::fs::remove_dir(&dir);
        }
        result
    }
    pub fn save_recording(
        &self,
        target: MaterialTarget,
        name: &str,
        bytes: &[u8],
    ) -> Result<String> {
        self.target(&target)?;
        if bytes.is_empty() || bytes.len() > 512 * 1024 * 1024 {
            return Err(Error::Validation("录音为空或超过512MB，请分段录制".into()));
        }
        self.import_reader(&target, name, &mut std::io::Cursor::new(bytes))
    }

    pub fn rename_material(&self, id: &str, name: &str) -> Result<()> {
        let item = self.material(id)?;
        let target = MaterialTarget {
            stage_id: None,
            case_id: item.case_id.clone(),
            proceeding_id: item.proceeding_id.clone(),
            parent_id: item.parent_id.clone(),
            record_id: item.record_id.clone(),
        };
        let name = valid_name(name)?;
        if self.unique_name(&target, &name, Some(id))? != name {
            return Err(Error::Validation("此文件夹中已存在同名材料".into()));
        }
        if item.kind == "file"
            && Path::new(&name).extension().map(|s| s.to_ascii_lowercase())
                != Path::new(&item.name)
                    .extension()
                    .map(|s| s.to_ascii_lowercase())
        {
            return Err(Error::Validation("重命名时请保留原文件扩展名".into()));
        }
        if item.kind == "file" {
            let source = self.material_path(id)?;
            let destination = source.parent().ok_or(Error::NotFound)?.join(&name);
            if source != destination {
                if destination.exists() {
                    return Err(Error::Validation("归档目录已有同名文件".into()));
                }
                std::fs::rename(&source, &destination)?;
                if let Err(error) = self.connection.execute(
                    "UPDATE materials SET name=?1,storage_name=?1 WHERE id=?2",
                    params![name, id],
                ) {
                    let _ = std::fs::rename(destination, source);
                    return Err(Error::Database(error));
                }
            }
        } else {
            self.connection.execute(
                "UPDATE materials SET name=?1 WHERE id=?2",
                params![name, id],
            )?;
        }
        Ok(())
    }
    pub fn update_material_notes(&self, id: &str, notes: &str) -> Result<()> {
        self.material(id)?;
        if notes.chars().count() > 20000 {
            return Err(Error::Validation("备注过长".into()));
        }
        self.connection.execute(
            "UPDATE materials SET notes=?1 WHERE id=?2",
            params![notes.trim(), id],
        )?;
        Ok(())
    }
    pub fn move_material(&mut self, id: &str, target: MaterialTarget) -> Result<()> {
        let item = self.material(id)?;
        self.target(&target)?;
        if item.case_id != target.case_id {
            return Err(Error::Validation("仅支持在当前案件内移动".into()));
        }
        let descendants = self.descendant_ids(id)?;
        if target
            .parent_id
            .as_ref()
            .is_some_and(|parent| descendants.contains(parent))
        {
            return Err(Error::Validation("不能将文件夹移入自身或子文件夹".into()));
        }
        if self.unique_name(&target, &item.name, Some(id))? != item.name {
            return Err(Error::Validation("目标文件夹已有同名材料，请先改名".into()));
        }
        let tx = self.connection.transaction()?;
        for child in descendants {
            tx.execute(
                "UPDATE materials SET proceeding_id=?1 WHERE id=?2",
                params![target.proceeding_id, child],
            )?;
        }
        tx.execute(
            "UPDATE materials SET parent_id=?1 WHERE id=?2",
            params![target.parent_id, id],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn descendant_ids(&self, id: &str) -> Result<Vec<String>> {
        Ok(self.connection.prepare("WITH RECURSIVE tree(id) AS (SELECT id FROM materials WHERE id=?1 UNION SELECT m.id FROM materials m JOIN tree t ON m.parent_id=t.id) SELECT id FROM tree")?.query_map([id],|r|r.get(0))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn export_material(&self, id: &str, destination: &Path) -> Result<()> {
        let source = self.material_path(id)?;
        let parent = destination
            .parent()
            .ok_or_else(|| Error::Validation("导出目录无效".into()))?
            .canonicalize()?;
        let data = self.data_directory()?.canonicalize()?;
        if parent.starts_with(&data) {
            return Err(Error::Validation("请导出到工作区以外的文件夹".into()));
        }
        let mut temp = tempfile::NamedTempFile::new_in(parent)?;
        std::io::copy(&mut std::fs::File::open(source)?, &mut temp)?;
        temp.as_file().sync_all()?;
        temp.persist(destination).map_err(|e| Error::Io(e.error))?;
        Ok(())
    }
}
