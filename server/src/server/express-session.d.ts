import "express-session";
import type { ForgeId } from "../db/schema/public/Forges";
import type { UserId } from "../db/schema/public/Users";

declare module "express-session" {
	/**
	 * Stored during OAuth flow before login completes.
	 * Cleared once authentication succeeds.
	 */
	interface IncompleteLogin {
		forgeId: ForgeId;
		codeVerifier: string;
	}

	interface SessionData {
		userId?: UserId; // internal DB ID
		incompleteLogin?: IncompleteLogin;
	}
}
