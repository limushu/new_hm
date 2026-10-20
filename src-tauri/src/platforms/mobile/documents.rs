use hm_runtime::platform::{Document, DocumentDriver, DriverError, DriverResult};
use std::io::Read;

pub struct UnavailableDocuments;
impl DocumentDriver for UnavailableDocuments {
    fn pick(&self, _: bool) -> DriverResult<Option<Vec<Box<dyn Document>>>> {
        Err(DriverError::unsupported("文档选择"))
    }
    fn export(&self, _: &str, _: &mut dyn Read) -> DriverResult<Option<u64>> {
        Err(DriverError::unsupported("文档导出"))
    }
}
