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
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverError {
    pub kind: DriverErrorKind,
    pub message: String,
}
impl DriverError {
    pub fn unsupported(capability: &str) -> Self {
        Self {
            kind: DriverErrorKind::Unsupported,
            message: format!("当前驱动尚不支持{capability}"),
        }
    }
    pub fn invalid_state(message: &str) -> Self {
        Self {
            kind: DriverErrorKind::InvalidState,
            message: message.into(),
        }
    }
}
impl fmt::Display for DriverError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.message.fmt(f)
    }
}
impl std::error::Error for DriverError {}
impl From<std::io::Error> for DriverError {
    fn from(error: std::io::Error) -> Self {
        let kind = match error.kind() {
            std::io::ErrorKind::PermissionDenied => DriverErrorKind::PermissionDenied,
            std::io::ErrorKind::Interrupted => DriverErrorKind::Interrupted,
            _ => DriverErrorKind::Io,
        };
        Self {
            kind,
            message: error.to_string(),
        }
    }
}
pub type DriverResult<T> = Result<T, DriverError>;
