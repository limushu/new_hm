use hm_core::{MaterialTarget, Store};
use hm_runtime::platform::{Document, DriverError, DriverResult};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportIssue {
    pub name: String,
    pub error: DriverError,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: u32,
    pub errors: Vec<ImportIssue>,
}
pub fn import_documents(
    store: &Store,
    target: &MaterialTarget,
    documents: Vec<Box<dyn Document>>,
) -> DriverResult<ImportReport> {
    if documents.len() > 500 {
        return Err(DriverError::invalid_state("import_limit_exceeded"));
    }
    let mut report = ImportReport {
        imported: 0,
        errors: vec![],
    };
    for mut document in documents {
        let name = document.name().to_owned();
        let result = document.open().and_then(|mut reader| {
            store
                .import_reader(target, &name, &mut reader)
                .map_err(crate::errors::core_error)
        });
        match result {
            Ok(_) => report.imported += 1,
            Err(error) => report.errors.push(ImportIssue { name, error }),
        }
    }
    Ok(report)
}
