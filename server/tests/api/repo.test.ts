import type { Application } from "express";
import { runOnce } from "graphile-worker";
import type { Pool } from "pg";
import supertest from "supertest";
import type TestAgent from "supertest/lib/agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _setPool } from "../../src/config/db";
import { setup_webhooks } from "../../src/jobs/setup-webhooks";
import { createWebServer } from "../../src/server";
import { createTestUser } from "../helpers/auth";
import { setupDb } from "../helpers/database";
import { testForgeHelper } from "../helpers/forge";

describe("Repository API tests", () => {
	let pool: Pool;
	let app: Application;
	let request: TestAgent;

	testForgeHelper();

	beforeAll(async () => {
		const setupDbResult = await setupDb();
		pool = setupDbResult.pool;
		_setPool(pool);

		app = await createWebServer({
			isProduction: false,
			pool,
		});

		request = supertest(app);
	});

	afterAll(async () => {
		// Clean up database connection
		if (pool) {
			await pool.end();
		}
	});

	it("configureRepo returns 200 and creates new repository successfully", async () => {
		const testData = await createTestUser(app);

		const response = await request
			.post("/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
				settings: { branch: "main" },
			})
			.expect(200);

		expect(response.body).toHaveProperty("repo_id");
	});

	it("configureRepo returns 401 without authentication", async () => {
		await request
			.post("/repo")
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
				settings: { branch: "main" },
			})
			.expect(401);
	});

	it("getRepo returns 200 with repository for authenticated user", async () => {
		// Set up test user, repository, and session
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
				settings: { branch: "main" },
			})
			.expect(200);

		expect(createResponse.body).toHaveProperty("repo_id");
		expect(createResponse.body.repo_id).toBeTypeOf("number");

		const repoId = createResponse.body.repo_id;

		const fetchResponse = await request
			.get(`/repo/${repoId}`)
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(200);

		expect(fetchResponse.body.repo).toMatchObject({
			forge_repo_id: "repo0001",
			forge: {
				id: 1,
			},
		});

		expect(fetchResponse.body).toHaveProperty("configured_at");
	});

	it("getRepo returns 401 if not authenticated", async () => {
		// Set up test user, repository, and session
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
				settings: { branch: "main" },
			})
			.expect(200);

		const repoId = createResponse.body.repo_id;

		// no session ID cookie
		const fetchResponse = await request.get(`/repo/${repoId}`).expect(401);

		expect(fetchResponse.body).toEqual({ error: "Not authenticated" });

		// invalid session ID
		await request
			.get(`/repo/${repoId}`)
			.set("Cookie", `sessionID="invalidSessionID"`)

			.expect(401);
	});

	it("getRepo returns 401 if not authenticated and repo doesn't exist", async () => {
		// Set up test user, repository, and session
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
				settings: { branch: "main" },
			})
			.expect(200);

		const repoId = createResponse.body.repo_id;

		// no session ID cookie
		const fetchResponse = await request.get(`/repo/${repoId}`).expect(401);

		expect(fetchResponse.body).toEqual({ error: "Not authenticated" });

		// invalid session ID and invalid repo id
		await request
			.get(`/repo/999`)
			.set("Cookie", `sessionID="invalidSessionID"`)

			.expect(401);
	});

	it("getRepo returns 404 for non-existent repo ID", async () => {
		const testData = await createTestUser(app);

		await request
			.get("/repo/999999")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(404);
	});

	it("listAvailableRepos returns 200 with repos for authenticated user", async () => {
		const testUser = await createTestUser(app);

		const response = await request
			.get("/repos/available")
			.set("Cookie", `sessionID=${testUser.session_id}`)
			.expect(200);

		expect(response.body).toEqual([
			{
				forge: { id: 1, name: "TestForge" },
				forge_repo_id: "repo0001",
				full_name: "testuser/testrepo",
			},
		]);
	});

	it("listAvailableRepos returns 401 if not authenticated", async () => {
		await request
			.get("/repos/available")
			.expect(401)
			.then((res) => {
				expect(res.body).toEqual({ error: "Not authenticated" });
			});
	});

	it("listConfiguredRepos returns 200 with repos for authenticated user", async () => {
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
				settings: { branch: "main" },
			})
			.expect(200);

		expect(createResponse.body).toHaveProperty("repo_id");
		expect(createResponse.body.repo_id).toBeTypeOf("number");

		await runOnce(
			{
				pgPool: pool,
			},
			{ setup_webhooks },
		);

		const fetchResponse = await request
			.get(`/repos/configured`)
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(200);

		expect(fetchResponse.body).toEqual([
			{
				configured_at: expect.any(String),
				repo: {
					forge_repo_id: "repo0001",
					full_name: "testuser/testrepo",
					forge: {
						id: 1,
						name: "gitea",
					},
				},
			},
		]);
	});

	it("listConfiguredRepos returns 401 if not authenticated", async () => {
		await request
			.get("/repos/configured")
			.expect(401)
			.then((res) => {
				expect(res.body).toEqual({ error: "Not authenticated" });
			});
	});
});
