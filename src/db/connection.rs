use anyhow::Result;
use sqlx::{migrate::MigrateDatabase, PgPool, Postgres};
use std::time::Duration;

pub type DbPool = PgPool;

pub async fn create_database_pool(database_url: &str) -> Result<DbPool> {
    // Create database if it doesn't exist
    if !Postgres::database_exists(database_url).await? {
        Postgres::create_database(database_url).await?;
    }

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .min_connections(5)
        .acquire_timeout(Duration::from_secs(30))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .connect(database_url)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &DbPool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}