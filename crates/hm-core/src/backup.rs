use crate::*;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::Read,
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;

fn rename_staged(source: &Path, target: &Path) -> Result<()> {
    // Windows scanners may briefly hold a just-written file without delete sharing.
    // Retry only transient sharing/access errors; never replace an existing destination.
    for attempt in 0..40 {
        match std::fs::rename(source, target) {
            Ok(()) => return Ok(()),
            Err(error)
                if cfg!(windows)
                    && matches!(error.raw_os_error(), Some(5 | 32 | 33))
                    && attempt < 39 =>
            {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(error) => {
                return Err(Error::Validation(format!(
                    "无法完成目录 {}：{error}",
                    target.display()
                )));
            }
        }
    }
    unreachable!()
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    application: String,
    format: u32,
    created_at: String,
    files: BTreeMap<String, String>,
    case_count: usize,
}
fn hash(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let size = file.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        hasher.update(&buffer[..size]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
fn backup_path(root: &Path, relative: &str) -> Result<PathBuf> {
    let rel = Path::new(relative);
    if rel.components().any(|c| !matches!(c, Component::Normal(_)))
        || !(relative == "workspace.sqlite3" || relative.starts_with("materials/"))
    {
        return Err(Error::Validation("备份包含无效路径".into()));
    }
    let path = root.join(rel);
    let actual = path.canonicalize()?;
    if !actual.starts_with(root) || !actual.is_file() {
        return Err(Error::Validation("备份文件超出目录或缺失".into()));
    }
    Ok(actual)
}
fn inspect(path: &Path) -> Result<(PathBuf, Manifest)> {
    let root = path.canonicalize()?;
    let manifest_path = root.join("manifest.json");
    if std::fs::metadata(&manifest_path)?.len() > 16 * 1024 * 1024 {
        return Err(Error::Validation("备份清单过大".into()));
    }
    let manifest: Manifest = serde_json::from_slice(&std::fs::read(manifest_path)?)?;
    if manifest.application != "com.limushu.hm"
        || manifest.format != 1
        || !manifest.files.contains_key("workspace.sqlite3")
    {
        return Err(Error::Validation("不是受支持的律师工作台备份".into()));
    }
    for (relative, expected) in &manifest.files {
        if hash(&backup_path(&root, relative)?)? != *expected {
            return Err(Error::Validation(format!("备份校验失败：{relative}")));
        }
    }
    let db = Connection::open_with_flags(
        root.join("workspace.sqlite3"),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let integrity: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    let foreign = db.prepare("PRAGMA foreign_key_check")?.exists([])?;
    if ![3, 4, 5, 6].contains(&version) || integrity != "ok" || foreign {
        return Err(Error::Validation("备份数据库版本或完整性检查失败".into()));
    }
    let cases = db.query_row("SELECT count(*) FROM cases", [], |r| r.get::<_, i64>(0))? as usize;
    if cases != manifest.case_count {
        return Err(Error::Validation("备份案件数量不一致".into()));
    }
    let files: Vec<(String, String, String)> = db
        .prepare("SELECT case_id,id,storage_name FROM materials WHERE kind='file'")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<rusqlite::Result<_>>()?;
    for (case, id, name) in files {
        crate::people::valid_id(&case)?;
        crate::people::valid_id(&id)?;
        crate::materials::valid_name(&name)?;
        if !manifest
            .files
            .contains_key(&format!("materials/{case}/{id}/{name}"))
        {
            return Err(Error::Validation("备份缺少归档材料".into()));
        }
    }
    Ok((root, manifest))
}
#[derive(Serialize, Deserialize)]
struct RestoreJournal {
    recovery_directory: String,
    old_directory: String,
}

pub(crate) fn recover_on_open(connection: &mut Connection, directory: &Path) -> Result<()> {
    let journal_path = directory.join("restore-journal.json");
    if !journal_path.exists() {
        return Ok(());
    }
    let directory = directory.canonicalize()?;
    let journal: RestoreJournal = serde_json::from_slice(&std::fs::read(&journal_path)?)?;
    if Path::new(&journal.old_directory).components().count() != 1 {
        return Err(Error::Validation("恢复日志无效".into()));
    }
    let (backup, manifest) = inspect(Path::new(&journal.recovery_directory))?;
    let recovery_root = directory.join("recovery").canonicalize()?;
    if !recovery_root.starts_with(&directory) || backup.parent() != Some(recovery_root.as_path()) {
        return Err(Error::Validation("恢复前副本不在工作区内".into()));
    }
    let stage = tempfile::Builder::new()
        .prefix(".hm-recovery-")
        .tempdir_in(&directory)?;
    let recovered = stage.path().join("materials");
    std::fs::create_dir_all(&recovered)?;
    for relative in manifest
        .files
        .keys()
        .filter(|key| key.starts_with("materials/"))
    {
        let target = stage.path().join(relative);
        std::fs::create_dir_all(target.parent().unwrap())?;
        std::fs::copy(backup_path(&backup, relative)?, target)?;
    }
    connection.restore(
        "main",
        backup.join("workspace.sqlite3"),
        None::<fn(rusqlite::backup::Progress)>,
    )?;
    Store::migrate(connection)?;
    let generation_name = format!("materials-restore-{}", Uuid::new_v4());
    let generation = directory.join(&generation_name);
    rename_staged(&recovered, &generation)?;
    connection.execute("INSERT INTO settings(key,value) VALUES('materials_directory',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&generation_name])?;
    connection.execute("INSERT INTO settings(key,value) VALUES('recovery_notice','上次恢复未完成，已自动退回恢复前副本。可重新选择备份恢复。') ON CONFLICT(key) DO UPDATE SET value=excluded.value",[])?;
    std::fs::remove_file(journal_path)?;
    // Old file generations can still be held by a WebView or an external editor.
    // Recovery checkpoints contain their own copies; leave locked old generations intact.
    Ok(())
}

impl Store {
    pub fn inspect_backup(path: &Path) -> Result<BackupInfo> {
        let (root, manifest) = inspect(path)?;
        Ok(BackupInfo {
            directory: root.to_string_lossy().into(),
            created_at: manifest.created_at,
            case_count: manifest.case_count,
            file_count: manifest.files.len() - 1,
        })
    }
    pub fn create_backup(&self, directory: &Path, retain: bool) -> Result<BackupInfo> {
        std::fs::create_dir_all(directory)?;
        let destination = directory.canonicalize()?;
        let materials = self.material_root()?;
        if destination.starts_with(&materials)
            || destination.starts_with(self.data_directory()?.join("webview"))
        {
            return Err(Error::Validation(
                "备份位置不能放在材料或界面缓存目录内".into(),
            ));
        }
        let stage = tempfile::Builder::new()
            .prefix(".hm-backup-staging-")
            .tempdir_in(&destination)?;
        let created_at: String =
            self.connection
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                    r.get(0)
                })?;
        self.connection
            .backup("main", stage.path().join("workspace.sqlite3"), None)?;
        let mut files = BTreeMap::new();
        files.insert(
            "workspace.sqlite3".into(),
            hash(&stage.path().join("workspace.sqlite3"))?,
        );
        let rows = self
            .connection
            .prepare("SELECT case_id,id,storage_name FROM materials WHERE kind='file'")?
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (case, id, name) in rows {
            crate::people::valid_id(&case)?;
            crate::people::valid_id(&id)?;
            crate::materials::valid_name(&name)?;
            let source = materials.join(&case).join(&id).join(&name).canonicalize()?;
            if !source.starts_with(&materials) {
                return Err(Error::Validation("材料路径超出工作区".into()));
            }
            let relative = format!("materials/{case}/{id}/{name}");
            let target = stage.path().join(&relative);
            std::fs::create_dir_all(target.parent().unwrap())?;
            std::fs::copy(&source, &target).map_err(|error| {
                Error::Validation(format!("无法复制备份材料 {}：{error}", source.display()))
            })?;
            files.insert(relative, hash(&target)?);
        }
        let case_count = self
            .connection
            .query_row("SELECT count(*) FROM cases", [], |r| r.get::<_, i64>(0))?
            as usize;
        let manifest = Manifest {
            application: "com.limushu.hm".into(),
            format: 1,
            created_at: created_at.clone(),
            files,
            case_count,
        };
        std::fs::write(
            stage.path().join("manifest.json"),
            serde_json::to_vec_pretty(&manifest)?,
        )?;
        let name = format!(
            "hm-backup-{}-{}",
            created_at.replace(['-', ':', '.'], ""),
            &Uuid::new_v4().to_string()[..8]
        );
        let final_path = destination.join(name);
        rename_staged(stage.path(), &final_path)?;
        if retain {
            let mut backups = std::fs::read_dir(&destination)?
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink())
                        && e.file_name().to_string_lossy().starts_with("hm-backup-")
                        && e.path().join("manifest.json").is_file()
                })
                .map(|e| e.path())
                .collect::<Vec<_>>();
            backups.sort();
            let excess = backups.len().saturating_sub(7);
            for backup in backups.into_iter().take(excess) {
                if let Ok((checked, _)) = inspect(&backup) {
                    if checked.parent() == Some(destination.as_path()) && checked != final_path {
                        std::fs::remove_dir_all(checked)?;
                    }
                }
            }
        }
        Ok(BackupInfo {
            directory: final_path.to_string_lossy().into(),
            created_at,
            case_count,
            file_count: manifest.files.len() - 1,
        })
    }
    pub fn restore_backup(&mut self, path: &Path, confirmed: bool) -> Result<BackupInfo> {
        if !confirmed {
            return Err(Error::Validation("恢复备份需要确认替换当前工作区".into()));
        }
        let (root, _manifest) = inspect(path)?;
        let directory = self.data_directory()?.canonicalize()?;
        if root == directory {
            return Err(Error::Validation("备份位置不能是当前工作区".into()));
        }
        let recovery = self.create_backup(&directory.join("recovery"), false)?;
        let stage = tempfile::Builder::new()
            .prefix(".hm-restore-")
            .tempdir_in(&directory)?;
        let stage_materials = stage.path().join("materials");
        std::fs::create_dir_all(&stage_materials)?;
        for relative in _manifest
            .files
            .keys()
            .filter(|s| s.starts_with("materials/"))
        {
            let target = stage.path().join(relative);
            std::fs::create_dir_all(target.parent().unwrap())?;
            std::fs::copy(backup_path(&root, relative)?, target)?;
        }
        let current = self.material_root()?;
        let generation_name = format!("materials-restore-{}", Uuid::new_v4());
        let generation = directory.join(&generation_name);
        let journal_path = directory.join("restore-journal.json");
        let journal = RestoreJournal {
            recovery_directory: recovery.directory.clone(),
            old_directory: current.file_name().unwrap().to_string_lossy().into(),
        };
        {
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&journal_path)?;
            file.write_all(&serde_json::to_vec(&journal)?)?;
            file.sync_all()?;
        }
        let result = (|| -> Result<()> {
            rename_staged(&stage_materials, &generation)?;
            self.connection.restore(
                "main",
                root.join("workspace.sqlite3"),
                None::<fn(rusqlite::backup::Progress)>,
            )?;
            Store::migrate(&mut self.connection)?;
            self.connection.execute("INSERT INTO settings(key,value) VALUES('materials_directory',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&generation_name])?;
            std::fs::remove_file(&journal_path)?;
            Ok(())
        })();
        if let Err(error) = result {
            // A failed restore must not leave a journal that later rolls back new work.
            recover_on_open(&mut self.connection, &directory)?;
            return Err(error);
        }
        Ok(recovery)
    }
}
