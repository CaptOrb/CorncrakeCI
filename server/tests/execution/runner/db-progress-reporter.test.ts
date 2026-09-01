import { beforeEach, describe, expect, test } from "vitest";
import type { ForgeId } from "../../../src/db/schema/public/Forges";
import JobRunStatus from "../../../src/db/schema/public/JobRunStatus";
import JobRunStepStatus from "../../../src/db/schema/public/JobRunStepStatus";
import type { RepoId } from "../../../src/db/schema/public/Repositories";
import type { User } from "../../../src/db/schema/public/Users";
import WorkflowRunStatus from "../../../src/db/schema/public/WorkflowRunStatus";
import { transaction } from "../../../src/db/stores";
import { DatabaseProgressReporter } from "../../../src/execution/runner/progress";
import { databaseHelper } from "../../helpers/database";
import { insertPipelineRunFixture } from "../../helpers/fixtures";
import { testForgeHelper } from "../../helpers/forge";

const TEST_FORGE_ID = 1 as ForgeId;

describe("DatabaseProgressReporter", () => {
	databaseHelper();
	testForgeHelper();

	let repoId: RepoId;
	let testUser: User;

	beforeEach(async () => {
		await transaction(async (txn) => {
			testUser = await txn.users.insertUser(
				TEST_FORGE_ID,
				"molly@gitea",
				"molly",
			);

			const repo = await txn.repositories.createOrUpdateRepository(
				TEST_FORGE_ID,
				"molly/myrepo@gitea",
				testUser.user_id,
				"molly/myrepo",
			);
			repoId = repo.repo_id;
		});
	});

	test("onStepStart marks the step as started and incomplete", async () => {
		const fixture = await insertPipelineRunFixture(repoId, {
			stepNames: ["echo hello"],
		});

		const reporter = new DatabaseProgressReporter(
			fixture.workflowRunId,
			fixture.jobRunId,
		);

		await reporter.onStepStart(0);

		await transaction(async (txn) => {
			const steps = await txn.pipelines.getJobRunSteps(
				fixture.workflowRunId,
				fixture.jobRunId,
			);

			const step = steps[0];
			expect(step).toBeDefined();
			expect(step!.started_at).toBeInstanceOf(Date);
			expect(step!.status).toBe(JobRunStepStatus.incomplete);
		});
	});

	test("onStepEnd marks the step as failed with its exit code", async () => {
		const fixture = await insertPipelineRunFixture(repoId, {
			stepNames: ["echo hello"],
		});

		const reporter = new DatabaseProgressReporter(
			fixture.workflowRunId,
			fixture.jobRunId,
		);

		await reporter.onStepEnd({ stepIndex: 0, status: "failed", exitCode: 2 });

		await transaction(async (txn) => {
			const steps = await txn.pipelines.getJobRunSteps(
				fixture.workflowRunId,
				fixture.jobRunId,
			);

			const step = steps[0];
			expect(step).toBeDefined();
			expect(step!.status).toBe(JobRunStepStatus.failed);
			expect(step!.finished_at).toBeInstanceOf(Date);

			expect(step!.exit_code).toBe(2);
		});
	});

	test("onStepEnd without `exitCode` leaves `exit_code` NULL", async () => {
		const fixture = await insertPipelineRunFixture(repoId, {
			stepNames: ["echo hello"],
		});

		const reporter = new DatabaseProgressReporter(
			fixture.workflowRunId,
			fixture.jobRunId,
		);

		await reporter.onStepEnd({ stepIndex: 0, status: "failed" });

		await transaction(async (txn) => {
			const steps = await txn.pipelines.getJobRunSteps(
				fixture.workflowRunId,
				fixture.jobRunId,
			);

			const step = steps[0];
			expect(step).toBeDefined();
			expect(step!.status).toBe(JobRunStepStatus.failed);
			expect(step!.finished_at).toBeInstanceOf(Date);

			expect(step!.exit_code).toBe(null);
		});
	});

	test("onJobEnd failure marks the job failed and cascades the pipeline", async () => {
		const fixture = await insertPipelineRunFixture(repoId, {
			stepNames: ["echo hello"],
		});

		const reporter = new DatabaseProgressReporter(
			fixture.workflowRunId,
			fixture.jobRunId,
		);

		await reporter.onJobEnd({
			success: false,
			steps: [{ stepIndex: 0, status: "failed" }],
			error: "step failed",
		});

		await transaction(async (txn) => {
			const job = await txn.pipelines.getJobRunById(
				fixture.pipelineRunId,
				fixture.workflowRunId,
				fixture.jobRunId,
				repoId,
			);
			expect(job?.status).toBe(JobRunStatus.failed);

			const workflowRuns = await txn.pipelines.getWorkflowRuns(
				fixture.pipelineRunId,
			);
			expect(workflowRuns[0]?.status).toBe(WorkflowRunStatus.failed);
		});
	});

	test("onJobEnd success marks the job as succeeded", async () => {
		const fixture = await insertPipelineRunFixture(repoId, {
			stepNames: ["echo hello"],
		});

		const reporter = new DatabaseProgressReporter(
			fixture.workflowRunId,
			fixture.jobRunId,
		);

		await reporter.onJobEnd({
			success: true,
			steps: [{ stepIndex: 0, status: "succeeded" }],
		});

		await transaction(async (txn) => {
			const job = await txn.pipelines.getJobRunById(
				fixture.pipelineRunId,
				fixture.workflowRunId,
				fixture.jobRunId,
				repoId,
			);
			expect(job?.status).toBe(JobRunStatus.succeeded);

			const workflowRuns = await txn.pipelines.getWorkflowRuns(
				fixture.pipelineRunId,
			);
			expect(workflowRuns[0]?.status).toBe(WorkflowRunStatus.succeeded);
		});
	});

	test("a planned multi-step job creates step rows with sequential indices in order", async () => {
		const stepNames = ["build", "test", "deploy"];
		const fixture = await insertPipelineRunFixture(repoId, { stepNames });

		await transaction(async (txn) => {
			const steps = await txn.pipelines.getJobRunSteps(
				fixture.workflowRunId,
				fixture.jobRunId,
			);

			expect(steps.map((step) => step.step_index)).toStrictEqual([0, 1, 2]);
			expect(steps.map((step) => step.name)).toStrictEqual(stepNames);
		});
	});
});
