import type { t_ForgeRepository } from "../../generated/server/models";
import type { ForgeUser } from "./forgeuser";

export interface TokenInfo {
	accessToken: string;
	accessTokenExpiresAt: Date;
	refreshToken: string;
	refreshTokenExpiresAt: Date;
}

export interface Forge {
	getAuthorizationUrl(): { url: string; state: string; codeVerifier: string };

	exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenInfo>;

	refreshAccessToken(refreshToken: string): Promise<TokenInfo>;

	withUser(accessToken: string): ForgeWithUser;
}

export interface ForgeWithUser {
	getUserInfo(): Promise<ForgeUser>;

	listRepositories(): Promise<t_ForgeRepository[]>;

	getRepository(repoId: string): Promise<t_ForgeRepository>;

	validateToken(): Promise<boolean>;

	createWebhook(
		forgeRepoId: string,
		webhookUrl: string,
		webhookSecret: string,
	): Promise<{ id: string }>;
}
