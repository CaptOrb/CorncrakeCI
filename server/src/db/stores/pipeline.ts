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
import WorkflowRunStatus from "../schema/public/WorkflowRunStatus";
import type { WorkflowRun, WorkflowRunId } from "../schema/public/WorkflowRuns";

export type CreatePipelineRunAttrs = Pick<
	NewPipelineRun,
	Exclude<keyof NewPipelineRun, "repo_id" | "triggered_at" | "pipeline_run_id">
>;

export class PipelineStore {
	constructor(private kysely: Transaction<Database>) {}

	/**
	 * Gets a pipeline run with a given ID
	 */
	async getPipelineRunById(
		pipelineRunId: PipelineRunId,
		repoId: RepoId,
	): Promise<PipelineRun | undefined> {
		return this.kysely
			.selectFrom("pipeline_runs")
			.selectAll()
			.where("pipeline_run_id", "=", pipelineRunId)
			.where("repo_id", "=", repoId)
			.executeTakeFirst();
	}

	async getWorkflowRuns(pipelineRunId: PipelineRunId): Promise<WorkflowRun[]> {
		return this.kysely
			.selectFrom("workflow_runs")
			.selectAll()
			.where("pipeline_run_id", "=", pipelineRunId)
			.orderBy("workflow_run_id", "desc")
			.execute();
	}

	async getJobRuns(workflowRunId: WorkflowRunId): Promise<JobRun[]> {
		return this.kysely
			.selectFrom("job_runs")
			.selectAll()
			.where("workflow_run_id", "=", workflowRunId)
			.orderBy("job_run_id", "desc")
			.execute();
	}
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

	async getPipelineRunsByRepoId(repoId: RepoId): Promise<PipelineRun[]> {
		return this.kysely
			.selectFrom("pipeline_runs")
			.selectAll()
			.where("repo_id", "=", repoId)
			.orderBy("triggered_at", "desc")
			.execute();
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

	async getJobRunById(
		pipelineRunId: PipelineRunId,
		workflowRunId: WorkflowRunId,
		jobRunId: JobRunId,
		repoId: RepoId,
	): Promise<JobRun | undefined> {
		return this.kysely
			.selectFrom("job_runs")
			.innerJoin(
				"workflow_runs",
				"job_runs.workflow_run_id",
				"workflow_runs.workflow_run_id",
			)
			.innerJoin(
				"pipeline_runs",
				"workflow_runs.pipeline_run_id",
				"pipeline_runs.pipeline_run_id",
			)
			.selectAll("job_runs")
			.where("pipeline_runs.pipeline_run_id", "=", pipelineRunId)
			.where("pipeline_runs.repo_id", "=", repoId)
			.where("job_runs.workflow_run_id", "=", workflowRunId)
			.where("job_runs.job_run_id", "=", jobRunId)
			.executeTakeFirst();
	}

	async getJobRunSteps(
		workflowRunId: WorkflowRunId,
		jobRunId: JobRunId,
	): Promise<JobRunStep[]> {
		return this.kysely
			.selectFrom("job_run_steps")
			.selectAll()
			.where("workflow_run_id", "=", workflowRunId)
			.where("job_run_id", "=", jobRunId)
			.orderBy("step_index")
			.execute();
	}
}
