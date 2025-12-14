use async_trait::async_trait;
use crate::models::{ForgeRepository, ForgeSummary};

#[async_trait]
pub trait ForgeService: Send + Sync {
    async fn get_user_repositories(&self, access_token: &str) -> Result<Vec<ForgeRepository>, Box<dyn std::error::Error>>;
    async fn setup_webhook(&self, repo_id: &str, webhook_url: &str, secret: &str, access_token: &str) -> Result<(), Box<dyn std::error::Error>>;
    fn forge_summary(&self) -> ForgeSummary;
}

pub struct GiteaService {
    base_url: String,
    client_id: String,
    client_secret: String,
}

impl GiteaService {
    pub fn new(base_url: String, client_id: String, client_secret: String) -> Self {
        Self {
            base_url,
            client_id,
            client_secret,
        }
    }
}

#[async_trait]
impl ForgeService for GiteaService {
    async fn get_user_repositories(&self, _access_token: &str) -> Result<Vec<ForgeRepository>, Box<dyn std::error::Error>> {
        todo!("Implement get_user_repositories for Gitea")
    }

    async fn setup_webhook(&self, _repo_id: &str, _webhook_url: &str, _secret: &str, _access_token: &str) -> Result<(), Box<dyn std::error::Error>> {
        todo!("Implement setup_webhook for Gitea")
    }

    fn forge_summary(&self) -> ForgeSummary {
        ForgeSummary {
            id: 1, // This should come from database
            name: "Gitea".to_string(),
        }
    }
}