import type { Repository } from "../types/openapi";
import type { ForgeUser } from "./forgeuser";

export interface Forge {
	getAuthorizationUrl(): { url: string; state: string; codeVerifier: string };

	exchangeCodeForToken(
		code: string,
		codeVerifier: string,
	): Promise<{ accessToken: string }>;

	getUserInfo(accessToken: string): Promise<ForgeUser>;

	listRepositories(accessToken: string): Promise<Repository[]>;

	validateToken(accessToken: string): Promise<boolean>;
}
