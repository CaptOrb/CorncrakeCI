use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("Authentication error: {0}")]
    Auth(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Bad request: {0}")]
    BadRequest(String),
    
    #[error("Internal server error: {0}")]
    Internal(String),
    
    #[error("OAuth error: {0}")]
    OAuth(String),
    
    #[error("HTTP client error: {0}")]
    HttpClient(#[from] reqwest::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Database(err) => {
                tracing::error!("Database error: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::Auth(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::OAuth(msg) => {
                tracing::error!("OAuth error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Authentication failed".to_string())
            }
            AppError::HttpClient(err) => {
                tracing::error!("HTTP client error: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "External service error".to_string())
            }
            AppError::Serialization(err) => {
                tracing::error!("Serialization error: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Data processing error".to_string())
            }
        };

        let body = Json(json!({
            "error": error_message,
            "details": null
        }));

        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;