import * as arctic from "arctic";
import { config } from "../config/env";
import type { User } from "../types/user";

export class OAuthService {
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

	getAuthorizationUrl(): { url: string; state: string; codeVerifier: string } {
		const state = arctic.generateState();
		const codeVerifier = arctic.generateCodeVerifier();
		const scopes = ["read:user"];
		const url = this.gitea.createAuthorizationURL(state, codeVerifier, scopes);

		return {
			url: url.toString(),
			state,
			codeVerifier,
		};
	}

	/**
	 * Exchange authorization code for access token
	 */
	// https://arcticjs.dev/guides/oauth2-pkce
	// https://arcticjs.dev/providers/gitea
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

	async getUserInfo(accessToken: string): Promise<User> {
		try {
			const response = await fetch(`${config.GITEA_URL}/api/v1/user`, {
				headers: {
					Authorization: `token ${accessToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch user info: ${response.status}`);
			}

			const user = await response.json();
			return {
				id: user.id,
				login: user.login,
				avatar_url: user.avatar_url,
			};
		} catch (error) {
			console.error("Failed to get user info:", error);
			throw new Error("Failed to get user information");
		}
	}

	async validateToken(accessToken: string): Promise<boolean> {
		try {
			await this.getUserInfo(accessToken);
			return true;
		} catch {
			return false;
		}
	}
}
