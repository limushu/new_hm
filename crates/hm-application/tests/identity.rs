use hm_application::identity::{
    callback_code, pkce_challenge, BackendReply, IdentityBackend, IdentityService, Provider,
    PublicIdentityConfig,
};
use hm_runtime::platform::{DriverError, DriverResult, IdentityDriver, UnavailableIdentity};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

const PROJECT: &str = "abcdefghijklmnopqrst";
const USER: &str = "00000000-0000-0000-0000-000000000001";
const OTHER: &str = "00000000-0000-0000-0000-000000000002";
#[derive(Default)]
struct Vault {
    value: Option<String>,
    fail_write: bool,
    authorizations: Vec<String>,
    callback: Option<String>,
}
struct Native(Arc<Mutex<Vault>>);
impl IdentityDriver for Native {
    fn installed(&self) -> bool {
        true
    }
    fn load(&self, _: &str) -> DriverResult<Option<String>> {
        Ok(self.0.lock().unwrap().value.clone())
    }
    fn save(&self, _: &str, value: Option<&str>) -> DriverResult<()> {
        let mut vault = self.0.lock().unwrap();
        if vault.fail_write {
            return Err(DriverError::invalid_state("identity_secure_storage_failed"));
        }
        vault.value = value.map(str::to_owned);
        Ok(())
    }
    fn authorize(&self, url: &str, _: &str) -> DriverResult<String> {
        let mut vault = self.0.lock().unwrap();
        vault.authorizations.push(url.into());
        Ok(vault
            .callback
            .clone()
            .unwrap_or_else(|| "anjian://auth/callback?code=code-for-verifier".into()))
    }
}
struct Server {
    bindings: Vec<Value>,
    workspaces: Vec<Value>,
    catalog_race: bool,
    enabled: bool,
    offline: bool,
    exchanged_user: String,
    current_user: String,
    providers: Vec<&'static str>,
    calls: Vec<(String, String, Option<Value>)>,
    reject_refresh: bool,
    user_status: u16,
    delete_status: u16,
    link_url: String,
}
impl Default for Server {
    fn default() -> Self {
        Self {
            bindings: vec![],
            workspaces: vec![],
            catalog_race: false,
            enabled: true,
            offline: false,
            exchanged_user: USER.into(),
            current_user: USER.into(),
            providers: vec!["google"],
            calls: vec![],
            reject_refresh: false,
            user_status: 200,
            delete_status: 200,
            link_url: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque-server-state"
                .into(),
        }
    }
}
struct Backend(Arc<Mutex<Server>>);
fn user(id: &str, providers: &[&str]) -> Value {
    json!({"id":id,"email":"test@example.invalid","user_metadata":{"full_name":"虚构律师"},"identities":providers.iter().enumerate().map(|(i,provider)| json!({"provider":provider,"identity_id":format!("10000000-0000-0000-0000-{:012}",i+1)})).collect::<Vec<_>>()})
}
impl IdentityBackend for Backend {
    fn project(&self) -> &str {
        PROJECT
    }
    fn origin(&self) -> &str {
        "https://abcdefghijklmnopqrst.supabase.co"
    }
    fn request(
        &self,
        method: &str,
        path: &str,
        _: Option<&str>,
        body: Option<Value>,
    ) -> DriverResult<BackendReply> {
        let mut server = self.0.lock().unwrap();
        server
            .calls
            .push((method.into(), path.into(), body.clone()));
        if server.offline {
            return Err(DriverError::invalid_state("identity_service_unavailable"));
        }
        let (status, value) = if path == "/auth/v1/settings" {
            (
                200,
                json!({"external":{"apple":server.enabled,"google":server.enabled,"azure":server.enabled}}),
            )
        } else if path.starts_with("/auth/v1/user/identities/authorize?") {
            (200, json!({"url":server.link_url}))
        } else if path.starts_with("/auth/v1/token?") {
            if path.contains("refresh_token") && server.reject_refresh {
                (400, json!({"error":"invalid_grant"}))
            } else {
                (
                    200,
                    json!({"access_token":"fake-new-access","refresh_token":"fake-new-refresh","expires_in":3600,"user":user(&server.exchanged_user, &server.providers)}),
                )
            }
        } else if path == "/auth/v1/user" {
            (
                server.user_status,
                user(&server.current_user, &server.providers),
            )
        } else if path == "/functions/v1/delete-account" {
            (
                server.delete_status,
                json!({"code":if server.delete_status == 200 {"account_deleted"} else {"account_deletion_failed"}}),
            )
        } else if method == "DELETE" && path.starts_with("/auth/v1/user/identities/") {
            server.providers.pop();
            (200, json!({}))
        } else if path.starts_with("/auth/v1/logout?") {
            (204, Value::Null)
        } else if path.starts_with("/rest/v1/cloud_bindings") {
            if method == "GET" {
                (200, json!(server.bindings))
            } else {
                let mut row = body.unwrap();
                row["owner_id"] = server.current_user.clone().into();
                server.bindings.push(row);
                (if server.catalog_race { 409 } else { 201 }, Value::Null)
            }
        } else if path.starts_with("/rest/v1/workspaces") {
            if method == "GET" {
                (200, json!(server.workspaces))
            } else {
                let mut row = body.unwrap();
                row["owner_id"] = server.current_user.clone().into();
                server.workspaces.push(row);
                (if server.catalog_race { 409 } else { 201 }, Value::Null)
            }
        } else {
            panic!("Unexpected account request {method} {path}")
        };
        Ok(BackendReply {
            status,
            body: value,
        })
    }
}
fn setup() -> (IdentityService, Arc<Mutex<Vault>>, Arc<Mutex<Server>>) {
    let vault = Arc::new(Mutex::new(Vault::default()));
    let server = Arc::new(Mutex::new(Server::default()));
    (
        IdentityService::new(
            Box::new(Native(vault.clone())),
            Box::new(Backend(server.clone())),
        ),
        vault,
        server,
    )
}
fn credential(expiry: u64) -> String {
    json!({"project":PROJECT,"user_id":USER,"access_token":"fake-old-access","refresh_token":"fake-old-refresh","expires_at":expiry,"apple_refresh_token":"fake-apple-grant"}).to_string()
}
fn error<T>(result: DriverResult<T>) -> String {
    result.err().expect("expected rejection").code
}

#[test]
fn pkce_and_callback_reject_implicit_tokens_wrong_routes_and_ambiguous_codes() {
    assert_eq!(
        pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
    assert_eq!(
        callback_code("anjian://auth/callback?code=valid").unwrap(),
        "valid"
    );
    for url in [
        "https://auth/callback?code=x",
        "anjian://other/callback?code=x",
        "anjian://auth/callback#access_token=x",
        "anjian://auth/callback?code=x&code=y",
        "anjian://auth/callback?code=x&access_token=y",
        "anjian://user@auth/callback?code=x",
    ] {
        assert_eq!(error(callback_code(url)), "identity_callback_invalid");
    }
}
#[test]
fn login_verifies_server_identity_uses_random_pkce_and_only_exposes_public_state() {
    let (service, vault, server) = setup();
    let snapshot = service.sign_in(Provider::Google).unwrap();
    assert_eq!(snapshot.account.unwrap().id, USER);
    let stored = vault.lock().unwrap().value.clone().unwrap();
    assert!(stored.contains("fake-new-refresh"));
    let public = serde_json::to_string(&service.snapshot().unwrap()).unwrap();
    assert!(!public.contains("fake-new") && !public.contains("token"));
    let server = server.lock().unwrap();
    let exchange = server
        .calls
        .iter()
        .find(|(_, p, _)| p.contains("grant_type=pkce"))
        .unwrap();
    let verifier = exchange.2.as_ref().unwrap()["code_verifier"]
        .as_str()
        .unwrap();
    assert_eq!(verifier.len(), 64);
    let url = url::Url::parse(&vault.lock().unwrap().authorizations[0]).unwrap();
    assert!(url
        .query_pairs()
        .any(|(k, v)| k == "code_challenge" && v == pkce_challenge(verifier)));
}
#[test]
fn disabled_provider_and_wrong_callback_never_exchange_or_save_credentials() {
    let (service, vault, server) = setup();
    server.lock().unwrap().enabled = false;
    assert_eq!(
        error(service.sign_in(Provider::Google)),
        "identity_provider_not_configured"
    );
    assert!(vault.lock().unwrap().authorizations.is_empty());
    server.lock().unwrap().enabled = true;
    vault.lock().unwrap().callback = Some("anjian://auth/callback#access_token=forged".into());
    assert_eq!(
        error(service.sign_in(Provider::Google)),
        "identity_callback_invalid"
    );
    assert!(vault.lock().unwrap().value.is_none());
    assert!(!server
        .lock()
        .unwrap()
        .calls
        .iter()
        .any(|(_, p, _)| p.contains("grant_type=pkce")));
}
#[test]
fn binding_another_account_never_replaces_existing_credential_and_rejects_untrusted_url() {
    let (service, vault, server) = setup();
    let original = credential(u64::MAX - 100);
    vault.lock().unwrap().value = Some(original.clone());
    server.lock().unwrap().exchanged_user = OTHER.into();
    assert_eq!(
        error(service.link(Provider::Azure)),
        "identity_response_invalid"
    ); // Google URL for Azure is rejected.
    assert!(vault.lock().unwrap().authorizations.is_empty());
    server.lock().unwrap().link_url =
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize".into();
    assert_eq!(
        error(service.link(Provider::Azure)),
        "identity_account_changed"
    );
    assert_eq!(
        vault.lock().unwrap().value.as_deref(),
        Some(original.as_str())
    );
}
#[test]
fn refresh_rotation_is_persisted_failures_do_not_silently_replace_or_erase_session() {
    let (service, vault, server) = setup();
    vault.lock().unwrap().value = Some(credential(0));
    assert!(service.snapshot().unwrap().account.is_some());
    let saved: Value = serde_json::from_str(vault.lock().unwrap().value.as_ref().unwrap()).unwrap();
    assert_eq!(saved["refresh_token"], "fake-new-refresh");
    assert_eq!(saved["apple_refresh_token"], "fake-apple-grant");
    let expired = credential(0);
    vault.lock().unwrap().value = Some(expired.clone());
    vault.lock().unwrap().fail_write = true;
    assert_eq!(error(service.snapshot()), "identity_secure_storage_failed");
    assert_eq!(
        vault.lock().unwrap().value.as_deref(),
        Some(expired.as_str())
    );
    vault.lock().unwrap().fail_write = false;
    server.lock().unwrap().exchanged_user = OTHER.into();
    assert_eq!(error(service.snapshot()), "identity_account_changed");
    assert_eq!(
        vault.lock().unwrap().value.as_deref(),
        Some(expired.as_str())
    );
    server.lock().unwrap().reject_refresh = true;
    assert!(service.snapshot().unwrap().account.is_none());
    assert!(vault.lock().unwrap().value.is_none());
}
#[test]
fn offline_does_not_delete_session_and_explicit_signout_works_with_damaged_credentials() {
    let (service, vault, server) = setup();
    let original = credential(u64::MAX - 100);
    vault.lock().unwrap().value = Some(original.clone());
    server.lock().unwrap().offline = true;
    assert_eq!(error(service.snapshot()), "identity_service_unavailable");
    assert_eq!(
        vault.lock().unwrap().value.as_deref(),
        Some(original.as_str())
    );
    service.sign_out().unwrap();
    assert!(vault.lock().unwrap().value.is_none());
    vault.lock().unwrap().value = Some("damaged credential".into());
    service.sign_out().unwrap();
    assert!(vault.lock().unwrap().value.is_none());
}
#[test]
fn last_provider_and_unconfirmed_or_failed_deletion_preserve_account() {
    let (service, vault, server) = setup();
    let original = credential(u64::MAX - 100);
    vault.lock().unwrap().value = Some(original.clone());
    assert_eq!(
        error(service.delete_account(false)),
        "identity_delete_confirmation_required"
    );
    assert!(server.lock().unwrap().calls.is_empty());
    assert_eq!(
        error(service.unlink(Provider::Google)),
        "identity_last_provider"
    );
    server.lock().unwrap().delete_status = 503;
    assert_eq!(
        error(service.delete_account(true)),
        "identity_delete_failed"
    );
    assert_eq!(
        vault.lock().unwrap().value.as_deref(),
        Some(original.as_str())
    );
    server.lock().unwrap().delete_status = 200;
    service.delete_account(true).unwrap();
    assert!(vault.lock().unwrap().value.is_none());
}
#[test]
fn missing_apple_revocation_grant_does_not_delete_and_unsupported_driver_never_calls_network() {
    let (service, vault, server) = setup();
    let mut saved: Value = serde_json::from_str(&credential(u64::MAX - 100)).unwrap();
    saved["apple_refresh_token"] = Value::Null;
    vault.lock().unwrap().value = Some(saved.to_string());
    server.lock().unwrap().providers = vec!["apple"];
    assert_eq!(
        error(service.delete_account(true)),
        "apple_reauthorization_required"
    );
    assert!(!server
        .lock()
        .unwrap()
        .calls
        .iter()
        .any(|(_, p, _)| p == "/functions/v1/delete-account"));
    server.lock().unwrap().calls.clear();
    let unsupported = IdentityService::new(
        Box::new(UnavailableIdentity),
        Box::new(Backend(server.clone())),
    );
    assert!(!unsupported.snapshot().unwrap().installed);
    assert!(server.lock().unwrap().calls.is_empty());
}
#[test]
fn public_configuration_is_project_pinned_and_rejects_privileged_keys_or_urls() {
    let mut config = PublicIdentityConfig {
        project_ref: PROJECT.into(),
        api_url: format!("https://{PROJECT}.supabase.co"),
        public_key: "sb_publishable_fixture".into(),
    };
    config.validate().unwrap();
    config.public_key = "sb_secret_fixture".into();
    assert!(config.validate().is_err());
    config.public_key = "sb_publishable_fixture".into();
    config.api_url = "https://wrong.supabase.co".into();
    assert!(config.validate().is_err());
    let actual: PublicIdentityConfig =
        serde_json::from_str(include_str!("../../../supabase/client.public.json")).unwrap();
    actual.validate().unwrap();
}

#[test]
fn cloud_catalog_converges_first_device_races_uses_verified_owner_and_never_submits_owner() {
    use hm_runtime::platform::CloudIdentity;
    let (service, vault, server) = setup();
    vault.lock().unwrap().value = Some(credential(4_000_000_000));
    server.lock().unwrap().catalog_race = true;
    let storage = CloudIdentity {
        provider: "cloudkit".into(),
        subject: "opaque-cloud-subject,not-a-query".into(),
    };
    let first = service.sync_identity(&storage, None).unwrap();
    let second = service.sync_identity(&storage, None).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.user_id, USER);
    let server = server.lock().unwrap();
    assert_eq!(server.bindings.len(), 1);
    assert_eq!(server.workspaces.len(), 1);
    for (method, path, body) in &server.calls {
        if path.starts_with("/rest/v1/") {
            assert!(!path.contains(&storage.subject));
            if method == "POST" {
                assert!(body.as_ref().unwrap().get("owner_id").is_none());
            }
        }
    }
}
#[test]
fn cloud_catalog_rejects_foreign_rows_mismatched_locators_and_unknown_selected_workspace() {
    use hm_runtime::platform::CloudIdentity;
    let (service, vault, server) = setup();
    vault.lock().unwrap().value = Some(credential(4_000_000_000));
    let storage = CloudIdentity {
        provider: "cloudkit".into(),
        subject: "opaque-cloud-subject".into(),
    };
    service.sync_identity(&storage, None).unwrap();
    assert_eq!(
        error(service.sync_identity(&storage, Some(OTHER))),
        "sync_scope_mismatch"
    );
    server.lock().unwrap().workspaces[0]["remote_locator"]["workspaceId"] = OTHER.into();
    assert_eq!(
        error(service.sync_identity(&storage, None)),
        "sync_scope_mismatch"
    );
    server.lock().unwrap().bindings[0]["owner_id"] = OTHER.into();
    assert_eq!(
        error(service.cloud_workspaces(&storage)),
        "sync_scope_mismatch"
    );
    server.lock().unwrap().user_status = 401;
    assert_eq!(
        error(service.verified_user_id()),
        "identity_session_expired"
    );
}
