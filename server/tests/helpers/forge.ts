import { afterEach, beforeEach } from "vitest";
import { t_ForgeRepository } from "../../src/generated/server/models";
import { _forgeMap } from "../../src/services/forges";
import { Forge } from "../../src/types/forge";
import { ForgeUser } from "../../src/types/forgeuser";

/**
 * Sets up a fresh test forge with ID 1 and registers it, for every test.
 *
 * Cleans up the database after the tests.
 */
export function testForgeHelper(): { controller?: TestForgeController } {
	const forgeId = 1;
	let out: { controller?: TestForgeController } = {};

	beforeEach(async () => {
		const controller = new TestForgeController();
		out.controller = controller;
		_forgeMap.set(forgeId, new TestForge(controller, forgeId));
	});

	afterEach(async () => {
		delete out.controller;
		_forgeMap.delete(forgeId);
	});

	return out;
}

export class TestForge implements Forge {
	constructor(
		private controller: TestForgeController,
		public forgeId: number,
	) {}

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
	): Promise<{ accessToken: string; accessTokenExpiresAt?: Date }> {
		if (code === "testCode" && codeVerifier === "VERIFIER") {
			return {
				accessToken: "testAccessToken",
				accessTokenExpiresAt: new Date("2100-01-01T01:01:01"),
			};
		}

		throw new Error("invalid auth");
	}

	async getUserInfo(accessToken: string): Promise<ForgeUser> {
		if (accessToken === "testAccessToken") {
			return {
				id: 1,
				login: "testuser",
			};
		}

		throw new Error("invalid access token");
	}

	async listRepositories(accessToken: string): Promise<t_ForgeRepository[]> {
		const userId = (await this.getUserInfo(accessToken)).id;

		const out: t_ForgeRepository[] = [];

		for (let [repoId, repo] of this.controller.repositories.entries()) {
			if (repo.owner !== userId) continue;
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

	async getRepository(
		repoId: string,
		accessToken: string,
	): Promise<t_ForgeRepository> {
		const userId = (await this.getUserInfo(accessToken)).id;

		const repo = this.controller.repositories.get(repoId);

		if (!repo) throw new Error("Repository not found");

		if (repo.owner !== userId)
			throw new Error("Repository not owned by this user");

		return {
			forge: {
				id: this.forgeId,
				name: "TestForge",
			},
			forge_repo_id: repoId,
			full_name: repo.name,
		};
	}

	async validateToken(accessToken: string): Promise<boolean> {
		try {
			await this.getUserInfo(accessToken);
			return true;
		} catch (_) {
			return false;
		}
	}

	async createWebhook(
		_accessToken: string,
		_forgeRepoId: string,
		_webhookUrl: string,
		_webhookSecret: string,
	): Promise<{ id: string }> {
		return {
			id: "some-webhook-id",
		};
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
