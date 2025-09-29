import "express-session";

declare module "express-session" {
	interface SessionData {
		userId?: number; // internal DB ID
		forgeId?: number; // numeric forge ID
		codeVerifier?: string; // PKCE code verifier for OAuth
	}
}
