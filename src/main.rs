use axum::{
    response::Json,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tower_sessions::{MemoryStore, SessionManagerLayer};

use crate::{config::Config, db::DbPool, middleware::AppError};

mod config;
mod db;
mod generated;
mod handlers;
mod middleware;
mod models;
mod services;

#[derive(Clone)]
pub struct AppState {
    pub db_pool: DbPool,
    pub config: Config,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("molci_rust=debug,tower_http=debug")
        .init();

    // Load configuration
    let config = config::Config::from_env()?;
    tracing::info!("Configuration loaded successfully");

    // Create database connection pool
    let db_pool = db::create_database_pool(&config.database_url).await?;
    tracing::info!("Database connection pool created");

    // Run migrations
    db::run_migrations(&db_pool).await?;
    tracing::info!("Database migrations completed");

    // Create session store
    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store).with_secure(true);

    // Get server address before moving config
    let addr = config.server_address().parse::<SocketAddr>()?;

    // Create app state
    let state = AppState { db_pool, config };

    // Build the application
    let app = Router::new()
        .route("/health", get(health_check))
        .nest("/auth", auth_routes())
        .nest("/repos", repository_routes())
        .nest("/webhooks", webhook_routes())
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
                .layer(session_layer),
        )
        .with_state(state);
    tracing::info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now()
    })))
}

fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/providers", get(handlers::auth::list_providers))
        .route("/login/:forge_id", get(handlers::auth::login))
        .route("/callback", get(handlers::auth::callback))
        .route("/logout", post(handlers::auth::logout))
}

fn repository_routes() -> Router<AppState> {
    Router::new()
        .route("/available", get(handlers::repositories::list_available))
        .route("/configured", get(handlers::repositories::list_configured))
        .route("/repo", post(handlers::repositories::configure_repo))
        .route("/repo/:id", get(handlers::repositories::get_repo))
        .route("/repo/:id", axum::routing::put(handlers::repositories::reconfigure_repo))
}

fn webhook_routes() -> Router<AppState> {
    Router::new()
        .route("/gitea/:repo_id", post(handlers::webhooks::gitea_webhook))
}
