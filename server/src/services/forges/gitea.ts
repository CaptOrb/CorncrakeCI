import * as arctic from "arctic";
import { config } from "../../config/env";
import type { Forge } from "../../types/forge";
import type { ForgeUser } from "../../types/forgeuser";
import type { Repository } from "../../types/openapi";

export class GiteaForge implements Forge {
	private gitea: arctic.Gitea;

	constructor() {
		if (!config.GITEA_CLIENT_ID || !config.GITEA_CLIENT_SECRET) {
			throw new Error("Gitea OAuth2 credentials not configured");
		}

		this.gitea = new arctic.Gitea(
			config.GITEA_URL,
			config.GITEA_CLIENT_ID,
			config.GITEA_CLIENT_SECRET,
			config.GITEA_REDIRECT_URI,
		);
	}

	getAuthorizationUrl() {
		const state = arctic.generateState();
		const codeVerifier = arctic.generateCodeVerifier();
		const scopes = ["read:user", "repo"];
		const url = this.gitea.createAuthorizationURL(state, codeVerifier, scopes);

		return { url: url.toString(), state, codeVerifier };
	}

	async exchangeCodeForToken(
		code: string,
		codeVerifier: string,
	): Promise<{ accessToken: string }> {
		try {
			const tokens = await this.gitea.validateAuthorizationCode(
				code,
				codeVerifier,
			);
			return { accessToken: tokens.accessToken() };
		} catch (error) {
			console.error("Failed to exchange code for token:", error);
			throw new Error("Failed to exchange authorisation code for token");
		}
	}

	async getUserInfo(accessToken: string): Promise<ForgeUser> {
		const res = await fetch(`${config.GITEA_URL}/api/v1/user`, {
			headers: { Authorization: `token ${accessToken}` },
		});
		if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`);
		const user = await res.json();
		return { id: user.id, login: user.login, avatar_url: user.avatar_url };
	}

	async listRepositories(accessToken: string): Promise<Repository[]> {
		const res = await fetch(`${config.GITEA_URL}/api/v1/user/repos`, {
			headers: { Authorization: `token ${accessToken}` },
		});
		if (!res.ok) throw new Error(`Failed to fetch repos: ${res.status}`);
		return res.json();
	}

	async validateToken(accessToken: string) {
		try {
			await this.getUserInfo(accessToken);
			return true;
		} catch {
			return false;
		}
	}
}
