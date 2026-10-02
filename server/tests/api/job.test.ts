import type { Application } from "express";
import type { Pool } from "pg";
import supertest from "supertest";
import type TestAgent from "supertest/lib/agent";
import { beforeEach, describe, expect, it } from "vitest";
import type { ForgeId } from "../../src/db/schema/public/Forges";
import JobRunStatus from "../../src/db/schema/public/JobRunStatus";
import JobRunStepStatus from "../../src/db/schema/public/JobRunStepStatus";
import { transaction } from "../../src/db/stores";
import { createApiServer } from "../../src/server";
import { createTestUser, type TestUser } from "../helpers/auth";
import { databaseHelper } from "../helpers/database";
import { insertPipelineRunFixture } from "../helpers/fixtures";
import { testForgeHelper } from "../helpers/forge";

let pool: Pool;
let app: Application;
let request: TestAgent;

databaseHelper((newPool) => {
	pool = newPool;
});

testForgeHelper();

describe("getJob", () => {
	let testUser: TestUser;

	beforeEach(async () => {
		app = await createApiServer({
			isProduction: false,
			pool,
		});

		request = supertest(app);
		testUser = await createTestUser(app);
	});

	it("reports a failed step as failed and exposes its exit code", async () => {
		const repoId = await transaction(
			async (txn) =>
				(
					await txn.repositories.createOrUpdateRepository(
						1 as ForgeId,
						"repo0001",
						testUser.user_id,
						"testuser/testrepo",
					)
				).repo_id,
		);

		const fixture = await insertPipelineRunFixture(repoId, {
			stepNames: ["echo hello"],
		});

		await transaction(async (txn) => {
			// This is the state a runner/reporter leaves behind for a step that
			// ran and failed with a non-zero exit code.
			await txn.pipelines.updateJobRunStep(
				fixture.workflowRunId,
				fixture.jobRunId,
				0,
				{
					status: JobRunStepStatus.failed,
					exit_code: 2,
					started_at: new Date(),
					finished_at: new Date(),
				},
			);
			await txn.pipelines.updateJobRunStatus(
				fixture.workflowRunId,
				fixture.jobRunId,
				JobRunStatus.failed,
			);
		});

		const response = await request
			.get(
				`/v0/repo/${repoId}/pipelines/${fixture.pipelineRunId}` +
					`/workflows/${fixture.workflowRunId}/jobs/${fixture.jobRunId}`,
			)
			.set("Cookie", `sessionID=${testUser.session_id}`)
			.expect(200);

		const [step] = response.body.steps;
		expect(step).toBeDefined();
		expect(step.status).toBe("failed");
		expect(step.exit_code).toBe(2);
	});
});
