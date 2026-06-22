// TODO store ordering info
// TODO real step info
// TODO resource info

import type { JobRunId } from "../db/schema/public/JobRuns";
import type { WorkflowRunId } from "../db/schema/public/WorkflowRuns";

export type SourceLocation = {
	/**
	 * Repository-relative path of the workflow file.
	 *
	 * TODO This might change as we have to figure out how to represent the locations of dependencies.
	 */
	file: string;
	/**
	 * 1-indexed line number
	 */
	line: number;
};

export interface PlannedWorkflow {
	/**
	 * ID of the workflow.
	 * Populated at database insertion, just after planning.
	 *
	 * Safe to rely on this existing during scheduling and running.
	 */
	id?: WorkflowRunId;

	/**
	 * Map of stage name to stage.
	 */
	stages: Map<string, PlannedStage>;

	// TODO ordering information

	sourceLocation: SourceLocation;
}

/**
 * A container for planned jobs.
 */
export interface PlannedStage {
	/**
	 * List of the **planned** jobs.
	 *
	 * Note that if this is a partial stage, new dynamic jobs could be added at runtime. (Future feature)
	 */
	jobs: Map<string, PlannedJob>;

	/**
	 * If true, the stage is pending and can have new jobs added to it dynamically.
	 * (Future feature)
	 */
	partial: boolean;
}

/**
 * Schedule-level unit.
 *
 * In the future, will include special system jobs.
 */
export type PlannedJob = PlannedUserJob;

/**
 * A planned unit of scheduling for user-defined workloads.
 *
 * Conceptually, all steps within the job share a workspace
 * and once the job has been scheduled, all steps can be fired off
 * without further scheduling.
 */
export interface PlannedUserJob {
	/**
	 * ID of the workflow.
	 * Populated at database insertion, just after planning.
	 *
	 * Safe to rely on this existing during scheduling and running.
	 */
	workflowRunId?: WorkflowRunId;

	/**
	 * ID of the job (within the workflow).
	 */
	id: JobRunId;

	jobType: "user";
	sourceLocation: SourceLocation;

	steps: PlannedStep[];
}

export type PlannedStep = PlannedCacheStep | PlannedEnvStep | PlannedUserStep;

export interface PlannedCacheStep {
	stepType: "cache";
	sourceLocation: SourceLocation;
}

export interface PlannedEnvStep {
	stepType: "env";
	sourceLocation: SourceLocation;
}

export interface PlannedUserStep {
	stepType: "user";
	sourceLocation: SourceLocation;

	// TODO probably not permanent
	image?: string | undefined;
	command: string;
}
