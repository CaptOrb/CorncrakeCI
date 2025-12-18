import "express-session";

declare module "express-session" {
	/**
	 * Stored during OAuth flow before login completes.
	 * Cleared once authentication succeeds.
	 */
	interface IncompleteLogin {
		forgeId: number;
		codeVerifier: string;
	}

	interface SessionData {
		userId?: number; // internal DB ID
		incompleteLogin?: IncompleteLogin;
	}
}
