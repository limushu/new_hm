//! Verified account catalog. Never accepts a UI-supplied owner or cloud credential.
use super::{failure, valid_id, IdentityService};
use hm_runtime::platform::{CloudIdentity, DriverResult, ReplicaIdentity};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudWorkspace {
    pub id: String,
    pub label: String,
}
pub struct WorkspaceCatalog {
    pub user_id: String,
    pub storage: CloudIdentity,
    pub workspaces: Vec<CloudWorkspace>,
}
fn stable_id(parts: &[&str]) -> String {
    let digest = Sha256::digest(serde_json::to_vec(parts).expect("string array"));
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    uuid::Uuid::from_bytes(bytes).to_string()
}
fn rows(value: Value) -> DriverResult<Vec<Value>> {
    let rows = value
        .as_array()
        .filter(|v| v.len() <= 200)
        .ok_or_else(|| failure("sync_catalog_invalid"))?;
    Ok(rows.clone())
}
impl IdentityService {
    /// The returned account has just been checked with the server, not decoded
    /// from an incoming URL, cached UI state, email address or user metadata.
    pub fn verified_user_id(&self) -> DriverResult<String> {
        Ok(self.authenticated()?.0.user_id)
    }

    pub fn cloud_workspaces(&self, storage: &CloudIdentity) -> DriverResult<WorkspaceCatalog> {
        if !["cloudkit", "onedrive", "google-drive"].contains(&storage.provider.as_str())
            || storage.subject.is_empty()
            || storage.subject.len() > 512
        {
            return Err(failure("sync_catalog_invalid"));
        }
        let (session, _) = self.authenticated()?;
        let provider = &storage.provider;
        let bindings_path = format!("/rest/v1/cloud_bindings?select=id,owner_id,provider,provider_subject&provider=eq.{provider}&limit=201");
        let mut binding = None;
        for attempt in 0..2 {
            let reply =
                self.backend
                    .request("GET", &bindings_path, Some(&session.access_token), None)?;
            if reply.status != 200 {
                return Err(failure("sync_catalog_unavailable"));
            }
            let mut matched = vec![];
            for row in rows(reply.body)? {
                if row["owner_id"] != session.user_id
                    || row["provider"] != *provider
                    || !row["id"].as_str().is_some_and(valid_id)
                {
                    return Err(failure("sync_scope_mismatch"));
                }
                if row["provider_subject"] == storage.subject {
                    matched.push(row);
                }
            }
            if matched.len() > 1 {
                return Err(failure("sync_catalog_invalid"));
            }
            if let Some(row) = matched.pop() {
                binding = row["id"].as_str().map(str::to_owned);
                break;
            }
            if attempt == 1 {
                return Err(failure("sync_catalog_unavailable"));
            }
            let id = stable_id(&[
                "anjian-binding-v1",
                self.backend.project(),
                &session.user_id,
                provider,
                &storage.subject,
            ]);
            let created = self.backend.request("POST", "/rest/v1/cloud_bindings", Some(&session.access_token),
                Some(json!({"id":id,"provider":provider,"provider_subject":storage.subject,"label":"我的云存储"})))?;
            // Another device may have created the same binding after our read.
            if ![200, 201, 204, 409].contains(&created.status) {
                return Err(failure("sync_catalog_unavailable"));
            }
        }
        let binding = binding.ok_or_else(|| failure("sync_catalog_unavailable"))?;
        let path = format!("/rest/v1/workspaces?select=id,owner_id,label,provider,cloud_binding_id,remote_locator&cloud_binding_id=eq.{binding}&order=created_at.asc&limit=201");
        for attempt in 0..2 {
            let reply = self
                .backend
                .request("GET", &path, Some(&session.access_token), None)?;
            if reply.status != 200 {
                return Err(failure("sync_catalog_unavailable"));
            }
            let mut workspaces = vec![];
            for row in rows(reply.body)? {
                let id = row["id"]
                    .as_str()
                    .filter(|v| valid_id(v))
                    .ok_or_else(|| failure("sync_catalog_invalid"))?;
                let label = row["label"]
                    .as_str()
                    .filter(|v| !v.is_empty() && v.chars().count() <= 120)
                    .ok_or_else(|| failure("sync_catalog_invalid"))?;
                if row["owner_id"] != session.user_id
                    || row["provider"] != *provider
                    || row["cloud_binding_id"] != binding
                    || row["remote_locator"]["workspaceId"] != id
                {
                    return Err(failure("sync_scope_mismatch"));
                }
                workspaces.push(CloudWorkspace {
                    id: id.into(),
                    label: label.into(),
                });
            }
            if !workspaces.is_empty() {
                return Ok(WorkspaceCatalog {
                    user_id: session.user_id,
                    storage: storage.clone(),
                    workspaces,
                });
            }
            if attempt == 1 {
                return Err(failure("sync_catalog_unavailable"));
            }
            // Same initial workspace on two devices, even when first enabled concurrently.
            let id = stable_id(&[
                "anjian-workspace-v1",
                self.backend.project(),
                &session.user_id,
                &binding,
            ]);
            let created = self.backend.request("POST", "/rest/v1/workspaces", Some(&session.access_token),
                Some(json!({"id":id,"label":"我的案件","provider":provider,"cloud_binding_id":binding,"remote_locator":{"workspaceId":id}})))?;
            if ![200, 201, 204, 409].contains(&created.status) {
                return Err(failure("sync_catalog_unavailable"));
            }
        }
        Err(failure("sync_catalog_unavailable"))
    }
    pub fn sync_identity(
        &self,
        storage: &CloudIdentity,
        workspace_id: Option<&str>,
    ) -> DriverResult<ReplicaIdentity> {
        let catalog = self.cloud_workspaces(storage)?;
        let workspace = match workspace_id {
            Some(id) => catalog
                .workspaces
                .iter()
                .find(|w| w.id == id)
                .ok_or_else(|| failure("sync_scope_mismatch"))?,
            None if catalog.workspaces.len() == 1 => &catalog.workspaces[0],
            None => return Err(failure("sync_workspace_selection_required")),
        };
        Ok(ReplicaIdentity {
            user_id: catalog.user_id,
            workspace_id: workspace.id.clone(),
            storage: catalog.storage,
        })
    }
}
