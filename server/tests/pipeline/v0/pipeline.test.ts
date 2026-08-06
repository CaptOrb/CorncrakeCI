import type { Application } from "express";
import type { Pool } from "pg";
import supertest from "supertest";
import type TestAgent from "supertest/lib/agent";
import { beforeEach, describe, expect, it } from "vitest";
import type { ForgeId } from "../../../src/db/schema/public/Forges";
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
				1 as ForgeId,
				"repo0001",
				testUser.user_id,
				"testuser/testrepo",
			);
		});
	});

	it("validates a valid pipeline configuration", async () => {
		const validConfig = `corncrake version=v0
        job "test" {
            step "echo hello"
        }`;

		forge.controller!.setRepoConfigs(
			"repo0001",
			new Map([[".corncrake/ci.kdl", validConfig]]),
		);

		const response = await request
			.post(`/v0/repo/1/pipelines/check`)
			.set("Cookie", `sessionID=${testUser.session_id}`)
			.send({});

		expect(response.status).toMatchInlineSnapshot(`200`);
	});

	it("returns errors for invalid pipeline configuration", async () => {
		const invalidConfig = `corncrake version=v0
        job {
            step "echo hello"
        }`;

		const controller = forge.controller;
		expect(controller).toBeDefined();
		if (!controller) throw new Error("forge controller not set up");
		controller.setRepoConfigs(
			"repo0001",
			new Map([[".corncrake/ci.kdl", invalidConfig]]),
		);

		const response = await request
			.post(`/v0/repo/1/pipelines/check`)
			.set("Cookie", `sessionID=${testUser.session_id}`)
			.send({});

		expect(response.status).toBe(200);
		expect(response.body.pipelines).toMatchInlineSnapshot(`
			[
			  {
			    "content": "corncrake version=v0
			        job {
			            step "echo hello"
			        }",
			    "errors": [
			      {
			        "endColumn": 10,
			        "endLine": 4,
			        "message": "Invalid key: Expected "name" but received undefined",
			        "startColumn": 9,
			        "startLine": 2,
			      },
			    ],
			    "path": ".corncrake/ci.kdl",
			  },
			]
		`);
	});
});
