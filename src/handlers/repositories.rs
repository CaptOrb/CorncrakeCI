use axum::{
    extract::{Path, State},
    response::Json,
};
use crate::{
    generated::{ForgeRepository, ForgeSummary, RepositoryConfig},
    middleware::AppError,
    AppState,
};

pub async fn list_available(
    State(_state): State<AppState>,
) -> Result<Json<Vec<ForgeRepository>>, AppError> {
    // TODO: Get user from session and fetch repositories from forge
    // For now, return empty list
    Ok(Json(vec![]))
}

pub async fn list_configured(
    State(_state): State<AppState>,
) -> Result<Json<Vec<RepositoryConfig>>, AppError> {
    // TODO: Get user from session
    // For now, return empty list
    Ok(Json(vec![]))
}

pub async fn configure_repo(
    State(_state): State<AppState>,
    Json(_payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    // TODO: Validate payload and create repository configuration
    // For now, return mock response
    Ok(Json(serde_json::json!({
        "repo_id": 1
    })))
}

pub async fn get_repo(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
) -> Result<Json<RepositoryConfig>, AppError> {
    // TODO: Get repository from database
    // For now, return mock data
    let mock_repo = RepositoryConfig {
        repo: ForgeRepository {
            forge_repo_id: "123".to_string(),
            full_name: "test/repo".to_string(),
            forge: ForgeSummary {
                id: 1,
                name: "Gitea".to_string(),
            },
        },
        configured_at: Some(chrono::Utc::now()),
    };

    Ok(Json(mock_repo))
}

pub async fn reconfigure_repo(
    State(_state): State<AppState>,
    Path(_id): Path<i32>,
    Json(_payload): Json<serde_json::Value>,
) -> Result<Json<RepositoryConfig>, AppError> {
    // TODO: Update repository configuration
    // For now, return mock data
    let mock_repo = RepositoryConfig {
        repo: ForgeRepository {
            forge_repo_id: "123".to_string(),
            full_name: "test/repo".to_string(),
            forge: ForgeSummary {
                id: 1,
                name: "Gitea".to_string(),
            },
        },
        configured_at: Some(chrono::Utc::now()),
    };

    Ok(Json(mock_repo))
}