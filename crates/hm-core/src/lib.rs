mod backup;
mod example;
mod ledger;
mod materials;
pub mod models;
mod people;
mod records;
mod relations;
mod reminders;
mod schedule;
mod stages;
mod storage_location;
pub mod store;
pub use models::*;
pub use storage_location::StorageLocation;
pub use store::Store;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Validation(String),
    #[error("未找到对应案件或记录")]
    NotFound,
    #[error("本地数据库操作失败：{0}")]
    Database(#[from] rusqlite::Error),
    #[error("本地文件操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("本地数据格式无效：{0}")]
    Json(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, Error>;
