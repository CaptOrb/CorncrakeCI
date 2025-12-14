use axum::{
    extract::{Path, State},
    http::HeaderMap,
    response::Json,
};
use crate::{middleware::AppError, AppState};

pub async fn gitea_webhook(
    State(_state): State<AppState>,
    Path(repo_id): Path<i32>,
    headers: HeaderMap,
    body: String,
) -> Result<Json<serde_json::Value>, AppError> {
    // TODO: Validate webhook signature
    // TODO: Process webhook event
    // TODO: Trigger CI job

    tracing::info!("Received webhook for repo_id: {}", repo_id);
    tracing::debug!("Webhook headers: {:?}", headers);
    tracing::debug!("Webhook body: {}", body);

    Ok(Json(serde_json::json!({
        "status": "received",
        "repo_id": repo_id
    })))
}