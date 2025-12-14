# MolCI Rust Implementation

A Rust rewrite of the MolCI (Continuous Integration management system) using Axum as the web server framework.

## Overview

MolCI is a CI management system that acts as an intermediary between Git forges (like Gitea, GitHub, GitLab) and CI workflows. This Rust implementation maintains full API compatibility with the original TypeScript version while providing better performance and type safety.

## Features

- **OAuth2 Authentication**: Secure authentication via Git forges using PKCE flow
- **Repository Management**: List, configure, and manage repositories for CI
- **Webhook Handling**: Receive and process webhook events from Git forges
- **Database Integration**: PostgreSQL with SQLx for type-safe database operations
- **Session Management**: In-memory session storage for user authentication
- **API Specification**: TypeSpec-based API definition with generated Rust types

## Architecture

### Core Components

- **Axum Server**: High-performance async web server
- **SQLx**: Compile-time checked database queries
- **OAuth2**: Secure authentication with PKCE
- **Tower Sessions**: Session management
- **TypeSpec**: API specification and code generation

### Project Structure

```
src/
├── main.rs              # Application entry point
├── config/              # Configuration management
├── db/                  # Database connection and migrations
├── models/               # Data models (Forge, User, Repository)
├── handlers/             # HTTP request handlers
│   ├── auth.rs          # Authentication endpoints
│   ├── repositories.rs   # Repository management
│   └── webhooks.rs     # Webhook handling
├── services/            # Business logic
│   ├── oauth.rs         # OAuth client implementation
│   └── forge_service.rs # Forge abstraction
├── middleware/          # Error handling and middleware
└── generated/           # TypeSpec generated types
```

## API Endpoints

### Authentication
- `GET /auth/providers` - List available forge providers
- `GET /auth/login/{forge_id}` - Initiate OAuth flow
- `GET /auth/callback` - OAuth callback handler
- `POST /auth/logout` - Logout endpoint

### Repository Management
- `GET /repos/available` - List user's repositories from forge
- `GET /repos/configured` - List configured repositories
- `POST /repo` - Configure new repository
- `GET /repo/{id}` - Get repository configuration
- `PUT /repo/{id}` - Update repository configuration

### Webhooks
- `POST /webhooks/gitea/{repo_id}` - Gitea webhook endpoint

### Health Check
- `GET /health` - Application health status

## Database Schema

The application uses the same PostgreSQL schema as the original TypeScript version:

- **forges**: Git forge configurations
- **users**: User authentication data
- **repositories**: Repository configurations and webhook secrets

## Configuration

Environment variables:

```bash
DATABASE_URL=postgresql://molci:password@localhost/molci
SERVER_HOST=127.0.0.1
SERVER_PORT=3000
SESSION_SECRET=your-secret-key-here-change-in-production
GITEA_BASE_URL=http://localhost:3000
GITEA_CLIENT_ID=your-gitea-client-id
GITEA_CLIENT_SECRET=your-gitea-client-secret
```

## Development

### Prerequisites

- Rust 1.70+
- PostgreSQL 12+
- Node.js (for TypeSpec compilation)

### Setup

1. Clone the repository
2. Copy `.env.sample` to `.env` and configure
3. Start PostgreSQL database
4. Run migrations: `sqlx migrate run --database-url $DATABASE_URL`
5. Start the server: `cargo run`

### Building

```bash
cargo build --release
```

### Testing

```bash
cargo test
```

## TypeSpec Integration

The API is defined using TypeSpec in `api.tsp`. To regenerate types:

```bash
tsp compile api.tsp --emit @typespec/openapi3 --options @typespec/openapi3.output-file=openapi.json --output-dir generated/api
```

## Security Features

- **PKCE OAuth2**: Secure OAuth2 flow with proof key for code exchange
- **Session Security**: Secure session cookies with HttpOnly and Secure flags
- **Webhook Validation**: HMAC signature validation for incoming webhooks
- **Input Validation**: Type-safe request/response validation

## Performance Benefits

- **Async/Await**: Non-blocking I/O throughout the application
- **Connection Pooling**: Efficient database connection management
- **Zero-Copy Deserialization**: Efficient JSON parsing with serde
- **Compile-Time Safety**: SQLx provides compile-time query validation

## Future Enhancements

- [ ] Complete Gitea API integration
- [ ] Add GitHub and GitLab support
- [ ] Implement background job processing
- [ ] Add comprehensive logging and metrics
- [ ] Redis session store for production
- [ ] OpenAPI documentation generation

## License

This project maintains the same license as the original MolCI implementation.

## Contributing

Contributions are welcome! Please ensure all tests pass and maintain API compatibility with the original TypeScript version.