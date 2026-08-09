import JobRunStatus from "../../db/schema/public/JobRunStatus";
import type { JobRunId } from "../../db/schema/public/JobRuns";
import type {
	PipelineRun,
	PipelineRunId,
} from "../../db/schema/public/PipelineRuns";
import type { RepoId } from "../../db/schema/public/Repositories";
import WorkflowRunStatus from "../../db/schema/public/WorkflowRunStatus";
import type { WorkflowRunId } from "../../db/schema/public/WorkflowRuns";
import { transaction } from "../../db/stores";
import type {
	GetJob,
	GetPipeline,
	ListPipelines,
} from "../../generated/server/generated";
import type {
	t_ExecutionStatus,
	t_JobSummary,
	t_StageInfo,
	t_TriggerEvent,
	t_TriggerInfo,
} from "../../generated/server/models";
import {
	AccessLevel,
	AuthError,
	getForgeWithUser,
	NotFoundError,
} from "../../services/forges";

function mapJobStatus(status: JobRunStatus): t_ExecutionStatus {
	switch (status) {
		case JobRunStatus.incomplete:
			return "incomplete";
		case JobRunStatus.succeeded:
			return "completed";
		case JobRunStatus.failed:
			return "failed";
		case JobRunStatus.cancelled:
			return "cancelled";
		case JobRunStatus.timed_out:
			return "failed";
		case JobRunStatus.skipped_condition:
			return "skipped";
		case JobRunStatus.skipped_prerequisite:
			return "skipped";
	}
}

function mapWorkflowStatus(status: WorkflowRunStatus): t_ExecutionStatus {
	switch (status) {
		case WorkflowRunStatus.incomplete:
			return "incomplete";
		case WorkflowRunStatus.succeeded:
			return "completed";
		case WorkflowRunStatus.failed:
			return "failed";
		case WorkflowRunStatus.cancelled:
			return "cancelled";
		case WorkflowRunStatus.timed_out:
			return "timed_out";
	}
}

export const listPipelines: ListPipelines = async (
	{ params },
	respond,
	req,
) => {
	const userId = req.session?.userId;
	if (!userId) {
		throw new AuthError("Not authenticated");
	}
	const repoId = params.repoId as RepoId;

	const { pipeline, repo } = await transaction(async (txn) => {
		const pipeline: PipelineRun[] =
			await txn.pipelines.getPipelineRunsByRepoId(repoId);
		const repo = await txn.repositories.getRepositoryById(repoId);
		return { pipeline, repo };
	});

	if (!repo) {
		throw new NotFoundError("Repository not found");
	}

	const forge = await getForgeWithUser(userId);
	await forge.checkAccess(repo.forge_repo_id, AccessLevel.Read);

	return respond.with200().body(
		pipeline.map((p) => ({
			pipeline_id: p.pipeline_run_id.toString(),
			source_file: "",
			status: "pending" as t_ExecutionStatus, // TODO fix
			trigger: {
				event: p.trigger_event_type as t_TriggerEvent,
				commit_sha: p.commit_hash,
				ref: p.ref,
				commit_message: p.commit_message ?? undefined,
			},
			created_at: p.triggered_at.toISOString(),
		})),
	);
};

export const getPipeline: GetPipeline = async ({ params }, respond, req) => {
	const userId = req.session?.userId;
	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const repoId = params.repoId as RepoId;
	const pipelineId = BigInt(params.pipelineId) as PipelineRunId;

	const { pipeline, repo } = await transaction(async (txn) => {
		const pipeline = await txn.pipelines.getPipelineRunById(pipelineId, repoId);
		const repo = await txn.repositories.getRepositoryById(repoId);
		return { pipeline, repo };
	});

	if (!pipeline || !repo) {
		throw new NotFoundError("Pipeline not found");
	}

	const forge = await getForgeWithUser(userId);
	await forge.checkAccess(repo.forge_repo_id, AccessLevel.Read);

	const { workflows, jobsByWorkflow } = await transaction(async (txn) => {
		const workflows = await txn.pipelines.getWorkflowRuns(pipelineId);
		// TODO probably worth being a JOIN at the database rather than one extra query for each workflow
		const jobsByWorkflow = new Map(
			await Promise.all(
				workflows.map(
					async (w) =>
						[
							w.workflow_run_id,
							await txn.pipelines.getJobRuns(w.workflow_run_id),
						] as const,
				),
			),
		);
		return { workflows, jobsByWorkflow };
	});

	const stages: t_StageInfo[] = workflows.map((w) => {
		const jobs = jobsByWorkflow.get(w.workflow_run_id) ?? [];
		const jobSummaries: t_JobSummary[] = jobs.map((j) => ({
			job_id: j.job_run_id.toString(),
			name: j.name,
			status: mapJobStatus(j.status),
			stage: undefined,
			started_at: j.started_at?.toISOString(),
			finished_at: j.finished_at?.toISOString(),
		}));

		return {
			workflow_id: w.workflow_run_id.toString(),
			status: mapWorkflowStatus(w.status),
			source_file: jobs[0]?.source_file ?? undefined,
			started_at: undefined,
			finished_at: undefined,
			jobs: jobSummaries,
		};
	});

	const trigger: t_TriggerInfo = {
		event: pipeline.trigger_event_type as t_TriggerEvent,
		commit_sha: pipeline.commit_hash,
		ref: pipeline.ref,
		commit_message: pipeline.commit_message ?? undefined,
	};

	const pipelineSourceFile = ""; // TODO

	return respond.with200().body({
		pipeline_id: pipeline.pipeline_run_id.toString(),
		source_file: pipelineSourceFile,
		status: "pending", // TODO
		trigger,
		created_at: pipeline.triggered_at.toISOString(),
		config: "",
		stages,
	});
};

export const getJob: GetJob = async ({ params }, respond, req) => {
	const userId = req.session?.userId;
	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const repoId = params.repoId as RepoId;
	const pipelineId = BigInt(params.pipelineId) as PipelineRunId;
	const workflowRunId = BigInt(params.workflowId) as WorkflowRunId;
	const jobRunId = Number(params.jobId) as JobRunId;

	const { pipeline, repo, job } = await transaction(async (txn) => {
		const pipeline = await txn.pipelines.getPipelineRunById(pipelineId, repoId);
		const repo = await txn.repositories.getRepositoryById(repoId);
		const job = await txn.pipelines.getJobRunById(
			pipelineId,
			workflowRunId,
			jobRunId,
			repoId,
		);
		return { pipeline, repo, job };
	});

	if (!pipeline || !repo) {
		throw new NotFoundError("Pipeline not found");
	}

	if (!job) {
		throw new NotFoundError("Job not found");
	}

	const forge = await getForgeWithUser(userId);
	await forge.checkAccess(repo.forge_repo_id, AccessLevel.Read);

	const steps = await transaction(async (txn) => {
		return txn.pipelines.getJobRunSteps(job.workflow_run_id, jobRunId);
	});

	return respond.with200().body({
		job_id: job.job_run_id.toString(),
		name: job.name,
		status: mapJobStatus(job.status),
		started_at: job.started_at?.toISOString(),
		finished_at: job.finished_at?.toISOString(),
		steps: steps.map((s) => ({
			step_id: s.step_index.toString(),
			name: `Step ${s.step_index}`,
			status: s.started_at
				? s.finished_at
					? ("completed" as const)
					: ("running" as const)
				: ("pending" as const),
			started_at: s.started_at?.toISOString(),
			finished_at: s.finished_at?.toISOString(),
		})),
	});
};
