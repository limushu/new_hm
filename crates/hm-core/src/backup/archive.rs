//! Portable, verified snapshots. No platform, provider or network dependencies.
use super::{backup_path, inspect};
use crate::{BackupInfo, Error, Result, Store};
use std::{
    collections::HashSet,
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const MAX_ARCHIVE_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const MAX_ENTRIES: usize = 100_002;
fn invalid() -> Error {
    Error::Validation("备份文件无效、已损坏或超出支持范围".into())
}
fn zip_error(_: zip::result::ZipError) -> Error {
    invalid()
}
fn valid_entry(name: &str) -> bool {
    !name.contains('\\')
        && !name.contains(':')
        && !name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        && Path::new(name)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        && (name == "manifest.json"
            || name == "workspace.sqlite3"
            || name.starts_with("materials/"))
}

pub struct BackupArchive {
    directory: tempfile::TempDir,
    pub name: String,
    pub info: BackupInfo,
}
impl BackupArchive {
    pub fn open(&self) -> Result<File> {
        Ok(File::open(self.directory.path().join(&self.name))?)
    }
}

pub struct PreparedBackup {
    directory: tempfile::TempDir,
    pub info: BackupInfo,
}
impl PreparedBackup {
    /// Copy a scoped provider stream, bound extraction and verify before offering restore.
    pub fn read(source: &mut dyn Read) -> Result<Self> {
        let directory = tempfile::Builder::new()
            .prefix("hm-backup-import-")
            .tempdir()?;
        let mut input = tempfile::tempfile()?;
        if std::io::copy(&mut source.take(MAX_ARCHIVE_BYTES + 1), &mut input)? > MAX_ARCHIVE_BYTES {
            return Err(invalid());
        }
        input.seek(SeekFrom::Start(0))?;
        let mut archive = ZipArchive::new(input).map_err(zip_error)?;
        if archive.len() > MAX_ENTRIES {
            return Err(invalid());
        }
        let mut names = HashSet::new();
        let mut total = 0u64;
        // Validate the entire directory before writing any member.
        for index in 0..archive.len() {
            let entry = archive.by_index(index).map_err(zip_error)?;
            let name = entry.name();
            let mode = entry.unix_mode().unwrap_or(0) & 0o170000;
            if !valid_entry(name)
                || !names.insert(name.to_owned())
                || (mode != 0 && mode != 0o100000)
                || (name == "manifest.json" && entry.size() > 16 * 1024 * 1024)
            {
                return Err(invalid());
            }
            total = total.checked_add(entry.size()).ok_or_else(invalid)?;
            if total > MAX_EXPANDED_BYTES {
                return Err(invalid());
            }
        }
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(zip_error)?;
            let target = directory.path().join(entry.name());
            std::fs::create_dir_all(target.parent().ok_or_else(invalid)?)?;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)?;
            let expected = entry.size();
            if std::io::copy(&mut (&mut entry).take(expected + 1), &mut file)? != expected {
                return Err(invalid());
            }
        }
        let (_, manifest) = inspect(directory.path())?;
        if names.len() != manifest.files.len() + 1 {
            return Err(invalid());
        }
        let info = Store::inspect_backup(directory.path())?;
        Ok(Self { directory, info })
    }
    pub fn restore(&self, store: &mut Store, confirmed: bool) -> Result<BackupInfo> {
        store.restore_portable_backup(self.directory.path(), confirmed)
    }
}

impl Store {
    pub fn create_backup_archive(&self) -> Result<BackupArchive> {
        let directory = tempfile::Builder::new()
            .prefix("hm-backup-export-")
            .tempdir()?;
        let info = self.create_backup(directory.path(), false)?;
        let (root, manifest) = inspect(Path::new(&info.directory))?;
        if manifest.files.len() + 1 > MAX_ENTRIES {
            return Err(invalid());
        }
        let name = format!(
            "anjian-backup-{}.zip",
            manifest.created_at.replace(['-', ':', '.'], "")
        );
        let mut writer = ZipWriter::new(File::create(directory.path().join(&name))?);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .large_file(true);
        let mut total = 0u64;
        for relative in
            std::iter::once("manifest.json").chain(manifest.files.keys().map(String::as_str))
        {
            let path = if relative == "manifest.json" {
                root.join(relative)
            } else {
                backup_path(&root, relative)?
            };
            let mut input = File::open(path)?;
            total = total
                .checked_add(input.metadata()?.len())
                .ok_or_else(invalid)?;
            if total > MAX_EXPANDED_BYTES {
                return Err(invalid());
            }
            writer.start_file(relative, options).map_err(zip_error)?;
            std::io::copy(&mut input, &mut writer)?;
        }
        let mut file = writer.finish().map_err(zip_error)?;
        file.flush()?;
        file.sync_all()?;
        if file.metadata()?.len() > MAX_ARCHIVE_BYTES {
            return Err(invalid());
        }
        // The archive is complete; release its redundant snapshot before opening Files.
        std::fs::remove_dir_all(root)?;
        Ok(BackupArchive {
            directory,
            name,
            info,
        })
    }
}
