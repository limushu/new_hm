use super::{failure, BackendReply, IdentityBackend};
use hm_runtime::platform::DriverResult;
use serde::Deserialize;
use serde_json::Value;
use std::{io::Read, time::Duration};
use url::Url;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIdentityConfig {
    pub project_ref: String,
    #[serde(rename = "url")]
    pub api_url: String,
    pub public_key: String,
}
impl PublicIdentityConfig {
    pub fn validate(&self) -> DriverResult<()> {
        let url =
            Url::parse(&self.api_url).map_err(|_| failure("identity_configuration_invalid"))?;
        if self.project_ref.len() != 20
            || !self
                .project_ref
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
            || url.scheme() != "https"
            || url.host_str() != Some(format!("{}.supabase.co", self.project_ref).as_str())
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
            || url.port().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
            || !self.public_key.starts_with("sb_publishable_")
        {
            return Err(failure("identity_configuration_invalid"));
        }
        Ok(())
    }
}
pub struct HostedIdentity {
    config: PublicIdentityConfig,
}
impl HostedIdentity {
    pub fn new(config: PublicIdentityConfig) -> DriverResult<Self> {
        config.validate()?;
        Ok(Self { config })
    }
}
impl IdentityBackend for HostedIdentity {
    fn project(&self) -> &str {
        &self.config.project_ref
    }
    fn origin(&self) -> &str {
        self.config.api_url.trim_end_matches('/')
    }
    fn request(
        &self,
        method: &str,
        path: &str,
        access: Option<&str>,
        body: Option<Value>,
    ) -> DriverResult<BackendReply> {
        let catalog_path = path
            .split('?')
            .next()
            .is_some_and(|p| ["/rest/v1/cloud_bindings", "/rest/v1/workspaces"].contains(&p));
        if !(path.starts_with("/auth/v1/")
            || path == "/functions/v1/delete-account"
            || catalog_path)
            || path.contains("..")
            || path.contains('#')
        {
            return Err(failure("identity_configuration_invalid"));
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .https_only(true)
            .build()
            .map_err(|_| failure("identity_service_unavailable"))?;
        let mut request = client
            .request(
                reqwest::Method::from_bytes(method.as_bytes())
                    .map_err(|_| failure("identity_configuration_invalid"))?,
                format!("{}{path}", self.origin()),
            )
            .header("apikey", &self.config.public_key);
        if let Some(access) = access {
            request = request.bearer_auth(access);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        // Never return transport errors or raw error bodies; they may contain URLs or credentials.
        let response = request
            .send()
            .map_err(|_| failure("identity_service_unavailable"))?;
        let status = response.status().as_u16();
        let mut bytes = Vec::new();
        response
            .take(262145)
            .read_to_end(&mut bytes)
            .map_err(|_| failure("identity_service_unavailable"))?;
        if bytes.len() > 262144 {
            return Err(failure("identity_response_invalid"));
        }
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).map_err(|_| failure("identity_response_invalid"))?
        };
        Ok(BackendReply { status, body })
    }
}
