use hm_runtime::platform::{
    CloudIdentity, DriverError, DriverResult, ReplicaIdentity, SyncDriver, SyncHead, SyncSession,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Write},
};
use tauri::{plugin::PluginHandle, Manager};

tauri::ios_plugin_binding!(init_plugin_hm_cloudkit);
const CHUNK: u64 = 16 * 1024 * 1024;
const MAX_BLOB: u64 = 16 * 1024 * 1024 * 1024;
fn valid(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn invalid() -> DriverError {
    DriverError::invalid_state("sync_data_invalid")
}

#[derive(Clone)]
struct Bridge(PluginHandle<tauri::Wry>);
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reply {
    error: Option<String>,
    subject: Option<String>,
    session_id: Option<String>,
    head: Option<SyncHead>,
    exists: Option<bool>,
    json: Option<String>,
    written: Option<u64>,
    conflict: Option<bool>,
}
impl Bridge {
    fn call(&self, command: &str, payload: serde_json::Value) -> DriverResult<Reply> {
        let reply: Reply = self
            .0
            .run_mobile_plugin(command, payload)
            .map_err(DriverError::io)?;
        if let Some(code) = &reply.error {
            return Err(DriverError::invalid_state(code));
        }
        Ok(reply)
    }
}
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("hm-cloudkit")
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_hm_cloudkit)?;
            app.manage(Bridge(handle));
            Ok(())
        })
        .build()
}
struct IosCloudKit {
    bridge: Bridge,
}
/// Caller supplies a backend-verified workspace binding, never a guessed email identity.
pub fn driver(app: &tauri::AppHandle) -> Box<dyn SyncDriver> {
    Box::new(IosCloudKit {
        bridge: app.state::<Bridge>().inner().clone(),
    })
}
impl SyncDriver for IosCloudKit {
    fn provider(&self) -> Option<&'static str> {
        Some("cloudkit")
    }
    fn storage_account(&self) -> DriverResult<CloudIdentity> {
        let reply = self.bridge.call("account", serde_json::json!({}))?;
        Ok(CloudIdentity {
            provider: "cloudkit".into(),
            subject: reply
                .subject
                .filter(|s| !s.is_empty())
                .ok_or_else(invalid)?,
        })
    }
    fn open(&self, identity: &ReplicaIdentity) -> DriverResult<Box<dyn SyncSession>> {
        if identity.storage.provider != "cloudkit" {
            return Err(invalid());
        }
        let reply=self.bridge.call("sessionOpen",serde_json::json!({"ownerId":identity.user_id,"workspaceId":identity.workspace_id,"subject":identity.storage.subject}))?;
        let id = reply.session_id.ok_or_else(invalid)?;
        Ok(Box::new(Session {
            bridge: self.bridge.clone(),
            identity: identity.clone(),
            id,
        }))
    }
}
struct Session {
    bridge: Bridge,
    identity: ReplicaIdentity,
    id: String,
}
#[derive(Serialize, Deserialize)]
struct BlobIndex {
    format: u8,
    digest: String,
    size: u64,
    parts: Vec<String>,
}
struct Download {
    file: File,
    _directory: tempfile::TempDir,
}
impl Read for Download {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        self.file.read(buffer)
    }
}
impl Session {
    fn call(&self, command: &str, mut value: serde_json::Value) -> DriverResult<Reply> {
        value["sessionId"] = self.id.clone().into();
        self.bridge.call(command, value)
    }
}
impl SyncSession for Session {
    fn identity(&self) -> &ReplicaIdentity {
        &self.identity
    }
    fn head(&mut self) -> DriverResult<Option<SyncHead>> {
        Ok(self.call("head", serde_json::json!({}))?.head)
    }
    fn has_blob(&mut self, hash: &str) -> DriverResult<bool> {
        if !valid(hash) {
            return Err(invalid());
        }
        Ok(self
            .call("exists", serde_json::json!({"digest":hash,"kind":"index"}))?
            .exists
            .unwrap_or(false))
    }
    fn put_blob(&mut self, hash: &str, source: &mut dyn Read) -> DriverResult<u64> {
        if !valid(hash) {
            return Err(invalid());
        }
        let directory = tempfile::Builder::new()
            .prefix("hm-cloudkit-upload-")
            .tempdir()?;
        let mut whole = Sha256::new();
        let mut size = 0;
        let mut parts = vec![];
        loop {
            let path = directory.path().join("part");
            let mut file = File::create(&path)?;
            let mut chunk = (&mut *source).take(CHUNK);
            let mut part = Sha256::new();
            let mut buffer = [0u8; 65536];
            let mut bytes = 0;
            loop {
                let read = chunk.read(&mut buffer)?;
                if read == 0 {
                    break;
                }
                file.write_all(&buffer[..read])?;
                part.update(&buffer[..read]);
                whole.update(&buffer[..read]);
                bytes += read as u64;
            }
            if bytes == 0 {
                break;
            }
            size += bytes;
            if size > MAX_BLOB {
                return Err(invalid());
            }
            file.sync_all()?;
            drop(file);
            let digest = format!("{:x}", part.finalize());
            if !self
                .call(
                    "exists",
                    serde_json::json!({"digest":digest,"kind":"chunk"}),
                )?
                .exists
                .unwrap_or(false)
            {
                let reply = self.call(
                    "putChunk",
                    serde_json::json!({"digest":digest,"path":path,"size":bytes}),
                )?;
                if reply.written != Some(bytes) {
                    return Err(DriverError::invalid_state("sync_upload_incomplete"));
                }
            }
            parts.push(digest);
        }
        if format!("{:x}", whole.finalize()) != hash {
            return Err(invalid());
        }
        let json = serde_json::to_string(&BlobIndex {
            format: 1,
            digest: hash.into(),
            size,
            parts,
        })
        .map_err(|_| invalid())?;
        self.call("putIndex", serde_json::json!({"digest":hash,"json":json}))?;
        Ok(size)
    }
    fn get_blob(&mut self, hash: &str) -> DriverResult<Box<dyn Read>> {
        if !valid(hash) {
            return Err(invalid());
        }
        let json = self
            .call("getIndex", serde_json::json!({"digest":hash}))?
            .json
            .ok_or_else(invalid)?;
        if json.len() > 128 * 1024 {
            return Err(invalid());
        }
        let index: BlobIndex = serde_json::from_str(&json).map_err(|_| invalid())?;
        if index.format != 1
            || index.digest != hash
            || index.size > MAX_BLOB
            || index.parts.len() > 1024
            || index.parts.iter().any(|p| !valid(p))
        {
            return Err(invalid());
        }
        let directory = tempfile::Builder::new()
            .prefix("hm-cloudkit-download-")
            .tempdir()?;
        let mut file = File::create(directory.path().join("blob"))?;
        let mut whole = Sha256::new();
        let mut total = 0u64;
        for digest in index.parts {
            let path = directory.path().join("part");
            // Each target must be absent for the native complete-copy operation.
            if path.exists() {
                std::fs::remove_file(&path)?;
            }
            self.call("getChunk", serde_json::json!({"digest":digest,"path":path}))?;
            let mut input = File::open(path)?;
            let mut part = Sha256::new();
            let mut buffer = [0u8; 65536];
            let mut size = 0;
            loop {
                let count = input.read(&mut buffer)?;
                if count == 0 {
                    break;
                }
                size += count as u64;
                total += count as u64;
                if size > CHUNK || total > index.size {
                    return Err(invalid());
                }
                part.update(&buffer[..count]);
                whole.update(&buffer[..count]);
                file.write_all(&buffer[..count])?;
            }
            if format!("{:x}", part.finalize()) != digest {
                return Err(invalid());
            }
        }
        if total != index.size || format!("{:x}", whole.finalize()) != hash {
            return Err(invalid());
        }
        file.flush()?;
        drop(file);
        // File::create is write-only; reopen after assembling the verified payload.
        let file = File::open(directory.path().join("blob"))?;
        Ok(Box::new(Download {
            file,
            _directory: directory,
        }))
    }
    fn publish(
        &mut self,
        expected: Option<&SyncHead>,
        revision: &str,
    ) -> DriverResult<Option<SyncHead>> {
        if !valid(revision) {
            return Err(invalid());
        }
        let reply = self.call(
            "publish",
            serde_json::json!({"expected":expected,"revision":revision}),
        )?;
        if reply.conflict == Some(true) {
            return Ok(None);
        }
        Ok(Some(reply.head.ok_or_else(invalid)?))
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.call("sessionClose", serde_json::json!({}));
    }
}
