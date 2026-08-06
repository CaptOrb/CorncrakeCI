import { createLogger } from "../../util/logging";
import type { PlannedJob, PlannedUserJob } from "../plan";
import type { RunnerJob, RunnerStep } from "./interface";

const log = createLogger(import.meta.url);

export function toRunnerJob(plannedJob: PlannedJob): RunnerJob {
	const job = plannedJob as PlannedUserJob;

	const steps = job.steps.flatMap((step): RunnerStep[] => {
		if (step.stepType === "user") {
			return [
				{
					command: step.command,
					...(step.image !== undefined ? { image: step.image } : {}),
				},
			];
		}
		log.warn({ stepType: step.stepType }, "skipping non-user step");
		return [];
	});

	return {
		id: `${job.workflowRunId}/${job.id}`,
		steps,
	};
}
