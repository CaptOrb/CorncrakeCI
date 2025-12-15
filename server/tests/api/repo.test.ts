import type { Pool } from "pg";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { _setPool } from "../../src/config/db";
import { createWebServer } from "../../src/server";
import { createTestUser } from "../helpers/auth";
import { setupDb } from "../helpers/database";
import { testForgeHelper } from "../helpers/forge";

describe("Repository API tests", () => {
	let pool: Pool;
	let app: Awaited<ReturnType<typeof createWebServer>>;
	let request: ReturnType<typeof supertest>;

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

	it("getRepo returns 200 with repository for authenticated user", async () => {
		// Set up test user, repository, and session
		const testData = await createTestUser(app);

		const payload = {
			forge: 1,
			forge_repo_id: "repo0001",
			settings: { branch: "main" },
		};

		const createResponse = await request
			.post("/repo")
			.set("Content-Type", "application/json")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send(payload)
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
		const payload = {
			forge: 1,
			forge_repo_id: "repo0001",
			settings: { branch: "main" },
		};

		const createResponse = await request
			.post("/repo")
			.set("Content-Type", "application/json")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send(payload)
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

		// configure a repo for this user
		const payload = {
			forge: 1,
			forge_repo_id: "repo0001",
			settings: { branch: "main" },
		};

		const createResponse = await request
			.post("/repo")
			.set("Content-Type", "application/json")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send(payload)
			.expect(200);

		expect(createResponse.body).toHaveProperty("repo_id");
		expect(createResponse.body.repo_id).toBeTypeOf("number");

		const repoId = createResponse.body.repo_id;

		// In development, the webhook_secret is set by the graphile-worker job.
		// For tests, set it directly so the repo appears in listConfiguredRepos.
		await pool.query(
			`UPDATE repositories SET webhook_secret = 'test-secret' WHERE repo_id = $1`,
			[repoId],
		);

		const fetchResponse = await request
			.get(`/repos/configured`)
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(200);

		expect(fetchResponse.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					repo: expect.objectContaining({
						forge_repo_id: "repo0001",
					}),
				}),
			]),
		);
	});
});
