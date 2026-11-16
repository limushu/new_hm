//! Consistent local replicas; transport and account identity belong to other layers.
use super::{backup_path, hash, inspect, Manifest};
use crate::{BackupInfo, Error, Result, Store};
use rusqlite::{types::ValueRef, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::File,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

const MAX_TOTAL_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 16 * 1024 * 1024;
fn invalid() -> Error {
    Error::Validation("同步快照无效或已损坏".into())
}
pub fn valid_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSnapshotManifest {
    #[serde(flatten)]
    backup: Manifest,
    pub fingerprint: String,
}
impl SyncSnapshotManifest {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if bytes.len() > MAX_MANIFEST_BYTES {
            return Err(invalid());
        }
        let manifest: Self = serde_json::from_slice(bytes)?;
        if manifest.backup.application != "com.limushu.hm"
            || manifest.backup.format != 1
            || manifest.backup.files.len() > 100_001
            || !manifest.backup.files.contains_key("workspace.sqlite3")
            || !valid_digest(&manifest.fingerprint)
        {
            return Err(invalid());
        }
        for (name, digest) in &manifest.backup.files {
            if !valid_digest(digest)
                || name.contains(['\\', ':'])
                || name
                    .split('/')
                    .any(|p| p.is_empty() || p == "." || p == "..")
                || !Path::new(name)
                    .components()
                    .all(|c| matches!(c, Component::Normal(_)))
                || !(name == "workspace.sqlite3" || name.starts_with("materials/"))
            {
                return Err(invalid());
            }
        }
        Ok(manifest)
    }
    pub fn bytes(&self) -> Result<Vec<u8>> {
        Ok(serde_json::to_vec(self)?)
    }
    pub fn files(&self) -> &BTreeMap<String, String> {
        &self.backup.files
    }
    pub fn created_at(&self) -> &str {
        &self.backup.created_at
    }
    pub fn case_count(&self) -> usize {
        self.backup.case_count
    }
}

pub struct SyncSnapshot {
    directory: tempfile::TempDir,
    root: PathBuf,
    pub manifest: SyncSnapshotManifest,
    pub pristine: bool,
}
fn framed(hasher: &mut Sha256, value: &[u8]) {
    hasher.update((value.len() as u64).to_le_bytes());
    hasher.update(value);
}
/// Hash logical rows, not SQLite page layout, WAL, timestamps or device settings.
fn logical_fingerprint(db: &Connection, files: &BTreeMap<String, String>) -> Result<String> {
    let mut hasher = Sha256::new();
    let schema: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    framed(&mut hasher, &schema.to_le_bytes());
    let tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('settings','reminder_deliveries') ORDER BY name")?
        .query_map([], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
    for table in tables {
        framed(&mut hasher, table.as_bytes());
        let quoted = table.replace('"', "\"\"");
        let mut statement = db.prepare(&format!("SELECT * FROM \"{quoted}\""))?;
        let columns = statement
            .column_names()
            .iter()
            .map(|c| c.to_string())
            .collect::<Vec<_>>();
        framed(&mut hasher, &serde_json::to_vec(&columns)?);
        let count = columns.len();
        let rows = statement.query_map([], |row| {
            let mut values = Vec::new();
            for column in 0..count {
                values.push(match row.get_ref(column)? {
                    ValueRef::Null => serde_json::json!(["null"]),
                    ValueRef::Integer(v) => serde_json::json!(["integer", v]),
                    ValueRef::Real(v) => serde_json::json!(["real", v.to_bits()]),
                    ValueRef::Text(v) => serde_json::json!(["text", v]),
                    ValueRef::Blob(v) => serde_json::json!(["blob", v]),
                });
            }
            Ok(serde_json::to_vec(&values)
                .expect("SQLite values have a finite JSON representation"))
        })?;
        let mut rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        rows.sort();
        for row in rows {
            framed(&mut hasher, &row);
        }
    }
    for (name, digest) in files
        .iter()
        .filter(|(name, _)| name.as_str() != "workspace.sqlite3")
    {
        framed(&mut hasher, name.as_bytes());
        framed(&mut hasher, digest.as_bytes());
    }
    Ok(format!("{:x}", hasher.finalize()))
}
impl SyncSnapshot {
    pub fn info(&self) -> BackupInfo {
        BackupInfo {
            directory: self.root.to_string_lossy().into(),
            created_at: self.manifest.backup.created_at.clone(),
            case_count: self.manifest.case_count(),
            file_count: self.manifest.files().len() - 1,
        }
    }
    pub fn file(&self, relative: &str) -> Result<File> {
        if !self.manifest.files().contains_key(relative) {
            return Err(invalid());
        }
        Ok(File::open(backup_path(&self.root, relative)?)?)
    }
    /// Each source is independently owned so platform drivers can retain access while staging.
    pub fn from_remote(
        manifest: SyncSnapshotManifest,
        mut source: impl FnMut(&str) -> Result<Box<dyn Read>>,
    ) -> Result<Self> {
        let directory = tempfile::Builder::new()
            .prefix("hm-sync-incoming-")
            .tempdir()?;
        let root = directory.path().to_path_buf();
        let mut total = 0u64;
        for (name, digest) in manifest.files() {
            let path = root.join(name);
            std::fs::create_dir_all(path.parent().ok_or_else(invalid)?)?;
            let mut file = File::create(path)?;
            let remaining = MAX_TOTAL_BYTES.saturating_sub(total);
            let size = std::io::copy(&mut source(digest)?.take(remaining + 1), &mut file)?;
            total += size;
            if total > MAX_TOTAL_BYTES {
                return Err(invalid());
            }
            file.flush()?;
        }
        std::fs::write(root.join("manifest.json"), manifest.bytes()?)?;
        inspect(&root)?;
        let db = Connection::open_with_flags(
            root.join("workspace.sqlite3"),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        if logical_fingerprint(&db, manifest.files())? != manifest.fingerprint {
            return Err(invalid());
        }
        Ok(Self {
            directory,
            root,
            manifest,
            pristine: false,
        })
    }
    pub fn apply(&self, store: &mut Store, expected_local: &str) -> Result<BackupInfo> {
        // Recheck after network work, before altering any local data.
        if store.sync_fingerprint()? != expected_local {
            return Err(Error::Validation("sync_local_changed".into()));
        }
        let _keep_alive = &self.directory;
        store.restore_portable_backup(&self.root, true)
    }
}
impl Store {
    pub fn sync_fingerprint(&self) -> Result<String> {
        let mut files = BTreeMap::new();
        for material in self.materials()?.into_iter().filter(|m| m.kind == "file") {
            // Include trashed materials too; material_path intentionally rejects some trash states.
            let (case, name): (String, String) = self.connection.query_row(
                "SELECT case_id,storage_name FROM materials WHERE id=?1",
                [&material.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            crate::people::valid_id(&case)?;
            crate::people::valid_id(&material.id)?;
            crate::materials::valid_name(&name)?;
            let root = self.material_root()?;
            let path = root
                .join(&case)
                .join(&material.id)
                .join(&name)
                .canonicalize()?;
            if !path.starts_with(&root) {
                return Err(invalid());
            }
            files.insert(
                format!("materials/{case}/{}/{name}", material.id),
                hash(&path)?,
            );
        }
        logical_fingerprint(&self.connection, &files)
    }
    pub fn create_sync_snapshot(&self) -> Result<SyncSnapshot> {
        let directory = tempfile::Builder::new()
            .prefix("hm-sync-outgoing-")
            .tempdir()?;
        let info = self.create_backup(directory.path(), false)?;
        let (root, mut backup) = inspect(Path::new(&info.directory))?;
        let path = root.join("workspace.sqlite3");
        let db = Connection::open(&path)?;
        db.execute_batch(
            "PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; DELETE FROM reminder_deliveries; DELETE FROM settings; VACUUM;",
        )?;
        drop(db);
        backup
            .files
            .insert("workspace.sqlite3".into(), hash(&path)?);
        std::fs::write(root.join("manifest.json"), serde_json::to_vec(&backup)?)?;
        inspect(&root)?;
        let db = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let fingerprint = logical_fingerprint(&db, &backup.files)?;
        let empty = Store::memory()?;
        let pristine = fingerprint == logical_fingerprint(&empty.connection, &BTreeMap::new())?;
        // Path/preferences travel only as disposable snapshot metadata; restore preserves the target device's settings.
        let manifest = SyncSnapshotManifest {
            backup,
            fingerprint,
        };
        Ok(SyncSnapshot {
            directory,
            root,
            manifest,
            pristine,
        })
    }
}
