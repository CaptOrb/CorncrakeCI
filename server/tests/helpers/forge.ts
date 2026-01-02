import { afterEach, beforeEach } from "vitest";
import { transaction } from "../../src/db/stores";
import type { t_ForgeRepository } from "../../src/generated/server/models";
import { _forgeMap } from "../../src/services/forges";
import { NotFoundError } from "../../src/services/forges/errors";
import type {
	Forge,
	ForgeWithUser,
	TokenInfo,
} from "../../src/services/forges/forge";
import type { ForgeUser } from "../../src/services/forges/forgeuser";

/**
 * Sets up a fresh test forge with ID 1 and registers it, for every test.
 * Also inserts the forge into the database.
 *
 * Cleans up the database after the tests.
 */
export function testForgeHelper(): { controller?: TestForgeController } {
	const forgeId = 1;
	const out: { controller?: TestForgeController } = {};

	beforeEach(async () => {
		const controller = new TestForgeController();
		out.controller = controller;
		_forgeMap.set(forgeId, new TestForge(controller, forgeId));

		try {
			await transaction(async (txn) => {
				await txn.client.query(
					`INSERT INTO forges (forge_id, display_name)
					VALUES ($1, $2)`,
					[forgeId, "gitea"],
				);
			});
		} catch {
			// nop
		}
	});

	afterEach(async () => {
		delete out.controller;
		_forgeMap.delete(forgeId);
	});

	return out;
}

export class TestForge implements Forge {
	public name: string = "TestForge";

	constructor(
		private _controller: TestForgeController,
		public forgeId: number,
	) {}

	// Expose controller publicly for tests
	get controller(): TestForgeController {
		return this._controller;
	}

	getAuthorizationUrl(): { url: string; state: string; codeVerifier: string } {
		return {
			url: "http://example.org/auth",
			state: "STATE",
			codeVerifier: "VERIFIER",
		};
	}

	async exchangeCodeForToken(
		code: string,
		codeVerifier: string,
	): Promise<TokenInfo> {
		if (code === "testCode" && codeVerifier === "VERIFIER") {
			return {
				accessToken: "testAccessToken",
				accessTokenExpiresAt: new Date("2100-01-01T01:01:01"),
				refreshToken: "testRefreshToken",
				refreshTokenExpiresAt: new Date("2100-01-01T01:01:01"),
			};
		}

		if (code === "testCode2" && codeVerifier === "VERIFIER") {
			return {
				accessToken: "testAccessToken2",
				accessTokenExpiresAt: new Date("2100-01-01T01:01:01"),
				refreshToken: "testRefreshToken2",
				refreshTokenExpiresAt: new Date("2100-01-01T01:01:01"),
			};
		}

		throw new Error("invalid auth");
	}

	async refreshAccessToken(): Promise<TokenInfo> {
		return {
			accessToken: "refreshedAccessToken",
			accessTokenExpiresAt: new Date("2100-01-01T01:01:01"),
			refreshToken: "newRefreshToken",
			refreshTokenExpiresAt: new Date("2100-01-01T01:01:01"),
		};
	}

	withUser(accessToken: string): ForgeWithUser {
		function getUser(): ForgeUser | null {
			if (accessToken === "testAccessToken") {
				return {
					id: 1,
					login: "testuser",
				};
			}
			if (accessToken === "testAccessToken2") {
				return {
					id: 2,
					login: "otheruser",
				};
			}
			return null;
		}

		return new TestForgeWithUser(this.forgeId, this.controller, getUser());
	}
}

class TestForgeWithUser implements ForgeWithUser {
	constructor(
		private forgeId: number,
		private controller: TestForgeController,
		private user: ForgeUser | null,
	) {}

	async getUserInfo(): Promise<ForgeUser> {
		if (!this.user) throw new Error("invalid access token");
		return this.user;
	}

	async listRepositories(): Promise<t_ForgeRepository[]> {
		if (!this.user) throw new Error("invalid access token");

		const out: t_ForgeRepository[] = [];

		for (const [repoId, repo] of this.controller.repositories.entries()) {
			if (repo.owner !== this.user.id) continue;
			out.push({
				forge: {
					id: this.forgeId,
					name: "TestForge",
				},
				forge_repo_id: repoId,
				full_name: repo.name,
			});
		}

		return out;
	}

	async getRepository(repoId: string): Promise<t_ForgeRepository> {
		if (!this.user) throw new Error("invalid access token");

		const repo = this.controller.repositories.get(repoId);

		if (!repo) throw new NotFoundError("Repository not found");

		if (repo.owner !== this.user.id)
			throw new NotFoundError("Repository not owned by this user");

		return {
			forge: {
				id: this.forgeId,
				name: "TestForge",
			},
			forge_repo_id: repoId,
			full_name: repo.name,
		};
	}

	async validateToken(): Promise<boolean> {
		try {
			await this.getUserInfo();
			return true;
		} catch (_) {
			return false;
		}
	}

	async createWebhook(
		_forgeRepoId: string,
		_webhookUrl: string,
		_webhookSecret: string,
	): Promise<{ id: string }> {
		if (!this.user) throw new Error("invalid access token");

		return {
			id: "some-webhook-id",
		};
	}

	// TODO: Implement this, it gets upset if it's not implemented
	async getMolciConfig(
		_forgeRepoId: string,
		_ref: string,
	): Promise<{ path: string; configFiles: Map<string, string> }> {
		return { path: "", configFiles: new Map<string, string>() };
	}
}

export class TestForgeController {
	public repositories: Map<string, TestRepo> = new Map([
		[
			"repo0001",
			{
				name: "testuser/testrepo",
				owner: 1,
			},
		],
		[
			"repo0002",
			{
				name: "otheruser/otherrepo",
				owner: 2,
			},
		],
	]);
}

interface TestRepo {
	name: string;
	owner: number;
}
