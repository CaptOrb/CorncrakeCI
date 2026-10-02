import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ForgeId } from "../../src/db/schema/public/Forges";
import JobRunStatus from "../../src/db/schema/public/JobRunStatus";
import JobRunStepStatus from "../../src/db/schema/public/JobRunStepStatus";
import type { RepoId } from "../../src/db/schema/public/Repositories";
import type { WorkflowRunId } from "../../src/db/schema/public/WorkflowRuns";
import { transaction } from "../../src/db/stores";
import type { PlannedUserJob, PlannedWorkflow } from "../../src/execution/plan";
import type {
	IProgressReporter,
	IRunner,
} from "../../src/execution/runner/interface";
import {
	canScheduleJobOnRunner,
	type Runner,
	type ScheduleConstraints,
	Scheduler,
	type SchedulingJob,
} from "../../src/execution/scheduler";
import { databaseHelper } from "../helpers/database";
import { insertPipelineRunFixture } from "../helpers/fixtures";
import { testForgeHelper } from "../helpers/forge";
import { PUSH_EVENT, parseAndPlanV0 } from "../helpers/pipeline";

const TEST_FORGE_ID = 1 as ForgeId;

const STUB_RUNNER_INSTANCE: IRunner = {
	initialise: vi.fn().mockResolvedValue(undefined),
	runJob: vi.fn().mockResolvedValue(undefined),
	cancelJob: vi.fn().mockResolvedValue(undefined),
};

const EMPTY_CONSTRAINTS: ScheduleConstraints = {
	needs: new Set(),
	resources: {
		megabyteDisk: 0,
		megabyteMemory: 0,
		milliCpu: 0,
	},
	tolerates: new Set(),
};

const UNTAINTED_RUNNER: Runner = {
	activeJobs: new Set(),
	allocated: {
		megabyteDisk: 0,
		megabyteMemory: 0,
		milliCpu: 0,
	},
	instance: STUB_RUNNER_INSTANCE,
	name: "test_runner",
	profile: {
		capabilities: new Set(["arch:amd64"]),
		taints: new Set(),
	},
	resourceLimit: {
		megabyteDisk: 100,
		megabyteMemory: 100,
		milliCpu: 100,
		numJobs: 2,
	},
};

const TAINTED_RUNNER: Runner = {
	activeJobs: new Set(),
	allocated: {
		megabyteDisk: 0,
		megabyteMemory: 0,
		milliCpu: 0,
	},
	instance: STUB_RUNNER_INSTANCE,
	name: "test_runner",
	profile: {
		capabilities: new Set(["arch:amd64"]),
		taints: new Set(["stinky"]),
	},
	resourceLimit: {
		megabyteDisk: 100,
		megabyteMemory: 100,
		milliCpu: 100,
		numJobs: 2,
	},
};

const BUSY_RUNNER: Runner = {
	...UNTAINTED_RUNNER,
	// For simplicity, disrespect the type system a bit.
	// The scheduling decision doesn't look at the jobs themselves so this is OK.
	activeJobs: new Set([
		"FAKE_JOB_1",
		"FAKE_JOB_2",
	]) as Set<unknown> as Set<SchedulingJob>,
};

describe("canScheduleJobOnRunner", () => {
	test("base case", () => {
		expect(
			canScheduleJobOnRunner(EMPTY_CONSTRAINTS, UNTAINTED_RUNNER),
		).toStrictEqual(true);
	});

	test("capabilities are needed", () => {
		expect(
			canScheduleJobOnRunner(
				{
					...EMPTY_CONSTRAINTS,
					needs: new Set(["arch:riscv"]),
				},
				UNTAINTED_RUNNER,
			),
		).toStrictEqual(false);
	});

	test("taints repel jobs unless tolerated", () => {
		expect(
			canScheduleJobOnRunner(
				{
					...EMPTY_CONSTRAINTS,
				},
				TAINTED_RUNNER,
			),
		).toStrictEqual(false);

		expect(
			canScheduleJobOnRunner(
				{
					...EMPTY_CONSTRAINTS,
					tolerates: new Set(["stinky"]),
				},
				TAINTED_RUNNER,
			),
		).toStrictEqual(true);
	});

	test("resource limits prevent jobs getting scheduled", () => {
		for (const resource of ["megabyteDisk", "megabyteMemory", "milliCpu"]) {
			expect(
				canScheduleJobOnRunner(
					{
						...EMPTY_CONSTRAINTS,
						resources: {
							...EMPTY_CONSTRAINTS.resources,
							// This is just too much
							[resource]: 101,
						},
					},
					UNTAINTED_RUNNER,
				),
			).toStrictEqual(false);

			expect(
				canScheduleJobOnRunner(
					{
						...EMPTY_CONSTRAINTS,
						resources: {
							...EMPTY_CONSTRAINTS.resources,
							// This is fine
							[resource]: 100,
						},
					},
					UNTAINTED_RUNNER,
				),
			).toStrictEqual(true);
		}
	});

	test("a busy runner at maxJobs doesn't accept more", () => {
		expect(
			canScheduleJobOnRunner(EMPTY_CONSTRAINTS, BUSY_RUNNER),
		).toStrictEqual(false);
	});
});

/**
 * Exposition of private fields on `Scheduler`
 */
interface TestSchedulerAccess {
	readyJobs: Set<SchedulingJob>;
}

describe("Scheduler", () => {
	databaseHelper();
	testForgeHelper();

	let repoId: RepoId;

	beforeEach(async () => {
		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				TEST_FORGE_ID,
				"molly@gitea",
				"molly",
				"testAccessToken",
				new Date("2100-01-01T01:01:01"),
				"testRefreshToken",
				new Date("2100-01-01T01:01:01"),
			);

			const repo = await txn.repositories.createOrUpdateRepository(
				TEST_FORGE_ID,
				"molly/myrepo@gitea",
				user.user_id,
				"molly/myrepo",
			);
			repoId = repo.repo_id;
		});
	});

	test("schedule picks up jobs onto the default runner", async () => {
		const workflow = await parseAndPlanV0(
			PUSH_EVENT,
			`
corncrake version=v0

job hello {
  step """
    echo hi
    """
}
      `,
		);
		// Give the workflow an arbitrary ID
		// Normally done interactively with the database, but overkill to add a database to this test for this
		workflow.id = 42n as WorkflowRunId;

		const scheduler = new Scheduler(STUB_RUNNER_INSTANCE) as Scheduler;
		const internals = scheduler as unknown as TestSchedulerAccess;

		scheduler.schedule(workflow);

		expect(internals.readyJobs.size).toStrictEqual(0);
	});

	test("a job that reports failure is persisted as failed and not reported as success to the forge", async () => {
		const fixture = await insertPipelineRunFixture(repoId, {
			stepNames: ["echo hi"],
		});

		const plannedJob: PlannedUserJob = {
			id: fixture.jobRunId,
			jobType: "user",
			sourceLocation: { file: "main", line: 1 },
			steps: [
				{
					stepType: "user",
					sourceLocation: { file: "main", line: 1 },
					command: "false",
				},
			],
		};

		const workflow: PlannedWorkflow = {
			id: fixture.workflowRunId,
			sourceLocation: { file: "main", line: 1 },
			stages: new Map([
				[
					"test",
					{
						partial: false,
						jobs: new Map([["test job", plannedJob]]),
					},
				],
			]),
		};

		// A runner whose `runJob` reports a failed step and a failed job through
		// the progress reporter, but then *resolves* rather than rejecting.
		// The scheduler must not mistake the resolution for success.
		const failingRunner: IRunner = {
			initialise: vi.fn().mockResolvedValue(undefined),
			cancelJob: vi.fn().mockResolvedValue(undefined),
			runJob: vi.fn(
				async (_job: PlannedUserJob, reporter: IProgressReporter) => {
					await reporter.onStepEnd({
						stepIndex: 0,
						status: "failed",
						exitCode: 1,
					});
					await reporter.onJobEnd({
						success: false,
						steps: [{ stepIndex: 0, status: "failed", exitCode: 1 }],
					});
				},
			),
		};

		const scheduler = new Scheduler(failingRunner);
		scheduler.schedule(workflow);

		// The job run should be persisted as failed...
		await vi.waitFor(async () => {
			const job = await transaction((txn) =>
				txn.pipelines.getJobRunById(
					fixture.pipelineRunId,
					fixture.workflowRunId,
					fixture.jobRunId,
					fixture.repoId,
				),
			);
			expect(job?.status).toBe(JobRunStatus.failed);
		});

		// ...with its step recorded as failed...
		const steps = await transaction((txn) =>
			txn.pipelines.getJobRunSteps(fixture.workflowRunId, fixture.jobRunId),
		);
		expect(steps).toHaveLength(1);
		expect(steps[0]?.status).toBe(JobRunStepStatus.failed);
	});
});
