import type { t_ForgeRepository } from "../generated/server/models";
import type { ForgeUser } from "./forgeuser";

export interface Forge {
	getAuthorizationUrl(): { url: string; state: string; codeVerifier: string };

	exchangeCodeForToken(
		code: string,
		codeVerifier: string,
	): Promise<{
		accessToken: string;
		accessTokenExpiresAt?: Date;
	}>;

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
