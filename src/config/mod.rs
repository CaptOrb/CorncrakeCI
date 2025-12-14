use anyhow::Result;
use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub database_url: String,
    pub server_host: String,
    pub server_port: u16,
    pub session_secret: String,
    pub gitea_base_url: String,
    pub gitea_client_id: String,
    pub gitea_client_secret: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let config = Config {
            database_url: env::var("DATABASE_URL")?,
            server_host: env::var("SERVER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()?,
            session_secret: env::var("SESSION_SECRET")?,
            gitea_base_url: env::var("GITEA_BASE_URL")?,
            gitea_client_id: env::var("GITEA_CLIENT_ID")?,
            gitea_client_secret: env::var("GITEA_CLIENT_SECRET")?,
        };

        Ok(config)
    }

    pub fn server_address(&self) -> String {
        format!("{}:{}", self.server_host, self.server_port)
    }
}