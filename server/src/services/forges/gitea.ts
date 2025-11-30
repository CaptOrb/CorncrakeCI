import * as arctic from "arctic";
import type { ForgeInstanceConfig } from "../../config/schema";
import type { Forge } from "../../types/forge";
import type { ForgeUser } from "../../types/forgeuser";
import type { GiteaRepo } from "../../types/gitearepo";
import type { ForgeRepository } from "../../types/openapi";
export class GiteaForge implements Forge {
	private gitea: arctic.Gitea;
	private forgeId: number;
	private baseUrl: string;

	constructor(forgeId: number, config: ForgeInstanceConfig) {
		this.forgeId = forgeId;
		this.baseUrl = config.url;

		if (!config.clientid || !config.clientsecret) {
			throw new Error("Gitea OAuth2 credentials not configured");
		}

		this.gitea = new arctic.Gitea(
			config.url,
			config.clientid,
			config.clientsecret,
			config.redirecturi,
		);
	}

	getForgeId(): number {
		return this.forgeId;
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
		const res = await fetch(`${this.baseUrl}/api/v1/user`, {
			headers: { Authorization: `token ${accessToken}` },
		});
		if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`);
		const user = await res.json();
		return { id: user.id, login: user.login, avatar_url: user.avatar_url };
	}

	async listRepositories(accessToken: string): Promise<ForgeRepository[]> {
		const res = await fetch(`${this.baseUrl}/api/v1/user/repos`, {
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
	async getRepository(accessToken: string, repoId: string): Promise<GiteaRepo> {
		const res = await fetch(`${this.baseUrl}/api/v1/repos/${repoId}`, {
			headers: { Authorization: `token ${accessToken}` },
		});
		if (!res.ok) {
			if (res.status === 401) throw new Error("Unauthorised");
			if (res.status === 404) throw new Error("Repository not found");
			throw new Error(`Failed to fetch repository: ${res.status}`);
		}

		return await res.json();
	}

	async validateToken(accessToken: string) {
		try {
			await this.getUserInfo(accessToken);
			return true;
		} catch {
			return false;
		}
	}

	async createWebhook(
		accessToken: string,
		forgeRepoId: string,
		webhookUrl: string,
		webhookSecret: string,
	): Promise<{ id: string; url: string }> {
		const webhookEvents = [
			"push",
			"pull_request",
			"create", // as far as I can tell, this will work for Tag/ branch creation
			"release",
		];

		const [owner, repo] = forgeRepoId.split("/");
		const res = await fetch(
			`${this.baseUrl}/api/v1/repos/${owner}/${repo}/hooks`,
			{
				method: "POST",
				headers: {
					Authorization: `token ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					type: "gitea",
					config: {
						url: webhookUrl,
						webhookSecret: webhookSecret,
						content_type: "json",
					},
					events: webhookEvents,
					active: true,
				}),
			},
		);

		if (!res.ok) {
			const error = await res.text();
			throw new Error(`Failed to create webhook: ${res.status} - ${error}`);
		}

		const webhook = await res.json();
		return {
			id: webhook.id.toString(),
			url: webhook.config.url,
		};
	}
}
