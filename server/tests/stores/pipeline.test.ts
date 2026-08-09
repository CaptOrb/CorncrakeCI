import { beforeEach, describe, expect, test } from "vitest";
import type { ForgeId } from "../../src/db/schema/public/Forges";
import type { JobRunId } from "../../src/db/schema/public/JobRuns";
import type { RepoId } from "../../src/db/schema/public/Repositories";
import TriggerEventType from "../../src/db/schema/public/TriggerEventType";
import type { User } from "../../src/db/schema/public/Users";
import { transaction } from "../../src/db/stores";
import type { CreatePipelineRunAttrs } from "../../src/db/stores/pipeline";
import { databaseHelper } from "../helpers/database";
import { testForgeHelper } from "../helpers/forge";

const TEST_FORGE_ID = 1 as ForgeId;

const TEST_PIPELINE_RUN_ATTRS: CreatePipelineRunAttrs = {
	trigger_event_type: TriggerEventType.push,
	commit_hash: "0000",
	ref: "refs/heads/main",
	commit_message: "test commit",
	pr_short_human_id: null,
};

describe("PipelineStore", () => {
	databaseHelper(); // Setup database
	testForgeHelper(); // Setup forge and insert it into the database

	let repoId: RepoId;
	let testUser: User;

	// Set up a test user and a test repo before the test suite.
	beforeEach(async () => {
		await transaction(async (txn) => {
			testUser = await txn.users.insertUser(
				TEST_FORGE_ID,
				"antoine@forge",
				"antoine",
			);

			const repo = await txn.repositories.createOrUpdateRepository(
				TEST_FORGE_ID,
				"antoine/myrepo@forge",
				testUser.user_id,
				"antoine/myrepo",
			);
			repoId = repo.repo_id;
		});
	});

	test("pipeline run ID insertion", async () => {
		await transaction(async (txn) => {
			const pipelineId = await txn.pipelines.createPipelineRun(
				repoId,
				TEST_PIPELINE_RUN_ATTRS,
			);
			const pipelineId2 = await txn.pipelines.createPipelineRun(
				repoId,
				TEST_PIPELINE_RUN_ATTRS,
			);

			// New IDs get allocated
			expect(pipelineId).toStrictEqual(1n);
			expect(pipelineId2).toStrictEqual(2n);
		});
	});

	test("basic workflow and job insertion", async () => {
		await transaction(async (txn) => {
			const pipelineRunId = await txn.pipelines.createPipelineRun(
				repoId,
				TEST_PIPELINE_RUN_ATTRS,
			);

			const workflowRunId =
				await txn.pipelines.createWorkflowRun(pipelineRunId);

			await txn.pipelines.createJobRun(workflowRunId, 1 as JobRunId, "hello");
		});
	});
});
