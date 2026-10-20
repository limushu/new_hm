use hm_runtime::platform::DriverError;

/// Compatibility is confined here until core validation has stable codes.
pub fn core_error(error: hm_core::Error) -> DriverError {
    match error {
        hm_core::Error::Io(error) => error.into(),
        hm_core::Error::NotFound => DriverError::invalid_state("resource_not_found"),
        hm_core::Error::Validation(detail) => detail.into(),
        hm_core::Error::Database(_) => DriverError::invalid_state("storage_unavailable"),
        hm_core::Error::Json(_) => DriverError::invalid_state("data_invalid"),
    }
}
