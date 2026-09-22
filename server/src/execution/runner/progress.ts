import JobRunStepStatus from "../../db/schema/public/JobRunStepStatus";
import type { JobRunId } from "../../db/schema/public/JobRuns";
import type { WorkflowRunId } from "../../db/schema/public/WorkflowRuns";
import { transaction } from "../../db/stores";
import { createLogger } from "../../util/logging";
import { handleJobComplete } from "../job-completion";
import type { IProgressReporter, JobEndStatus, StepStatus } from "./interface";

const log = createLogger(import.meta.url);

/**
 * Progress reporter that persists job and step progress to the database.
 */
export class DatabaseProgressReporter implements IProgressReporter {
	constructor(
		private workflowRunId: WorkflowRunId,
		private jobRunId: JobRunId,
	) {}

	onLog(_line: string): void {
		// TODO
	}

	async onStepStart(stepIndex: number): Promise<void> {
		try {
			await transaction(async (txn) => {
				await txn.pipelines.updateJobRunStep(
					this.workflowRunId,
					this.jobRunId,
					stepIndex,
					{
						status: JobRunStepStatus.incomplete,
						started_at: new Date(),
					},
				);
			});
		} catch (err) {
			log.error(
				{
					err,
					workflowRunId: this.workflowRunId,
					jobRunId: this.jobRunId,
					stepIndex,
				},
				"failed to record step start in db",
			);
		}
	}

	async onStepEnd(status: StepStatus): Promise<void> {
		try {
			await transaction(async (txn) => {
				await txn.pipelines.updateJobRunStep(
					this.workflowRunId,
					this.jobRunId,
					status.stepIndex,
					{
						status: status.status as JobRunStepStatus,
						finished_at: new Date(),
						exit_code: status.exitCode ?? null,
					},
				);
			});
		} catch (err) {
			log.error(
				{
					err,
					workflowRunId: this.workflowRunId,
					jobRunId: this.jobRunId,
					stepIndex: status.stepIndex,
				},
				"failed to record step end in db",
			);
		}
	}

	async onJobEnd(status: JobEndStatus): Promise<void> {
		await handleJobComplete(this.workflowRunId, this.jobRunId, status.success);
	}
}
