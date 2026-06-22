import type { RepoId } from "../db/schema/public/Repositories";
import TriggerEventType from "../db/schema/public/TriggerEventType";
import { transaction } from "../db/stores";
import type { V0File } from "../pipeline/v0/ast";
import { createLogger } from "../util/logging";
import { gatherForPlanning, planAll } from "./planner";
import type { Scheduler } from "./scheduler";
import type { TriggerEvent } from "./trigger_event";

const log = createLogger(import.meta.url);

export async function launchPipelineExecution(
	repoId: RepoId,
	files: Map<string, V0File>,
	event: TriggerEvent,
	scheduler: Scheduler,
): Promise<void> {
	const gathered = await gatherForPlanning(files);
	const plannedWorkflows = planAll(gathered, event);

	// Persist the workflows into the database, assigning them IDs in the process
	await transaction(async (txn) => {
		const pipelineRunId = await txn.pipelines.createPipelineRun(repoId, {
			// TODO support more types
			trigger_event_type:
				event.eventType === "pull_request"
					? TriggerEventType.pull_request
					: TriggerEventType.push,
			// TODO ref vs branch
			ref: event.eventType === "pull_request" ? event.prBranch : event.ref,
			commit_hash:
				event.eventType === "pull_request"
					? event.prCommitHash
					: event.commitHash,
			pr_short_human_id:
				event.eventType === "pull_request" ? event.prShortHumanId : null,
		});

		let workflowsInserted = 0;
		let jobsInserted = 0;

		for (const workflow of plannedWorkflows) {
			const workflowRunId =
				await txn.pipelines.createWorkflowRun(pipelineRunId);
			workflow.id = workflowRunId;
			++workflowsInserted;

			for (const [_stageName, stage] of workflow.stages) {
				for (const [jobName, job] of stage.jobs) {
					// TODO(perf): Insert these in batch
					await txn.pipelines.createJobRun(workflowRunId, job.id, jobName);
					job.workflowRunId = workflowRunId;
					++jobsInserted;
				}
			}
		}

		log.info(
			{ workflows: workflowsInserted, jobs: jobsInserted, pipelineRunId },
			"Persisted pipeline run in database",
		);

		return { pipelineRunId };
	});

	for (const workflow of plannedWorkflows) {
		scheduler.schedule(workflow);
	}
}
