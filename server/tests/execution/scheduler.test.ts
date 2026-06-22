import { describe, expect, test } from "vitest";
import type { WorkflowRunId } from "../../src/db/schema/public/WorkflowRuns";
import {
	canScheduleJobOnRunner,
	type Runner,
	type ScheduleConstraints,
	Scheduler,
	type SchedulingJob,
} from "../../src/execution/scheduler";
import { PUSH_EVENT, parseAndPlanV0 } from "../helpers/pipeline";

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
	test("puts jobs in queue when no runners available", async () => {
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

		const scheduler = new Scheduler() as Scheduler;
		const internals = scheduler as unknown as TestSchedulerAccess;

		scheduler.schedule(workflow);

		expect(internals.readyJobs.size).toStrictEqual(1);
	});
});
