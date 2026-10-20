use hm_runtime::platform::{Document, DocumentDriver, DriverError, DriverResult};
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
        return Err(DriverError::invalid_state("document_not_file"));
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| DriverError::invalid_state("document_name_invalid"))?
        .to_owned();
    Ok(Box::new(LocalDocument { name, file }))
}
impl DocumentDriver for DesktopDocuments {
    fn pick(&self, title: &str, multiple: bool) -> DriverResult<Option<Vec<Box<dyn Document>>>> {
        let dialog = self.0.dialog().file().set_title(title);
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
                        let path = file.into_path().map_err(DriverError::io)?;
                        open_local(path)
                    })
                    .collect()
            })
            .transpose()
    }
    fn export(&self, title: &str, name: &str, source: &mut dyn Read) -> DriverResult<Option<u64>> {
        let Some(file) = self
            .0
            .dialog()
            .file()
            .set_title(title)
            .set_file_name(name)
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(DriverError::io)?;
        // Write beside the destination, then replace it only after a complete copy.
        let parent = path
            .parent()
            .ok_or_else(|| DriverError::invalid_state("export_destination_invalid"))?;
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
