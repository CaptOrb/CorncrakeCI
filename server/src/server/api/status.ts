import JobRunStatus from "../../db/schema/public/JobRunStatus";
import WorkflowRunStatus from "../../db/schema/public/WorkflowRunStatus";
import type {
	t_ExecutionStatus,
	t_StepStatus,
} from "../../generated/server/models";

/** Statuses that mean a run has reached a final state. */
export function isTerminal(status: t_ExecutionStatus): boolean {
	return (
		status === "completed" ||
		status === "failed" ||
		status === "canceled" ||
		status === "skipped"
	);
}

/**
 * Maps a persisted job-run status to the API status.
 *
 * A DB `incomplete` job hasn't reached a terminal state, so we consult its
 * `started_at` to distinguish "pending" (not yet picked up) from "running".
 */
export function mapJobStatus(
	status: JobRunStatus,
	startedAt: Date | null,
): t_ExecutionStatus {
	switch (status) {
		case JobRunStatus.incomplete:
			return startedAt !== null ? "running" : "pending";
		case JobRunStatus.succeeded:
			return "completed";
		case JobRunStatus.failed:
		case JobRunStatus.timed_out:
			return "failed";
		case JobRunStatus.cancelled:
			return "canceled";
		case JobRunStatus.skipped_condition:
		case JobRunStatus.skipped_prerequisite:
			return "skipped";
	}
}

/**
 * Aggregates child run statuses into a single parent status.
 *
 * Used to derive a pipeline status from its workflows
 *
 * Precedence: any child still running (or a mix of finished and pending
 * children) makes the parent "running"
 */
export function aggregateStatus(
	children: readonly t_ExecutionStatus[],
): t_ExecutionStatus {
	if (children.length === 0) {
		return "pending";
	}
	if (children.includes("running")) {
		return "running";
	}
	if (children.includes("pending")) {
		// All pending means nothing has started; a mix means work is in flight.
		return children.every((s) => s === "pending") ? "pending" : "running";
	}
	// Every child is terminal from here.
	if (children.includes("failed")) {
		return "failed";
	}
	if (children.includes("canceled")) {
		return "canceled";
	}
	if (children.every((s) => s === "skipped")) {
		return "skipped";
	}
	return "completed";
}

/**
 * Maps a persisted workflow-run status to the API status.
 *
 * Terminal DB statuses map directly; an `incomplete` workflow is resolved from
 * its already-mapped job statuses.
 */
export function mapWorkflowStatus(
	status: WorkflowRunStatus,
	jobStatuses: readonly t_ExecutionStatus[],
): t_ExecutionStatus {
	switch (status) {
		case WorkflowRunStatus.succeeded:
			return "completed";
		case WorkflowRunStatus.failed:
		case WorkflowRunStatus.timed_out:
			return "failed";
		case WorkflowRunStatus.cancelled:
			return "canceled";
		case WorkflowRunStatus.incomplete:
			return aggregateStatus(jobStatuses);
	}
}

/**
 * Derives a step's status from its timestamps. job_run_steps has no status
 * column, so we can only tell pending / running / completed apart.
 */
export function deriveStepStatus(
	startedAt: Date | null,
	finishedAt: Date | null,
): t_StepStatus["status"] {
	if (finishedAt !== null) {
		return "completed";
	}
	if (startedAt !== null) {
		return "running";
	}
	return "pending";
}
