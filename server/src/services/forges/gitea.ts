import * as arctic from "arctic";
import { config } from "../../config/env";
import type { Forge } from "../../types/forge";
import type { ForgeUser } from "../../types/forgeuser";
import type { GiteaRepo } from "../../types/gitearepo";
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
	): Promise<{ accessToken: string; accessTokenExpiresAt?: Date }> {
		try {
			const tokens = await this.gitea.validateAuthorizationCode(
				code,
				codeVerifier,
			);

			return {
				accessToken: tokens.accessToken(),
				accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
			};
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
		if (!res.ok) {
			if (res.status === 401) throw new Error("Unauthorised");
			throw new Error(`Failed to fetch repos: ${res.status}`);
		}

		const repos: GiteaRepo[] = await res.json();

		return repos.map((repo) => ({
			id: repo.id,
			name: repo.name,
			full_name: repo.full_name,
			private: repo.private,
			url: repo.html_url,
			description: repo.description,
			owner: {
				id: repo.owner.id,
				login: repo.owner.login,
				avatar_url: repo.owner.avatar_url,
			},
		}));
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
