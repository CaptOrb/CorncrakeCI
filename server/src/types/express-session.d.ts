import "express-session";

declare module "express-session" {
	interface SessionData {
		userId?: number; // internal DB ID
		forgeType?: string; // e.g., "gitea" or "github"
		codeVerifier?: string; // PKCE code verifier for OAuth
	}
}
