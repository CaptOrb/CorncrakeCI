import type { StoredLocation } from "@bgotink/kdl";
import type { JobRunId } from "../../db/schema/public/JobRuns";
import type {
	JobDeclaration,
	StageDeclaration,
	V0File,
	WorkflowDeclaration,
} from "../../pipeline/v0/ast";
import { IdGenerator } from "../../util/counter";
import type {
	PlannedJob,
	PlannedStage,
	PlannedStep,
	PlannedWorkflow,
	SourceLocation,
} from "../plan";
import type { TriggerEvent } from "../trigger_event";

type PlanContext = {
	event: TriggerEvent;
	spanToLoc: SpanToLocFn;
	jobIdGenerator: IdGenerator<JobRunId>;
};

export interface GatheredPipeline {
	files: Map<string, V0File>;
}

type SpanToLocFn = (span: StoredLocation) => SourceLocation;

/**
 * Make a function that converts span to location.
 */
function makeSpanToLoc(file: string): SpanToLocFn {
	return (span) =>
		({
			file,
			line: span.start.line,
		}) satisfies SourceLocation;
}

/**
 * Given the pipeline configuration files, gathers external resources needed
 * to plan the pipeline.
 *
 * After gathering, we will have all the resources loaded that we need to plan the execution.
 */
export async function gatherForPlanning(
	files: Map<string, V0File>,
): Promise<GatheredPipeline> {
	// We don't support imports of pipeline config yet, so nothing to resolve... yet.
	return {
		files,
	};
}

/**
 * Plans the execution of all workflows in the pipeline.
 */
export function planAll(
	gathered: GatheredPipeline,
	event: TriggerEvent,
): PlannedWorkflow[] {
	const out = [];

	for (const [filename, file] of gathered.files.entries()) {
		const spanToLoc = makeSpanToLoc(filename);
		const ctx: PlanContext = {
			event,
			spanToLoc,
			jobIdGenerator: new IdGenerator(1 as JobRunId),
		};

		for (const workflow of file.workflows) {
			out.push(planWorkflow(workflow, ctx));
		}
	}

	return out;
}

/**
 * Plans the execution of a workflow.
 *
 * This is the isolated unit of planning: the plan of one workflow can't influence the plan of another.
 */
export function planWorkflow(
	workflow: WorkflowDeclaration,
	ctx: PlanContext,
): PlannedWorkflow {
	const stages: Map<string, PlannedStage> = new Map();

	for (const stage of workflow.stages) {
		stages.set(stage.name, planStage(stage, ctx));
	}

	return {
		stages,
		sourceLocation: ctx.spanToLoc(workflow.span),
	};
}

function planStage(stage: StageDeclaration, ctx: PlanContext): PlannedStage {
	const jobs: Map<string, PlannedJob> = new Map();
	let partial = false;

	for (const jobDecl of stage.jobs) {
		const { job, willDynamicallyAddJobsToThisStage } = planJob(jobDecl, ctx);
		partial ||= willDynamicallyAddJobsToThisStage;
		jobs.set(jobDecl.name, job);
	}

	return {
		jobs,
		partial,
	};
}

function planJob(
	job: JobDeclaration,
	ctx: PlanContext,
): {
	job: PlannedJob;

	/**
	 * If true, this job will dynamically add more jobs to the stage.
	 *
	 * (Future feature)
	 */
	willDynamicallyAddJobsToThisStage: boolean;
} {
	const steps: PlannedStep[] = [];

	for (const step of job.steps) {
		switch (step.type) {
			case "user": {
				steps.push({
					stepType: "user",
					sourceLocation: ctx.spanToLoc(step.span),
					command: step.command,
					image: step.image,
				});
				break;
			}
			case "cache": {
				// TODO Unimplemented
				break;
			}
			case "env": {
				// TODO Unimplemented
				break;
			}
		}
	}

	return {
		job: {
			id: ctx.jobIdGenerator.next(),
			jobType: "user",
			sourceLocation: ctx.spanToLoc(job.span),
			steps,
		},
		willDynamicallyAddJobsToThisStage: false,
	};
}
