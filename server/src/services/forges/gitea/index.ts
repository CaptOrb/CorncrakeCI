import type { Res, StatusCode } from "@nahkies/typescript-fetch-runtime/main";
import * as arctic from "arctic";
import { config as appConfig } from "../../../config";
import type { ForgeInstanceConfig } from "../../../config/schema";
import type { ForgeId } from "../../../db/schema/public/Forges";
import { ApiClient } from "../../../generated/gitea/client";
import type {
	t_ContentsResponse,
	t_Hook,
} from "../../../generated/gitea/models";
import type { t_ForgeRepository } from "../../../generated/server/models";
import { unwrap } from "../../../util/typing";
import { AuthError, NotFoundError } from "./../errors";
import {
	AccessLevel,
	type Forge,
	type ForgeWithUser,
	type TokenInfo,
} from "./../forge";
import type { ForgeUser } from "./../forgeuser";

class HttpError extends Error {
	constructor(
		public url: string,
		public status: number,
		message: string,
	) {
		if (message.length > 100) {
			message = `${message.slice(0, 100)}...`;
		}
		super(`(${url}) [${status}] ${message}`);
	}
}

async function messagifyError<S extends StatusCode>(
	res: Res<S, unknown>,
): Promise<string> {
	let text: string;
	try {
		// We can't double-read the body so must read text first
		text = await res.text();
	} catch (e) {
		return `(can't read body: ${e})`;
	}
	if (res.headers.get("content-type") === "application/json") {
		try {
			const json = JSON.parse(text);
			// TODO unwrap message and return if we can first
			return JSON.stringify(json, undefined, 2);
		} catch (_) {
			// nop
		}
	}

	return text;
}

async function raiseErr<S extends StatusCode>(
	res: Res<S, unknown>,
): Promise<never> {
	throw new HttpError(res.url, res.status, await messagifyError(res));
}

async function successJson<R extends Res<StatusCode, unknown>>(
	res: R,
): Promise<
	// This type-level witchcraft narrows the return type to
	// only those that are the body types on a Res with one of these
	// status codes
	R extends Res<infer S, infer T>
		? S extends 200 | 201 | 202 | 203 | 204 | 205 | 206
			? T
			: never
		: never
> {
	if (!(200 <= res.status && res.status <= 299)) {
		return await raiseErr(res);
	}
	// biome-ignore lint/suspicious/noExplicitAny: hard to avoid any here
	return (await res.json()) as any;
}

export class GiteaForge implements Forge {
	private gitea: arctic.Gitea;
	private baseUrl: string;
	private publicUrl: string; // For OAuth authorisation URL (browser-accessible) in docker demo
	public name: string;
	public readonly logoUrl: string | undefined;
	public readonly corncrakeciBaseUrl: string;

	constructor(
		private forgeId: ForgeId,
		private config: ForgeInstanceConfig,
	) {
		// Use internalUrl for API calls (server-to-server), fallback to url
		this.baseUrl = config.internalurl;
		this.publicUrl = config.url;
		this.name = config.name;
		this.logoUrl = config.logourl ?? `${this.baseUrl}/assets/img/logo.svg`;
		// If this forge has a custom CORNCRAKECI base URL set, use that, otherwise use the normal CORNCRAKECI base URL.
		this.corncrakeciBaseUrl =
			config.appbaseurloverride ?? appConfig.app.baseurl;

		if (!config.clientid || !config.clientsecret) {
			throw new Error("Gitea OAuth2 credentials not configured");
		}

		// Use internal url for token exchange/refresh (server-to-server)
		const tokenUrl = this.baseUrl;
		this.gitea = new arctic.Gitea(
			tokenUrl,
			config.clientid,
			config.clientsecret,
			config.redirecturi,
		);
	}

	getForgeId(): ForgeId {
		return this.forgeId;
	}

	getAuthorizationUrl() {
		const state = arctic.generateState();
		const codeVerifier = arctic.generateCodeVerifier();
		const scopes = ["read:user", "repo", "write:repository"];
		const url = this.gitea.createAuthorizationURL(state, codeVerifier, scopes);

		// If public URL differs from internal URL, replace the base URL
		let authUrl = url.toString();
		if (this.publicUrl !== this.baseUrl) {
			const internalBase = new URL(this.baseUrl).origin;
			const publicBase = new URL(this.publicUrl).origin;
			authUrl = authUrl.replace(internalBase, publicBase);
		}

		return { url: authUrl, state, codeVerifier };
	}
	/**
	 * Gitea doesn't provide refresh token expiry, so calculate it from config.
	 */
	private calculateRefreshTokenExpiry(): Date {
		return new Date(Date.now() + this.config.refreshtokenlifetime * 1000);
	}

	async exchangeCodeForToken(
		code: string,
		codeVerifier: string,
	): Promise<TokenInfo> {
		try {
			const tokens = await this.gitea.validateAuthorizationCode(
				code,
				codeVerifier,
			);

			return {
				accessToken: tokens.accessToken(),
				accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
				refreshToken: tokens.refreshToken(),
				refreshTokenExpiresAt: this.calculateRefreshTokenExpiry(),
			};
		} catch (error) {
			console.error("Failed to exchange code for token:", error);
			throw new AuthError("Failed to exchange authorisation code for token");
		}
	}

	async refreshAccessToken(refreshToken: string): Promise<TokenInfo> {
		try {
			// https://arcticjs.dev/providers/gitea
			const tokens = await this.gitea.refreshAccessToken(refreshToken);
			return {
				accessToken: tokens.accessToken(),
				accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
				refreshToken: tokens.refreshToken(),
				refreshTokenExpiresAt: this.calculateRefreshTokenExpiry(),
			};
		} catch (error) {
			console.error("Failed to refresh access token:", error);
			throw new AuthError("Failed to refresh access token");
		}
	}

	withUser(accessToken: string): ForgeWithUser {
		const client = new ApiClient({
			basePath: `${this.baseUrl}/api/v1`,
			defaultHeaders: {
				Authorization: `token ${accessToken}`,
			},
		});
		return new GiteaForgeWithUser(this.forgeId, this.config, client);
	}
}

export class GiteaForgeWithUser implements ForgeWithUser {
	constructor(
		private forgeId: ForgeId,
		private config: ForgeInstanceConfig,
		private client: ApiClient,
	) {}

	getForgeId(): ForgeId {
		return this.forgeId;
	}

	async getUserInfo(): Promise<ForgeUser> {
		const res = await this.client.userGetCurrent();
		const user = await successJson(res);
		return {
			id: unwrap(user.id),
			login: unwrap(user.login),
			avatar_url: unwrap(user.avatar_url),
		};
	}

	private async getRepoQueryParts(
		forgeRepoId: string,
	): Promise<{ owner: string; repo: string }> {
		const res = await this.client.repoGetById({ id: Number(forgeRepoId) });
		if (res.status === 404) {
			throw new NotFoundError(
				`Repository ${forgeRepoId} does not exist on the forge.`,
			);
		}
		const repo = await successJson(res);
		return {
			owner: unwrap(repo.owner?.login),
			repo: unwrap(repo.name),
		};
	}

	async listRepositories(): Promise<t_ForgeRepository[]> {
		const res = await this.client.userCurrentListRepos();

		const repos = await successJson(res);

		return repos.map((repo) => {
			const result: t_ForgeRepository = {
				forge_repo_id: String(repo.id),
				full_name: unwrap(repo.full_name),
				html_url: unwrap(repo.html_url),
				forge: {
					id: this.forgeId,
					name: this.config.name,
				},
			};
			return result;
		});
	}

	async getRepository(repoId: string): Promise<t_ForgeRepository> {
		const res = await this.client.repoGetById({ id: Number(repoId) });
		if (res.status === 404) {
			throw new NotFoundError(
				`Repository ${repoId} does not exist on the forge.`,
			);
		}
		const repo = await successJson(res);

		return {
			forge: {
				id: this.forgeId,
				name: this.config.name,
			},
			forge_repo_id: String(repo.id),
			full_name: unwrap(repo.full_name),
			html_url: unwrap(repo.html_url),
		};
	}

	async checkAccess(forgeRepoId: string, level: AccessLevel): Promise<void> {
		const res = await this.client.repoGetById({ id: Number(forgeRepoId) });
		if (res.status === 404) {
			throw new NotFoundError(
				`Repository ${forgeRepoId} does not exist on the forge.`,
			);
		}
		const repo = await successJson(res);
		const permissions = repo.permissions;

		let hasAccess: boolean;
		switch (level) {
			case AccessLevel.Read:
				hasAccess = permissions?.pull === true;
				break;
			case AccessLevel.Write:
				hasAccess = permissions?.push === true;
				break;
			case AccessLevel.Admin:
				hasAccess = permissions?.admin === true;
				break;
			default:
				throw new Error(`Unhandled access level: ${level}`);
		}

		if (!hasAccess) {
			throw new NotFoundError();
		}
	}

	async validateToken(): Promise<boolean> {
		try {
			await this.getUserInfo();
			return true;
		} catch {
			return false;
		}
	}

	async listBranches(forgeRepoId: string): Promise<string[]> {
		const repoQueryParts = await this.getRepoQueryParts(forgeRepoId);
		const res = await this.client.repoListBranches({
			...repoQueryParts,
			limit: 0,
		});
		const branches = await successJson(res);
		return branches.map((b) => unwrap(b.name));
	}

	async createWebhook(
		forgeRepoId: string,
		webhookUrl: string,
		webhookSecret: string,
	): Promise<{ id: string }> {
		const webhookEvents = [
			"push",
			"pull_request",
			"create", // as far as I can tell, this will work for Tag/ branch creation
			"release",
		];

		const repoQueryParts = await this.getRepoQueryParts(forgeRepoId);

		const res = await this.client.repoCreateHook({
			...repoQueryParts,
			requestBody: {
				type: "gitea",
				config: {
					url: webhookUrl,
					secret: webhookSecret,
					content_type: "json",
				},
				events: webhookEvents,
				active: true,
			},
		});

		const webhook = await successJson(res);
		return {
			id: String(webhook.id),
		};
	}

	async listWebhooks(
		forgeRepoId: string,
	): Promise<Array<{ id: string; url: string | undefined }>> {
		const repoQueryParts = await this.getRepoQueryParts(forgeRepoId);

		const res = await this.client.repoListHooks(repoQueryParts);

		const webhooks = await successJson(res);
		return webhooks.map((webhook: t_Hook) => ({
			id: String(webhook.id),
			// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signature access but makes biome unhappy
			url: webhook.config?.["url"],
		}));
	}

	async deleteWebhook(forgeRepoId: string, webhookId: string): Promise<void> {
		const repoQueryParts = await this.getRepoQueryParts(forgeRepoId);

		const res = await this.client.repoDeleteHook({
			...repoQueryParts,
			id: Number(webhookId),
		});

		if (!(200 <= res.status && res.status <= 299)) {
			await raiseErr(res);
		}
	}

	async getCorncrakeciConfig(
		forgeRepoId: string,
		ref: string,
	): Promise<{ path: string; configFiles: Map<string, string> }> {
		const repoQueryParts = await this.getRepoQueryParts(forgeRepoId);

		const corncrakeciContentsRes = await this.client.repoGetContents({
			...repoQueryParts,
			filepath: ".corncrake",
			ref,
		});

		if (corncrakeciContentsRes.status === 404) {
			//return empty configs
			return {
				path: "",
				configFiles: new Map<string, string>(),
			};
		}

		const corncrakeciContents = (await successJson(
			corncrakeciContentsRes,
		)) as t_ContentsResponse[];

		const configFiles = new Map<string, string>();
		for (const item of corncrakeciContents) {
			if (item.name!.endsWith(".kdl") && item.type! === "file") {
				try {
					const fileRes = await this.client.repoGetRawFile({
						...repoQueryParts,
						filepath: `.corncrake/${item.name}`,
						ref,
					});

					if (fileRes.status === 200) {
						const fileContent = await fileRes.text();
						if (fileContent) {
							configFiles.set(item.name!, fileContent);
						}
					} else {
						console.warn(
							`Failed to fetch KDL file ${item.name}:`,
							fileRes.status,
						);
					}
				} catch (error) {
					console.warn(`Failed to fetch KDL file ${item.name}:`, error);
				}
			}
		}

		return {
			path: ".corncrake",
			configFiles,
		};
	}

	async createCommitStatus(
		forgeRepoId: string,
		sha: string,
		state: "success" | "failure" | "error" | "pending",
		description: string,
		context = "corncrake/pipeline-validation",
		targetUrl?: string,
	): Promise<void> {
		const repoQueryParts = await this.getRepoQueryParts(forgeRepoId);

		const res = await this.client.repoCreateStatus({
			...repoQueryParts,
			sha,
			requestBody: {
				state,
				description,
				context,
				target_url: targetUrl,
			},
		});

		await successJson(res);
	}
}
