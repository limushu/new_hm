//! Unified identity. The backend verifies identity; native drivers own authorization
//! and credentials. Workspace data, preferences and backup snapshots never own tokens.
mod hosted;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hm_runtime::platform::{DriverError, DriverResult, IdentityDriver};
pub use hosted::{HostedIdentity, PublicIdentityConfig};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

pub const CALLBACK: &str = "anjian://auth/callback";

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Apple,
    Google,
    Azure,
}
impl Provider {
    pub fn name(self) -> &'static str {
        match self {
            Self::Apple => "apple",
            Self::Google => "google",
            Self::Azure => "azure",
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: Provider,
    pub enabled: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub providers: Vec<Provider>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySnapshot {
    pub installed: bool,
    pub providers: Vec<ProviderStatus>,
    pub account: Option<Account>,
    pub cloud_sync_available: bool,
}
pub struct BackendReply {
    pub status: u16,
    pub body: Value,
}
/// Replaceable HTTP boundary; access credentials are private to this service.
pub trait IdentityBackend: Send + Sync {
    fn project(&self) -> &str;
    fn origin(&self) -> &str;
    fn request(
        &self,
        method: &str,
        path: &str,
        access: Option<&str>,
        body: Option<Value>,
    ) -> DriverResult<BackendReply>;
}
#[derive(Serialize, Deserialize)]
struct Session {
    project: String,
    user_id: String,
    access_token: String,
    refresh_token: String,
    expires_at: u64,
    apple_refresh_token: Option<String>,
}
pub struct IdentityService {
    driver: Box<dyn IdentityDriver>,
    backend: Box<dyn IdentityBackend>,
}
fn failure(code: &str) -> DriverError {
    DriverError::invalid_state(code)
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}
fn valid_id(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok()
}
fn token(value: &Value, field: &str) -> DriverResult<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && s.len() <= 16384 && !s.chars().any(char::is_control))
        .map(str::to_owned)
        .ok_or_else(|| failure("identity_response_invalid"))
}
fn account(value: &Value) -> DriverResult<Account> {
    let id = value["id"]
        .as_str()
        .filter(|s| valid_id(s))
        .ok_or_else(|| failure("identity_response_invalid"))?
        .to_owned();
    let providers = value["identities"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| serde_json::from_value::<Provider>(item["provider"].clone()).ok())
        .fold(Vec::new(), |mut providers, provider| {
            if !providers.contains(&provider) {
                providers.push(provider);
            }
            providers
        });
    Ok(Account {
        id,
        providers,
        email: value["email"]
            .as_str()
            .map(|s| s.chars().take(320).collect()),
        name: value["user_metadata"]["full_name"]
            .as_str()
            .or_else(|| value["user_metadata"]["name"].as_str())
            .map(|s| s.chars().take(80).collect()),
    })
}
/// PKCE protects the authorization code; reject implicit tokens, wrong routes and
/// ambiguous parameters rather than importing a bearer from an incoming URL.
pub fn callback_code(callback: &str) -> DriverResult<String> {
    let url = Url::parse(callback).map_err(|_| failure("identity_callback_invalid"))?;
    if url.scheme() != "anjian"
        || url.host_str() != Some("auth")
        || url.path() != "/callback"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return Err(failure("identity_callback_invalid"));
    }
    let parameters = url.query_pairs().collect::<Vec<_>>();
    if parameters
        .iter()
        .any(|(key, _)| key == "error" || key == "error_code")
    {
        return Err(failure("identity_authorization_failed"));
    }
    if parameters.iter().any(|(key, _)| key != "code") || parameters.len() != 1 {
        return Err(failure("identity_callback_invalid"));
    }
    let code = &parameters[0].1;
    if code.is_empty() || code.len() > 2048 || code.chars().any(char::is_control) {
        return Err(failure("identity_callback_invalid"));
    }
    Ok(code.to_string())
}
impl IdentityService {
    pub fn new(driver: Box<dyn IdentityDriver>, backend: Box<dyn IdentityBackend>) -> Self {
        Self { driver, backend }
    }
    fn supported(&self) -> DriverResult<()> {
        if self.driver.installed() {
            Ok(())
        } else {
            Err(DriverError::unsupported("account_login"))
        }
    }
    fn providers(&self) -> DriverResult<Vec<ProviderStatus>> {
        let reply = self
            .backend
            .request("GET", "/auth/v1/settings", None, None)?;
        if reply.status != 200 {
            return Err(failure("identity_service_unavailable"));
        }
        Ok([Provider::Apple, Provider::Google, Provider::Azure]
            .into_iter()
            .map(|provider| ProviderStatus {
                provider,
                enabled: reply.body["external"][provider.name()].as_bool() == Some(true),
            })
            .collect())
    }
    fn save(&self, session: &Session) -> DriverResult<()> {
        let encoded =
            serde_json::to_string(session).map_err(|_| failure("identity_response_invalid"))?;
        self.driver.save(self.backend.project(), Some(&encoded))
    }
    fn session(&self) -> DriverResult<Option<Session>> {
        self.supported()?;
        let Some(encoded) = self.driver.load(self.backend.project())? else {
            return Ok(None);
        };
        let mut session: Session =
            serde_json::from_str(&encoded).map_err(|_| failure("identity_session_invalid"))?;
        if session.project != self.backend.project()
            || !valid_id(&session.user_id)
            || session.access_token.is_empty()
            || session.refresh_token.is_empty()
            || encoded.len() > 65536
        {
            return Err(failure("identity_session_invalid"));
        }
        if session.expires_at <= now() + 60 {
            let reply = self.backend.request(
                "POST",
                "/auth/v1/token?grant_type=refresh_token",
                None,
                Some(json!({"refresh_token": session.refresh_token})),
            )?;
            if [400, 401, 403].contains(&reply.status) {
                self.driver.save(self.backend.project(), None)?;
                return Ok(None);
            }
            if reply.status != 200 {
                return Err(failure("identity_service_unavailable"));
            }
            let renewed = self.make_session(&reply.body, session.apple_refresh_token.clone())?;
            if renewed.user_id != session.user_id {
                return Err(failure("identity_account_changed"));
            }
            self.save(&renewed)?; // Persist rotated refresh token before exposing a session.
            session = renewed;
        }
        Ok(Some(session))
    }
    fn user(&self, session: &Session) -> DriverResult<Value> {
        let reply =
            self.backend
                .request("GET", "/auth/v1/user", Some(&session.access_token), None)?;
        if [401, 403].contains(&reply.status) {
            return Err(failure("identity_session_expired"));
        }
        if reply.status != 200 {
            return Err(failure("identity_service_unavailable"));
        }
        if account(&reply.body)?.id != session.user_id {
            return Err(failure("identity_account_changed"));
        }
        Ok(reply.body)
    }
    fn authenticated(&self) -> DriverResult<(Session, Value)> {
        let session = self
            .session()?
            .ok_or_else(|| failure("identity_session_expired"))?;
        let user = self.user(&session)?;
        Ok((session, user))
    }
    pub fn snapshot(&self) -> DriverResult<IdentitySnapshot> {
        if !self.driver.installed() {
            return Ok(IdentitySnapshot {
                installed: false,
                providers: vec![],
                account: None,
                cloud_sync_available: false,
            });
        }
        let providers = self.providers()?;
        let account = match self.session()? {
            Some(session) => match self.user(&session) {
                Ok(user) => Some(account(&user)?),
                Err(error) if error.code == "identity_session_expired" => {
                    self.driver.save(self.backend.project(), None)?;
                    None
                }
                Err(error) => return Err(error),
            },
            None => None,
        };
        Ok(IdentitySnapshot {
            installed: true,
            providers,
            account,
            cloud_sync_available: false,
        })
    }
    fn make_session(
        &self,
        value: &Value,
        apple_refresh_token: Option<String>,
    ) -> DriverResult<Session> {
        let user = account(&value["user"])?;
        let expires_in = value["expires_in"]
            .as_u64()
            .filter(|s| *s > 0 && *s <= 604800)
            .ok_or_else(|| failure("identity_response_invalid"))?;
        Ok(Session {
            project: self.backend.project().to_owned(),
            user_id: user.id,
            access_token: token(value, "access_token")?,
            refresh_token: token(value, "refresh_token")?,
            expires_at: now() + expires_in,
            apple_refresh_token,
        })
    }
    fn oauth(&self, provider: Provider, linking: bool, expected: Option<&str>) -> DriverResult<()> {
        self.supported()?;
        if !self
            .providers()?
            .iter()
            .any(|p| p.provider == provider && p.enabled)
        {
            return Err(failure("identity_provider_not_configured"));
        }
        // Two OS-random UUIDs supply 244 random bits, within RFC 7636 verifier limits.
        let verifier = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let mut url = Url::parse(&format!("{}/auth/v1/authorize", self.backend.origin()))
            .map_err(|_| failure("identity_configuration_invalid"))?;
        url.query_pairs_mut()
            .append_pair("provider", provider.name())
            .append_pair("redirect_to", CALLBACK)
            .append_pair("code_challenge", &pkce_challenge(&verifier))
            .append_pair("code_challenge_method", "s256");
        if provider == Provider::Azure {
            url.query_pairs_mut().append_pair("scopes", "email");
        }
        if linking {
            let (session, _) = self.authenticated()?;
            let query = url.query().unwrap_or_default();
            let reply = self.backend.request(
                "GET",
                &format!("/auth/v1/user/identities/authorize?{query}&skip_http_redirect=true"),
                Some(&session.access_token),
                None,
            )?;
            if reply.status != 200 {
                return Err(failure("identity_link_failed"));
            }
            url = Url::parse(
                reply.body["url"]
                    .as_str()
                    .ok_or_else(|| failure("identity_response_invalid"))?,
            )
            .map_err(|_| failure("identity_response_invalid"))?;
            // The server returns the external provider's authorization URL. Native
            // authentication is allowed to visit it, never to send our bearer to it.
            let allowed = match provider {
                Provider::Apple => url.host_str() == Some("appleid.apple.com"),
                Provider::Google => url.host_str() == Some("accounts.google.com"),
                Provider::Azure => {
                    url.host_str() == Some("login.microsoftonline.com")
                        || url.host_str() == Some("login.live.com")
                }
            };
            if !allowed
                || url.scheme() != "https"
                || !url.username().is_empty()
                || url.password().is_some()
                || url.port().is_some()
            {
                return Err(failure("identity_response_invalid"));
            }
        }
        let callback = self.driver.authorize(url.as_str(), CALLBACK)?;
        let code = callback_code(&callback)?;
        let reply = self.backend.request(
            "POST",
            "/auth/v1/token?grant_type=pkce",
            None,
            Some(json!({"auth_code": code, "code_verifier": verifier})),
        )?;
        if reply.status != 200 {
            return Err(failure("identity_authorization_failed"));
        }
        let apple_refresh = if provider == Provider::Apple {
            reply.body["provider_refresh_token"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 8192)
                .map(str::to_owned)
        } else {
            None
        };
        let apple_refresh = apple_refresh.or_else(|| {
            self.driver
                .load(self.backend.project())
                .ok()
                .flatten()
                .and_then(|encoded| serde_json::from_str::<Session>(&encoded).ok())
                .filter(|session| expected == Some(session.user_id.as_str()))
                .and_then(|session| session.apple_refresh_token)
        });
        let session = self.make_session(&reply.body, apple_refresh)?;
        if expected.is_some_and(|id| id != session.user_id) {
            return Err(failure("identity_account_changed"));
        }
        self.user(&session)?; // Verify Auth's user endpoint, never trust a decoded JWT alone.
        self.save(&session)
    }
    pub fn sign_in(&self, provider: Provider) -> DriverResult<IdentitySnapshot> {
        if self.session()?.is_some() {
            return Err(failure("identity_already_signed_in"));
        }
        self.oauth(provider, false, None)?;
        self.snapshot()
    }
    pub fn link(&self, provider: Provider) -> DriverResult<IdentitySnapshot> {
        let (session, user) = self.authenticated()?;
        if account(&user)?.providers.contains(&provider) {
            return self.snapshot();
        }
        self.oauth(provider, true, Some(&session.user_id))?;
        self.snapshot()
    }
    pub fn unlink(&self, provider: Provider) -> DriverResult<IdentitySnapshot> {
        let (session, user) = self.authenticated()?;
        let identities = user["identities"]
            .as_array()
            .ok_or_else(|| failure("identity_response_invalid"))?;
        if identities.len() <= 1 {
            return Err(failure("identity_last_provider"));
        }
        let identity = identities
            .iter()
            .find(|i| i["provider"].as_str() == Some(provider.name()))
            .ok_or_else(|| failure("identity_response_invalid"))?;
        let id = identity["identity_id"]
            .as_str()
            .filter(|id| valid_id(id))
            .ok_or_else(|| failure("identity_response_invalid"))?;
        let reply = self.backend.request(
            "DELETE",
            &format!("/auth/v1/user/identities/{id}"),
            Some(&session.access_token),
            None,
        )?;
        if !(200..300).contains(&reply.status) {
            return Err(failure("identity_unlink_failed"));
        }
        self.snapshot()
    }
    pub fn sign_out(&self) -> DriverResult<()> {
        self.supported()?;
        // Local sign-out must work offline and without parsing a damaged session.
        let previous = self
            .driver
            .load(self.backend.project())
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str::<Session>(&s).ok());
        self.driver.save(self.backend.project(), None)?;
        if let Some(session) = previous {
            let _ = self.backend.request(
                "POST",
                "/auth/v1/logout?scope=local",
                Some(&session.access_token),
                None,
            );
        }
        Ok(())
    }
    pub fn delete_account(&self, confirmed: bool) -> DriverResult<()> {
        if !confirmed {
            return Err(failure("identity_delete_confirmation_required"));
        }
        let (mut session, user) = self.authenticated()?;
        if account(&user)?.providers.contains(&Provider::Apple)
            && session.apple_refresh_token.is_none()
        {
            self.oauth(Provider::Apple, false, Some(&session.user_id))?;
            session = self.authenticated()?.0;
            if session.apple_refresh_token.is_none() {
                return Err(failure("apple_reauthorization_required"));
            }
        }
        let reply = self.backend.request("POST", "/functions/v1/delete-account", Some(&session.access_token), Some(json!({"confirmation":"DELETE_MY_ACCOUNT", "appleRefreshToken":session.apple_refresh_token})))?;
        if reply.status != 200 || reply.body["code"] != "account_deleted" {
            let code = reply.body["code"].as_str().unwrap_or_default();
            return Err(failure(match code {
                "apple_reauthorization_required" => code,
                "apple_revocation_unavailable" | "apple_revocation_failed" => {
                    "identity_apple_deletion_unavailable"
                }
                _ => "identity_delete_failed",
            }));
        }
        self.driver.save(self.backend.project(), None)
    }
}
