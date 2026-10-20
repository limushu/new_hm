use hm_core::{ImportReport, MaterialTarget, Store};
use hm_runtime::platform::Document;

pub fn import_documents(
    store: &Store,
    target: &MaterialTarget,
    documents: Vec<Box<dyn Document>>,
) -> hm_core::Result<ImportReport> {
    if documents.len() > 500 {
        return Err(hm_core::Error::Validation("单次最多添加500个文件".into()));
    }
    let mut report = ImportReport {
        imported: 0,
        errors: vec![],
    };
    for mut document in documents {
        let name = document.name().to_owned();
        let result = document
            .open()
            .map_err(|e| e.to_string())
            .and_then(|mut reader| {
                store
                    .import_reader(target, &name, &mut reader)
                    .map_err(|e| e.to_string())
            });
        match result {
            Ok(_) => report.imported += 1,
            Err(error) => report.errors.push(format!("{name}：{error}")),
        }
        // Drop releases the provider stream and its access grant.
    }
    Ok(report)
}
