import type { JobRunId } from "../../src/db/schema/public/JobRuns";
import type { PipelineRunId } from "../../src/db/schema/public/PipelineRuns";
import type { RepoId } from "../../src/db/schema/public/Repositories";
import TriggerEventType from "../../src/db/schema/public/TriggerEventType";
import type { WorkflowRunId } from "../../src/db/schema/public/WorkflowRuns";
import { transaction } from "../../src/db/stores";
import type { CreatePipelineRunAttrs } from "../../src/db/stores/pipeline";

export interface PipelineRunFixture {
	repoId: RepoId;
	pipelineRunId: PipelineRunId;
	workflowRunId: WorkflowRunId;
	jobRunId: JobRunId;
	stepNames: string[];
}

export interface PipelineRunFixtureOptions {
	/**
	 * Overrides for the pipeline run, merged over the defaults.
	 */
	pipelineRun?: Partial<CreatePipelineRunAttrs>;
	/**
	 * Name of the job run. Defaults to "test job".
	 */
	jobName?: string;
	/**
	 * ID of the job run within the workflow. Defaults to 1.
	 */
	jobRunId?: JobRunId;
	/**
	 * Names of the job run steps, one entry per step.
	 * Defaults to a single step "echo hello".
	 */
	stepNames?: string[];
}

const DEFAULT_PIPELINE_RUN_ATTRS: CreatePipelineRunAttrs = {
	trigger_event_type: TriggerEventType.push,
	commit_hash: "0000",
	ref: "refs/heads/main",
	commit_message: "test commit",
	pr_short_human_id: null,
};

/**
 * Inserts a complete pipeline run fixture: a pipeline run, a single workflow
 * run, a single job run, and the job run's steps.
 *
 * @returns The IDs of the inserted records.
 */
export async function insertPipelineRunFixture(
	repoId: RepoId,
	options: PipelineRunFixtureOptions = {},
): Promise<PipelineRunFixture> {
	const {
		pipelineRun = {},
		jobName = "test job",
		jobRunId = 1 as JobRunId,
		stepNames = ["echo hello"],
	} = options;

	return transaction(async (txn) => {
		const pipelineRunId = await txn.pipelines.createPipelineRun(repoId, {
			...DEFAULT_PIPELINE_RUN_ATTRS,
			...pipelineRun,
		});

		const workflowRunId = await txn.pipelines.createWorkflowRun(pipelineRunId);

		await txn.pipelines.createJobRun(workflowRunId, jobRunId, jobName);

		await txn.pipelines.createJobRunSteps(
			workflowRunId,
			jobRunId,
			stepNames.map((name, step_index) => ({ step_index, name })),
		);

		return {
			repoId,
			pipelineRunId,
			workflowRunId,
			jobRunId,
			stepNames,
		};
	});
}
