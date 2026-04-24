import type { ForgeId } from "../../db/schema/public/Forges";
import type { t_ForgeRepository } from "../../generated/server/models";
import type { ForgeUser } from "./forgeuser";

export enum AccessLevel {
	Read = "read",
	Write = "write",
	Admin = "admin",
}

export interface TokenInfo {
	accessToken: string;
	accessTokenExpiresAt: Date;
	refreshToken: string;
	refreshTokenExpiresAt: Date;
}

export interface Forge {
	readonly name: string;
	readonly logoUrl: string | undefined;
	/**
	 * Effective base URL of CORNCRAKECI that should be presented to the Forge, for Forge-to-CORNCRAKECI
	 * requests (currently just webhooks).
	 *
	 * Differs from the normal public base URL when the Forge is running in Docker
	 * but CORNCRAKECI is running outside; in that case `http://host.docker.internal:<port>`
	 * would be used.
	 *
	 * NOTE: This does NOT apply to links to the CORNCRAKECI web UI that are intended to be shown
	 * to browser users rather than the Forge's internal requests!
	 */
	readonly corncrakeciBaseUrl: string;

	getAuthorizationUrl(): { url: string; state: string; codeVerifier: string };

	exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenInfo>;

	refreshAccessToken(refreshToken: string): Promise<TokenInfo>;

	withUser(accessToken: string): ForgeWithUser;
}

export interface ForgeWithUser {
	getForgeId(): ForgeId;

	getUserInfo(): Promise<ForgeUser>;

	listRepositories(): Promise<t_ForgeRepository[]>;

	getRepository(repoId: string): Promise<t_ForgeRepository>;

	/**
	 * Verify the authenticated user has at least the given access level on a repository
	 * @throws {AuthError} if the user lacks the required access level
	 */
	checkAccess(forgeRepoId: string, level: AccessLevel): Promise<void>;

	validateToken(): Promise<boolean>;

	createWebhook(
		forgeRepoId: string,
		webhookUrl: string,
		webhookSecret: string,
	): Promise<{ id: string }>;

	listWebhooks(
		forgeRepoId: string,
	): Promise<Array<{ id: string; url: string | undefined }>>;

	deleteWebhook(forgeRepoId: string, webhookId: string): Promise<void>;

	getCorncrakeciConfig(
		forgeRepoId: string,
		ref: string,
	): Promise<{ path: string; configFiles: Map<string, string> }>;

	listBranches(forgeRepoId: string): Promise<string[]>;

	createCommitStatus(
		forgeRepoId: string,
		sha: string,
		state: "success" | "failure" | "error" | "pending",
		description: string,
		context?: string,
		targetUrl?: string,
	): Promise<void>;
}
