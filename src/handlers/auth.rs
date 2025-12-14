use axum::{
    extract::{Path, Query, State},
    response::{Json, Redirect},
};
use serde::Deserialize;
use tower_sessions::Session;
use crate::{middleware::AppError, models::Forge, services::oauth::OAuthClient, AppState};

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: String,
    pub state: String,
}

pub async fn list_providers(
    State(state): State<AppState>,
) -> Result<Json<Vec<Forge>>, AppError> {
    let forges = sqlx::query_as!(
        Forge,
        "SELECT forge_id, display_name FROM forges ORDER BY forge_id"
    )
    .fetch_all(&state.db_pool)
    .await?;

    Ok(Json(forges))
}

pub async fn login(
    State(state): State<AppState>,
    Path(forge_id): Path<i32>,
    session: Session,
) -> Result<Redirect, AppError> {
    // Get forge configuration
    let forge = sqlx::query_as!(
        Forge,
        "SELECT forge_id, display_name FROM forges WHERE forge_id = $1",
        forge_id
    )
    .fetch_optional(&state.db_pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Forge not found".to_string()))?;

    // Create OAuth client for Gitea (for now)
    let oauth_client = OAuthClient::new(
        state.config.gitea_client_id.clone(),
        state.config.gitea_client_secret.clone(),
        format!("{}/login/oauth/authorize", state.config.gitea_base_url),
        format!("{}/login/oauth/access_token", state.config.gitea_base_url),
        format!("{}/auth/callback", state.config.server_address()),
    );

    let (auth_url, oauth_state) = oauth_client.get_auth_url(forge_id)
        .map_err(|e| AppError::OAuth(format!("Failed to create auth URL: {}", e)))?;

    // Store OAuth state in session
    session.insert("oauth_state", &oauth_state).await
        .map_err(|e| AppError::Internal(format!("Session error: {}", e)))?;

    Ok(Redirect::temporary(&auth_url))
}

pub async fn callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
    session: Session,
) -> Result<Redirect, AppError> {
    // Get OAuth state from session
    let oauth_state: crate::services::oauth::OAuthState = session.get("oauth_state")
        .await
        .map_err(|e| AppError::Internal(format!("Session error: {}", e)))?
        .ok_or_else(|| AppError::Auth("No OAuth state found".to_string()))?;

    // Verify state parameter
    if query.state != oauth_state.state {
        return Err(AppError::Auth("Invalid state parameter".to_string()));
    }

    // Create OAuth client
    let oauth_client = OAuthClient::new(
        state.config.gitea_client_id.clone(),
        state.config.gitea_client_secret.clone(),
        format!("{}/login/oauth/authorize", state.config.gitea_base_url),
        format!("{}/login/oauth/access_token", state.config.gitea_base_url),
        format!("{}/auth/callback", state.config.server_address()),
    );

    // Exchange code for token
    let token_data = oauth_client.exchange_code(query.code, query.state, &oauth_state).await
        .map_err(|e| AppError::OAuth(format!("Failed to exchange code: {}", e)))?;

    let access_token = token_data.get("access_token")
        .ok_or_else(|| AppError::OAuth("No access token received".to_string()))?;

    // TODO: Get user info from Gitea and create/update user record
    // For now, just clear session and redirect
    session.remove::<crate::services::oauth::OAuthState>("oauth_state").await
        .map_err(|e| AppError::Internal(format!("Session error: {}", e)))?;

    Ok(Redirect::temporary("/"))
}

pub async fn logout(
    session: Session,
) -> Result<Json<serde_json::Value>, AppError> {
    session.flush().await
        .map_err(|e| AppError::Internal(format!("Session error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "message": "Logged out successfully"
    })))
}