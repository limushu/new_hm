use hm_runtime::platform::{Document, DocumentDriver, DriverError, DriverErrorKind, DriverResult};
use serde::Deserialize;
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{plugin::PluginHandle, Manager};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_hm_documents);

#[derive(Clone)]
struct MobileDocuments {
    handle: PluginHandle<tauri::Wry>,
    temporary_root: Option<PathBuf>,
}

#[derive(Deserialize)]
struct Selected {
    name: String,
    file: Option<String>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct Reply {
    #[serde(default)]
    cancelled: bool,
    error: Option<String>,
    #[serde(default)]
    documents: Vec<Selected>,
}

fn document_error(code: &str) -> DriverError {
    DriverError {
        kind: match code {
            "permission_denied" => DriverErrorKind::PermissionDenied,
            "document_read_failed" | "document_export_failed" => DriverErrorKind::Io,
            _ => DriverErrorKind::InvalidState,
        },
        code: code.into(),
        resource: Some("document_provider".into()),
        detail: None,
    }
}

impl MobileDocuments {
    fn temporary(&self, prefix: &str) -> DriverResult<tempfile::TempDir> {
        let mut builder = tempfile::Builder::new();
        builder.prefix(prefix);
        Ok(match &self.temporary_root {
            Some(root) => builder.tempdir_in(root)?,
            None => builder.tempdir()?,
        })
    }
    fn call(&self, command: &str, payload: serde_json::Value) -> DriverResult<Reply> {
        let reply: Reply = self
            .handle
            .run_mobile_plugin(command, payload)
            .map_err(DriverError::io)?;
        if let Some(code) = &reply.error {
            return Err(document_error(code));
        }
        Ok(reply)
    }
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-documents")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_hm_documents)?;
            #[cfg(target_os = "android")]
            let handle =
                api.register_android_plugin("com.limushu.hm.documents", "DocumentsPlugin")?;
            #[cfg(target_os = "ios")]
            let temporary_root = None;
            #[cfg(target_os = "android")]
            let temporary_root = {
                let root = app.path().app_cache_dir()?;
                std::fs::create_dir_all(&root)?;
                Some(root)
            };
            app.manage(MobileDocuments {
                handle,
                temporary_root,
            });
            Ok(())
        })
        .build()
}

pub fn driver(app: &tauri::AppHandle) -> Box<dyn DocumentDriver> {
    Box::new(app.state::<MobileDocuments>().inner().clone())
}

// Only opaque staging filenames cross this private bridge. Provider URLs and
// security grants never enter business commands or the frontend.
struct SelectedDocument {
    directory: Arc<tempfile::TempDir>,
    selected: Selected,
}
impl Document for SelectedDocument {
    fn name(&self) -> &str {
        &self.selected.name
    }
    fn open(&mut self) -> DriverResult<Box<dyn Read + '_>> {
        if let Some(code) = &self.selected.error {
            return Err(document_error(code));
        }
        let file = self
            .selected
            .file
            .as_deref()
            .ok_or_else(|| document_error("document_read_failed"))?;
        // The native driver creates UUID filenames directly under this directory.
        if file.is_empty() || !file.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
            return Err(document_error("document_read_failed"));
        }
        Ok(Box::new(File::open(self.directory.path().join(file))?))
    }
}

impl DocumentDriver for MobileDocuments {
    fn pick(&self, title: &str, multiple: bool) -> DriverResult<Option<Vec<Box<dyn Document>>>> {
        let directory = Arc::new(self.temporary("hm-documents-")?);
        let reply = self.call(
            "pick",
            serde_json::json!({
                "title": title, "multiple": multiple, "directory": directory.path()
            }),
        )?;
        if reply.cancelled {
            return Ok(None);
        }
        if reply.documents.len() > 500 {
            return Err(document_error("import_limit_exceeded"));
        }
        Ok(Some(
            reply
                .documents
                .into_iter()
                .map(|selected| {
                    Box::new(SelectedDocument {
                        directory: directory.clone(),
                        selected,
                    }) as Box<dyn Document>
                })
                .collect(),
        ))
    }
    fn export(&self, title: &str, name: &str, source: &mut dyn Read) -> DriverResult<Option<u64>> {
        if name.is_empty()
            || name == "."
            || name == ".."
            || name.contains(['/', '\\'])
            || Path::new(name).file_name().and_then(|n| n.to_str()) != Some(name)
        {
            return Err(document_error("document_name_invalid"));
        }
        let directory = self.temporary("hm-export-")?;
        let path = directory.path().join(name);
        let mut file = File::create(&path)?;
        let size = std::io::copy(source, &mut file)?;
        file.sync_all()?;
        drop(file);
        let reply = self.call(
            "exportFile",
            serde_json::json!({"title": title, "path": path}),
        )?;
        Ok((!reply.cancelled).then_some(size))
    }
}
