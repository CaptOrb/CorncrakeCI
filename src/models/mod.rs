use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Forge {
    pub forge_id: i32,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub user_id: i32,
    pub forge_id: i32,
    pub forge_user_id: String,
    pub access_token: String,
    pub token_expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Repository {
    pub repo_id: i32,
    pub forge_id: i32,
    pub forge_repo_id: String,
    pub owner_id: i32,
    pub repo_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub webhook_secret: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewUser {
    pub forge_id: i32,
    pub forge_user_id: String,
    pub access_token: String,
    pub token_expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewRepository {
    pub forge_id: i32,
    pub forge_repo_id: String,
    pub owner_id: i32,
    pub repo_name: String,
    pub webhook_secret: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Error {
    pub error: String,
    pub details: Option<serde_json::Value>,
}