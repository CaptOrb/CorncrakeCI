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

	it("should get a repository", async () => {
		// Set up test user, repository, and session
		const testData = await createTestUser(app);

		// Make the request with the session cookie
		const response = await request
			.get(`/repo/1`)
			.set("Cookie", `sessionID=${testData.session_id}`)
			.expect(200);

		expect(response.body.repo).not.toBeNull();
	});
});
