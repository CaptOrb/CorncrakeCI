import type { t_ForgeRepository } from "../generated/server/models";
import type { ForgeUser } from "./forgeuser";
import type { GiteaRepo } from "./gitearepo";

export interface Forge {
	getAuthorizationUrl(): { url: string; state: string; codeVerifier: string };

	exchangeCodeForToken(
		code: string,
		codeVerifier: string,
	): Promise<{
		accessToken: string;
		accessTokenExpiresAt?: Date;
	}>;

	getUserInfo(accessToken: string): Promise<ForgeUser>;

	listRepositories(accessToken: string): Promise<t_ForgeRepository[]>;

	getRepository(repoId: string, accessToken: string): Promise<GiteaRepo>;

	validateToken(accessToken: string): Promise<boolean>;

	createWebhook(
		accessToken: string,
		forgeRepoId: string,
		webhookUrl: string,
		webhookSecret: string,
	): Promise<{ id: string; url: string }>;
}
