import { config } from "../config";
import JobRunStatus from "../db/schema/public/JobRunStatus";
import type { JobRunId } from "../db/schema/public/JobRuns";
import type { PipelineRunId } from "../db/schema/public/PipelineRuns";
import type { RepoId } from "../db/schema/public/Repositories";
import type { WorkflowRunId } from "../db/schema/public/WorkflowRuns";
import { transaction } from "../db/stores";
import { getForgeWithUser } from "../services/forges";
import { createLogger } from "../util/logging";

const log = createLogger(import.meta.url);

export async function handleJobComplete(
	workflowRunId: WorkflowRunId,
	jobRunId: JobRunId,
	success: boolean,
) {
	try {
		const result = await transaction((txn) =>
			txn.pipelines.updateJobRunStatus(
				workflowRunId,
				jobRunId,
				success ? JobRunStatus.succeeded : JobRunStatus.failed,
			),
		);

		if (
			result.pipelineCompleted &&
			result.pipelineRunId !== undefined &&
			result.repoId !== undefined
		) {
			await createCommitStatus(
				result.pipelineRunId,
				result.repoId,
				result.pipelineSucceeded!,
			);
		}
	} catch (err) {
		log.error(
			{ err, workflowRunId, jobRunId },
			"failed to update job status in db",
		);
	}
}

export async function createCommitStatus(
	pipelineRunId: PipelineRunId,
	repoId: RepoId,
	success: boolean,
) {
	const pipeline = await transaction(async (txn) =>
		txn.pipelines.getPipelineRunById(pipelineRunId, repoId),
	);
	if (!pipeline) return;

	const repo = await transaction(async (txn) =>
		txn.repositories.getRepositoryById(pipeline.repo_id),
	);
	if (!repo) {
		return;
	}

	try {
		const forge = await getForgeWithUser(repo.owner_id);
		await forge.createCommitStatus(
			repo.forge_repo_id,
			pipeline.commit_hash,
			success ? "success" : "failure",
			success ? "pipeline passed" : "pipeline failed",
			"corncrake/ci",
			`${config.app.baseurl}/repos/${pipeline.repo_id}/pipelines/${pipeline.pipeline_run_id}`,
		);
	} catch (err) {
		log.warn({ err }, "failed to create commit status on forge");
	}
}
