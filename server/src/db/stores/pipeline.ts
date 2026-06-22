import type { Transaction } from "kysely";
import type Database from "../schema/Database";
import JobRunStatus from "../schema/public/JobRunStatus";
import type { JobRunId } from "../schema/public/JobRuns";
import type {
	NewPipelineRun,
	PipelineRunId,
} from "../schema/public/PipelineRuns";
import type { RepoId } from "../schema/public/Repositories";
import WorkflowRunStatus from "../schema/public/WorkflowRunStatus";
import type { WorkflowRunId } from "../schema/public/WorkflowRuns";

export type CreatePipelineRunAttrs = Pick<
	NewPipelineRun,
	Exclude<keyof NewPipelineRun, "repo_id" | "triggered_at" | "pipeline_run_id">
>;

export class PipelineStore {
	constructor(private kysely: Transaction<Database>) {}

	/**
	 * Creates a new record of a pipeline run on the specified repository.
	 */
	async createPipelineRun(
		repoId: RepoId,
		attrs: CreatePipelineRunAttrs,
	): Promise<PipelineRunId> {
		const inserted = await this.kysely
			.insertInto("pipeline_runs")
			.values({
				repo_id: repoId,
				triggered_at: new Date(),
				...attrs,
			})
			.returning("pipeline_run_id")
			.executeTakeFirstOrThrow();

		return inserted.pipeline_run_id;
	}

	/**
	 * Attaches a new workflow run to a pipeline run.
	 * The workflow will be in 'incomplete' state.
	 */
	async createWorkflowRun(
		pipelineRunId: PipelineRunId,
	): Promise<WorkflowRunId> {
		const inserted = await this.kysely
			.insertInto("workflow_runs")
			.values({
				pipeline_run_id: pipelineRunId,
				status: WorkflowRunStatus.incomplete,
			})
			.returning("workflow_run_id")
			.executeTakeFirstOrThrow();

		return inserted.workflow_run_id;
	}

	/**
	 * Attaches a new job run to a workflow run.
	 * The job will be in 'incomplete' state.
	 */
	async createJobRun(
		workflowRunId: WorkflowRunId,
		jobRunId: JobRunId,
		name: string,
	): Promise<void> {
		await this.kysely
			.insertInto("job_runs")
			.values({
				workflow_run_id: workflowRunId,
				job_run_id: jobRunId,
				name,
				status: JobRunStatus.incomplete,
			})
			.execute();
	}
}
