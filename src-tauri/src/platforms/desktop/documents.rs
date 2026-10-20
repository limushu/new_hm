use hm_runtime::platform::{Document, DocumentDriver, DriverError, DriverErrorKind, DriverResult};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
};
use tauri_plugin_dialog::DialogExt;

pub struct DesktopDocuments(pub tauri::AppHandle);
struct LocalDocument {
    name: String,
    file: File,
}
impl Document for LocalDocument {
    fn name(&self) -> &str {
        &self.name
    }
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>> {
        self.file.seek(SeekFrom::Start(0))?;
        Ok(Box::new(&mut self.file))
    }
}
pub fn open_local(path: PathBuf) -> DriverResult<Box<dyn Document>> {
    let file = File::open(&path)?;
    if !file.metadata()?.is_file() {
        return Err(DriverError {
            kind: DriverErrorKind::Io,
            message: "请添加文件；文件夹请在材料页内创建".into(),
        });
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| DriverError {
            kind: DriverErrorKind::Io,
            message: "文件名无法读取".into(),
        })?
        .to_owned();
    Ok(Box::new(LocalDocument { name, file }))
}
impl DocumentDriver for DesktopDocuments {
    fn pick(&self, multiple: bool) -> DriverResult<Option<Vec<Box<dyn Document>>>> {
        let dialog = self
            .0
            .dialog()
            .file()
            .set_title("添加材料（复制归档，原文件保留）");
        let files = if multiple {
            dialog.blocking_pick_files()
        } else {
            dialog.blocking_pick_file().map(|file| vec![file])
        };
        files
            .map(|files| {
                files
                    .into_iter()
                    .map(|file| {
                        let path = file.into_path().map_err(|e| DriverError {
                            kind: DriverErrorKind::Io,
                            message: e.to_string(),
                        })?;
                        open_local(path)
                    })
                    .collect()
            })
            .transpose()
    }
    fn export(&self, name: &str, source: &mut dyn Read) -> DriverResult<Option<u64>> {
        let Some(file) = self
            .0
            .dialog()
            .file()
            .set_title("导出材料副本")
            .set_file_name(name)
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| DriverError {
            kind: DriverErrorKind::Io,
            message: e.to_string(),
        })?;
        // Write beside the destination, then replace it only after a complete copy.
        let parent = path
            .parent()
            .ok_or_else(|| DriverError::invalid_state("导出位置无效"))?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        let size = std::io::copy(source, &mut temporary)?;
        temporary.flush()?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(&path)
            .map_err(|e| DriverError::from(e.error))?;
        Ok(Some(size))
    }
}
