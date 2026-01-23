import type { Application } from "express";
import { runOnce } from "graphile-worker";
import type { Pool } from "pg";
import supertest from "supertest";
import type TestAgent from "supertest/lib/agent";
import { beforeEach, describe, expect, it } from "vitest";
import { transaction } from "../../src/db/stores";
import { setup_webhooks } from "../../src/jobs/setup-webhooks";
import { createApiServer } from "../../src/server";
import { _forgeMap } from "../../src/services/forges";
import { createTestUser } from "../helpers/auth";
import { databaseHelper } from "../helpers/database";
import { type TestForge, testForgeHelper } from "../helpers/forge";

describe("Repository API tests", () => {
	let pool: Pool;
	let app: Application;
	let request: TestAgent;

	databaseHelper((newPool) => {
		pool = newPool;
	});

	testForgeHelper();

	beforeEach(async () => {
		app = await createApiServer({
			isProduction: false,
			pool,
		});

		request = supertest(app);
	});

	it("configureRepo returns 200 and creates new repository successfully", async () => {
		const testData = await createTestUser(app);

		const response = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(200);

		expect(response.body).toHaveProperty("repo_id");
	});

	it("configureRepo returns 401 without authentication", async () => {
		await request
			.post("/v0/repo")
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(401);
	});

	it("configureRepo with missing forge_repo_id returns 400", async () => {
		const res = await request.post("/v0/repo").send({ forge: 1 }); // missing forge_repo_id
		expect(res.status).toBe(400);
		expect(res.body).toHaveProperty(
			"error",
			"Invalid request (Request validation failed parsing request body)",
		);
		expect(res.body).toHaveProperty("details", {
			issues: [
				{
					code: "invalid_type",
					expected: "string",
					message: "Invalid input: expected string, received undefined",
					path: ["forge_repo_id"],
				},
			],
		});
	});

	it("reconfigureRepo updates repo data when forge repo changes", async () => {
		const testData = await createTestUser(app);

		// First, configure the repo
		const initConfiguredRepo = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(200);

		const repoId = initConfiguredRepo.body.repo_id;

		const testForge = _forgeMap.get(1) as TestForge;
		const repo = testForge.controller.repositories.get("repo0001");

		// Reconfigure the repo
		repo!.name = "testuser/updated-repo"; // changed repo name

		await request
			.put(`/v0/repo/${repoId}`)
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(200);

		// Verify that the DB was updated
		const updatedRepo = await transaction(async (txn) =>
			txn.repositories.getRepositoryById(repoId, testData.user_id),
		);
		expect(updatedRepo!.repo_name).toBe("testuser/updated-repo");
	});

	it("getRepo returns 200 with repository for authenticated user", async () => {
		// Set up test user, repository, and session
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(200);

		expect(createResponse.body).toHaveProperty("repo_id");
		expect(createResponse.body.repo_id).toBeTypeOf("number");

		const repoId = createResponse.body.repo_id;

		const fetchResponse = await request
			.get(`/v0/repo/${repoId}`)
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
			.post("/v0/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(200);

		const repoId = createResponse.body.repo_id;

		// no session ID cookie
		const fetchResponse = await request.get(`/v0/repo/${repoId}`).expect(401);

		expect(fetchResponse.body).toEqual({ error: "Not authenticated" });

		// invalid session ID
		await request
			.get(`/v0/repo/${repoId}`)
			.set("Cookie", `sessionID="invalidSessionID"`)

			.expect(401);
	});

	it("getRepo returns 401 if not authenticated and repo doesn't exist", async () => {
		// Set up test user, repository, and session
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(200);

		const repoId = createResponse.body.repo_id;

		// no session ID cookie
		const fetchResponse = await request.get(`/v0/repo/${repoId}`).expect(401);

		expect(fetchResponse.body).toEqual({ error: "Not authenticated" });

		// invalid session ID and invalid repo id
		await request
			.get(`/v0/repo/999`)
			.set("Cookie", `sessionID="invalidSessionID"`)

			.expect(401);
	});

	it("getRepo returns 404 for non-existent repo ID", async () => {
		const testData = await createTestUser(app);

		await request
			.get("/v0/repo/999999")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(404);
	});

	it("listAvailableRepos returns 200 with repos for authenticated user", async () => {
		const testUser = await createTestUser(app);

		const response = await request
			.get("/v0/repos/available")
			.set("Cookie", `sessionID=${testUser.session_id}`)
			.expect(200);

		expect(response.body).toEqual([
			{
				forge: { id: 1, name: "TestForge" },
				forge_repo_id: "repo0001",
				full_name: "testuser/testrepo",
				html_url: "https://example.com/testuser/testrepo",
			},
		]);
	});

	it("listAvailableRepos returns 401 if not authenticated", async () => {
		await request
			.get("/v0/repos/available")
			.expect(401)
			.then((res) => {
				expect(res.body).toEqual({ error: "Not authenticated" });
			});
	});

	it("listConfiguredRepos returns 200 with repos for authenticated user", async () => {
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
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
			.get(`/v0/repos/configured`)
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(200);

		expect(fetchResponse.body).toEqual([
			{
				configured_at: expect.any(String),
				repo: {
					repo_id: 1,
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
			.get("/v0/repos/configured")
			.expect(401)
			.then((res) => {
				expect(res.body).toEqual({ error: "Not authenticated" });
			});
	});

	it("getRepo returns 404 when trying to access another user's repo", async () => {
		const userA = await createTestUser(app);

		const createResponse = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${userA.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(200);

		const repoId = createResponse.body.repo_id;

		// Create second user
		const userB = await createTestUser(app, { authCode: "testCode2" });

		// User B tries to access user A's repo
		const fetchResponse = await request
			.get(`/v0/repo/${repoId}`)
			.set("Cookie", `sessionID=${userB.session_id}`)
			.expect(404);

		expect(fetchResponse.body).toEqual({ error: "Repository not found" });
	});

	it("reconfigureRepo returns 404 when trying to reconfigure another user's repo", async () => {
		const userA = await createTestUser(app);

		const createResponse = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${userA.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001",
			})
			.expect(200);

		const repoId = createResponse.body.repo_id;

		// Create second user
		const userB = await createTestUser(app, { authCode: "testCode2" });

		// User B tries to reconfigure user A's repo
		const reconfigureResponse = await request
			.put(`/v0/repo/${repoId}`)
			.set("Cookie", `sessionID=${userB.session_id}`)
			.expect(404);

		expect(reconfigureResponse.body).toEqual({
			error: "Repository not found",
		});
	});

	// maybe should return 404 instead of 400 to be consistent with the other tests?
	it("configureRepo returns 400 when trying to configure a repo you don't own on the forge", async () => {
		const userB = await createTestUser(app, { authCode: "testCode2" });

		// User B tries to configure repo0001, which is owned by testuser on the forge
		const response = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${userB.session_id}`)
			.send({
				forge: 1,
				forge_repo_id: "repo0001", // owned by testuser (user id 1), not otheruser
			})
			.expect(400);

		expect(response.body).toHaveProperty("error");
	});
});
