import type { Application } from "express";
import type { Pool } from "pg";
import supertest from "supertest";
import type TestAgent from "supertest/lib/agent";
import { beforeEach, describe, expect, it } from "vitest";
import { transaction } from "../../../src/db/stores";
import { createApiServer } from "../../../src/server";
import { createTestUser, type TestUser } from "../../helpers/auth";
import { databaseHelper } from "../../helpers/database";
import { testForgeHelper } from "../../helpers/forge";

let pool: Pool;
let app: Application;
let request: TestAgent;

databaseHelper((newPool) => {
	pool = newPool;
});

const forge = testForgeHelper();

describe("checkPipelines endpoint", () => {
	let testUser: TestUser;

	beforeEach(async () => {
		app = await createApiServer({
			isProduction: false,
			pool,
		});

		request = supertest(app);
		testUser = await createTestUser(app);

		await transaction(async (txn) => {
			return txn.repositories.createOrUpdateRepository(
				1,
				"repo0001",
				testUser.user_id,
				"testuser/testrepo",
			);
		});
	});

	it("validates a valid pipeline configuration", async () => {
		const validConfig = `molci version=v0
        job "test" {
            step "echo hello"
        }`;

		forge.controller!.setRepoConfigs(
			"repo0001",
			new Map([[".molci/ci.kdl", validConfig]]),
		);

		const response = await request
			.post(`/v0/repo/1/pipelines/check`)
			.set("Cookie", `sessionID=${testUser.session_id}`)
			.send({});

		expect(response.status).toMatchInlineSnapshot(`200`);
	});

	it("returns errors for invalid pipeline configuration", async () => {
		const invalidConfig = `molci version=v0
        job {
            step "echo hello"
        }`;

		forge.controller!.setRepoConfigs(
			"repo0001",
			new Map([[".molci/ci.kdl", invalidConfig]]),
		);

		const response = await request
			.post(`/v0/repo/1/pipelines/check`)
			.set("Cookie", `sessionID=${testUser.session_id}`)
			.send({});

		expect(response.status).toBe(200);
		expect(response.body.pipelines).toMatchInlineSnapshot(`
			[
			  {
			    "content": "molci version=v0
			        job {
			            step "echo hello"
			        }",
			    "errors": [
			      {
			        "endColumn": 10,
			        "endLine": 4,
			        "message": "Schema validation failed: Invalid key: Expected "name" but received undefined",
			        "startColumn": 9,
			        "startLine": 2,
			      },
			    ],
			    "path": ".molci/ci.kdl",
			  },
			]
		`);
	});
});
