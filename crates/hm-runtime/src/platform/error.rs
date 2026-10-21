use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DriverErrorKind {
    Unsupported,
    PermissionDenied,
    Interrupted,
    InvalidState,
    Io,
}
/// Stable protocol fields. Human-facing translations belong to the client.
/// detail is diagnostic data, except the explicit legacy_error migration path.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverError {
    pub kind: DriverErrorKind,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}
impl DriverError {
    pub fn unsupported(capability: &str) -> Self {
        Self {
            kind: DriverErrorKind::Unsupported,
            code: "capability_unsupported".into(),
            resource: Some(capability.into()),
            detail: None,
        }
    }
    pub fn invalid_state(code: &str) -> Self {
        Self {
            kind: DriverErrorKind::InvalidState,
            code: code.into(),
            resource: None,
            detail: None,
        }
    }
    pub fn io(detail: impl ToString) -> Self {
        Self {
            kind: DriverErrorKind::Io,
            code: "io_failed".into(),
            resource: None,
            detail: Some(detail.to_string()),
        }
    }
}
impl fmt::Display for DriverError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code)?;
        if let Some(resource) = &self.resource {
            write!(f, " ({resource})")?;
        }
        Ok(())
    }
}
impl std::error::Error for DriverError {}
impl From<std::io::Error> for DriverError {
    fn from(error: std::io::Error) -> Self {
        let (kind, code) = match error.kind() {
            std::io::ErrorKind::PermissionDenied => {
                (DriverErrorKind::PermissionDenied, "permission_denied")
            }
            std::io::ErrorKind::Interrupted => {
                (DriverErrorKind::Interrupted, "operation_interrupted")
            }
            _ => (DriverErrorKind::Io, "io_failed"),
        };
        Self {
            kind,
            code: code.into(),
            resource: None,
            detail: Some(error.to_string()),
        }
    }
}
/// Temporary compatibility for older business commands; new drivers use codes.
impl From<String> for DriverError {
    fn from(detail: String) -> Self {
        Self {
            kind: DriverErrorKind::InvalidState,
            code: "legacy_error".into(),
            resource: None,
            detail: Some(detail),
        }
    }
}
impl From<&str> for DriverError {
    fn from(detail: &str) -> Self {
        detail.to_owned().into()
    }
}
pub type DriverResult<T> = Result<T, DriverError>;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unsupported_error_serializes_stable_fields_without_user_prose() {
        let error = DriverError::unsupported("audio_capture");
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "kind": "unsupported", "code": "capability_unsupported", "resource": "audio_capture"
            })
        );
    }
    #[test]
    fn permission_error_keeps_diagnostics_separate_from_code() {
        let error = DriverError::from(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "denied by provider",
        ));
        assert_eq!(error.code, "permission_denied");
        assert_eq!(error.to_string(), "permission_denied");
        assert_eq!(error.detail.as_deref(), Some("denied by provider"));
    }
}
