import type { Transaction } from "kysely";
import type Database from "../schema/Database";
import JobRunStatus from "../schema/public/JobRunStatus";
import type { JobRunStep } from "../schema/public/JobRunSteps";
import type { JobRun, JobRunId } from "../schema/public/JobRuns";
import type {
	NewPipelineRun,
	PipelineRun,
	PipelineRunId,
} from "../schema/public/PipelineRuns";
import type { RepoId } from "../schema/public/Repositories";
import type { default as TriggerEventType } from "../schema/public/TriggerEventType";
import WorkflowRunStatus from "../schema/public/WorkflowRunStatus";
import type { WorkflowRun, WorkflowRunId } from "../schema/public/WorkflowRuns";

/** Filtering and pagination options for listing pipeline runs. */
export interface ListPipelineRunsOptions {
	/** Restrict to a single trigger event type. */
	event?: TriggerEventType;

	/**
	 * Restrict to a single ref.
	 */
	branch?: string;

	limit: number;
	offset: number;
}

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

	/**
	 * Lists pipeline runs for a repository, most recent first.
	 */
	async listPipelineRuns(
		repoId: RepoId,
		opts: ListPipelineRunsOptions,
	): Promise<PipelineRun[]> {
		let query = this.kysely
			.selectFrom("pipeline_runs")
			.selectAll()
			.where("repo_id", "=", repoId);

		if (opts.event !== undefined) {
			query = query.where("trigger_event_type", "=", opts.event);
		}

		if (opts.branch !== undefined) {
			const branch = opts.branch;
			query = query.where((eb) =>
				eb.or([eb("ref", "=", branch), eb("ref", "=", `refs/heads/${branch}`)]),
			);
		}

		return query
			.orderBy("triggered_at", "desc")
			.orderBy("pipeline_run_id", "desc")
			.limit(opts.limit)
			.offset(opts.offset)
			.execute();
	}

	/**
	 * Fetches a single pipeline run, scoped to the repository that owns it.
	 * Returns null if there is no such run in that repository.
	 */
	async getPipelineRun(
		repoId: RepoId,
		pipelineRunId: PipelineRunId,
	): Promise<PipelineRun | null> {
		const row = await this.kysely
			.selectFrom("pipeline_runs")
			.selectAll()
			.where("pipeline_run_id", "=", pipelineRunId)
			.where("repo_id", "=", repoId)
			.executeTakeFirst();

		return row ?? null;
	}

	/**
	 * Fetches all workflow runs belonging to the given pipeline runs,
	 * ordered by workflow id.
	 */
	async getWorkflowRunsForPipelines(
		pipelineRunIds: PipelineRunId[],
	): Promise<WorkflowRun[]> {
		if (pipelineRunIds.length === 0) {
			return [];
		}

		return this.kysely
			.selectFrom("workflow_runs")
			.selectAll()
			.where("pipeline_run_id", "in", pipelineRunIds)
			.orderBy("workflow_run_id", "asc")
			.execute();
	}

	/**
	 * Fetches all job runs belonging to the given workflow runs,
	 * ordered by workflow then job id.
	 */
	async getJobRunsForWorkflows(
		workflowRunIds: WorkflowRunId[],
	): Promise<JobRun[]> {
		if (workflowRunIds.length === 0) {
			return [];
		}

		return this.kysely
			.selectFrom("job_runs")
			.selectAll()
			.where("workflow_run_id", "in", workflowRunIds)
			.orderBy("workflow_run_id", "asc")
			.orderBy("job_run_id", "asc")
			.execute();
	}

	/**
	 * Fetches a single job run identified by its (workflow, job) id pair,
	 * verifying it belongs to the given pipeline run and repository. Returns
	 * null if any link in that chain doesn't match.
	 */
	async getJobRun(
		repoId: RepoId,
		pipelineRunId: PipelineRunId,
		workflowRunId: WorkflowRunId,
		jobRunId: JobRunId,
	): Promise<JobRun | null> {
		const row = await this.kysely
			.selectFrom("job_runs as j")
			.innerJoin("workflow_runs as w", "w.workflow_run_id", "j.workflow_run_id")
			.innerJoin("pipeline_runs as p", "p.pipeline_run_id", "w.pipeline_run_id")
			.selectAll("j")
			.where("j.workflow_run_id", "=", workflowRunId)
			.where("j.job_run_id", "=", jobRunId)
			.where("w.pipeline_run_id", "=", pipelineRunId)
			.where("p.repo_id", "=", repoId)
			.executeTakeFirst();

		return row ?? null;
	}

	/**
	 * Fetches the steps of a job run, ordered by step index.
	 */
	async getJobRunSteps(
		workflowRunId: WorkflowRunId,
		jobRunId: JobRunId,
	): Promise<JobRunStep[]> {
		return this.kysely
			.selectFrom("job_run_steps")
			.selectAll()
			.where("workflow_run_id", "=", workflowRunId)
			.where("job_run_id", "=", jobRunId)
			.orderBy("step_index", "asc")
			.execute();
	}
}
