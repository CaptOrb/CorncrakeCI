import { describe, expect, test } from "vitest";
import type { PlannedUserStep } from "../../src/execution/plan";
import {
	type GatheredPipeline,
	gatherForPlanning,
} from "../../src/execution/planner";
import { PUSH_EVENT, parseAndPlanV0, parseV0 } from "../helpers/pipeline";

describe("gatherForPlanning", () => {
	test("files are passed through", async () => {
		const file = parseV0("parseFile", `corncrake version=v0`);
		const files = new Map([["main", file]]);
		const out = await gatherForPlanning(files);

		expect(out).toEqual({
			files,
		} satisfies GatheredPipeline);
	});
});

describe("plan", () => {
	test("basic single-job workflow", async () => {
		const workflow = await parseAndPlanV0(
			PUSH_EVENT,
			`
corncrake version=v0

job hello {
  step """
    echo Meow
    """
}
      `,
		);

		expect(workflow.stages.size).toStrictEqual(1);
		const stage = workflow.stages.get("hello")!;
		expect(stage.partial).toStrictEqual(false);
		expect(stage.jobs.size).toStrictEqual(1);
		const job = stage.jobs.get("hello")!;
		// Assigned by a counter
		expect(job.id).toStrictEqual(1);
		expect(job.jobType).toStrictEqual("user");
		expect(job.sourceLocation).toEqual({ file: "main", line: 4 });
		expect(job.steps).toEqual([
			{
				stepType: "user",
				image: undefined,
				command: "echo Meow",
				sourceLocation: { file: "main", line: 5 },
			} satisfies PlannedUserStep,
		]);
	});
});
