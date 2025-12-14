// Generated types from TypeSpec API specification
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Error {
    pub error: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgeRepository {
    pub forge_repo_id: String,
    pub full_name: String,
    pub forge: ForgeSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgeSummary {
    pub id: i32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryConfig {
    pub repo: ForgeRepository,
    pub configured_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryConfigInput {
    pub settings: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigureRepoRequest {
    pub forge: i32,
    pub forge_repo_id: String,
    pub settings: serde_json::Value,
}