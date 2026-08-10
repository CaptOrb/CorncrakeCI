import { config } from "../../config";
import JobRunStatus from "../../db/schema/public/JobRunStatus";
import type { JobRunId } from "../../db/schema/public/JobRuns";
import type { PipelineRunId } from "../../db/schema/public/PipelineRuns";
import type { RepoId } from "../../db/schema/public/Repositories";
import type { WorkflowRunId } from "../../db/schema/public/WorkflowRuns";
import { transaction } from "../../db/stores";
import { getForgeWithUser } from "../../services/forges";
import { createLogger } from "../../util/logging";
import { isSubsetOrEqual } from "../../util/set";
import type { PlannedJob, PlannedWorkflow } from "../plan";
import type { IRunner } from "../runner/interface";
import { toRunnerJob } from "../runner/mapper";
import { PinoProgressReporter } from "../runner/progress";

const log = createLogger(import.meta.url);

/**
 * Global variable holding the singleton Scheduler used by the application.
 */
let theGlobalScheduler: Scheduler | null = null;

export function globalScheduler(): Scheduler {
	if (theGlobalScheduler === null) {
		throw new Error("global scheduler not set up!");
	}
	return theGlobalScheduler;
}

export function setGlobalScheduler(scheduler: Scheduler): {
	deregister: () => void;
} {
	if (theGlobalScheduler !== null) {
		throw new Error("global scheduler already set up!");
	}

	theGlobalScheduler = scheduler;

	return {
		// Used by the test suite to unset the global scheduler again.
		// Not intended to be used in production.
		deregister() {
			theGlobalScheduler = null;
		},
	};
}

/**
 * Specification of constraints for scheduling a job.
 */
export interface ScheduleConstraints {
	/**
	 * What resources the job needs whilst running.
	 */
	resources: ResourceRequest;

	/**
	 * Runner must advertise ALL of these capabilities.
	 *
	 * Loosely based off Kubernetes node selectors.
	 *
	 * Examples:
	 * - arch:amd64
	 * - os:linux
	 * - disk:ssd
	 */
	needs: Set<string>;

	/**
	 * Runner may have these taints and the job will still be scheduled there.
	 * Without a matching toleration, a tainted runner is skipped.
	 *
	 * Loosely based off Kubernetes tolerations.
	 *
	 * Examples:
	 * - has:gpu
	 */
	tolerates: Set<string>;
}

/**
 * A set of resources.
 */
export interface ResourceRequest {
	/**
	 * How many CPUs should be allocated, in milliCPUs (1/1000 CPU).
	 */
	milliCpu: number;

	/**
	 * How many megabytes of RAM should be allocated.
	 */
	megabyteMemory: number;

	/**
	 * How many megabytes of disk space should be allocated.
	 */
	megabyteDisk: number;
}

/**
 * The attributes of a runner that let us decide whether to run jobs there or not.
 */
interface RunnerProfile {
	/**
	 * Attributes that jobs can use to be run here.
	 */
	capabilities: Set<string>;

	/**
	 * Attributes that will repel jobs from running here unless they have tolerations for all of them.
	 */
	taints: Set<string>;
}

/**
 * The resource limits desired to be applied to a runner.
 */
interface RunnerResourceLimit {
	/**
	 * Maximum number of CPUs to allocate to jobs, in milliCPUs.
	 */
	milliCpu: number;

	/**
	 * Maximum amount of RAM to allocate to jobs, in megabytes.
	 */
	megabyteMemory: number;

	/**
	 * Maximum amount of disk space to allocate to jobs, in megabytes.
	 */
	megabyteDisk: number;

	/**
	 * Maximum number of jobs to schedule on the runner at once.
	 */
	numJobs: number;
}

export interface Runner {
	name: string;

	profile: RunnerProfile;
	resourceLimit: RunnerResourceLimit;

	allocated: ResourceRequest;

	activeJobs: Set<SchedulingJob>;

	instance: IRunner;
}

async function handleJobComplete(
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

async function createCommitStatus(
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

/**
 * Tests whether we can schedule a job with the given constraints
 * on a given runner.
 */
export function canScheduleJobOnRunner(
	jobConstraints: ScheduleConstraints,
	runner: Runner,
): boolean {
	if (!isSubsetOrEqual(jobConstraints.needs, runner.profile.capabilities)) {
		// e.g. the job needs `arch:amd64` but the runner doesn't have it (maybe it
		// has `arch:riscv32`).
		log.trace(
			{ runner, jobConstraints },
			"can't schedule job on this runner: job needs capabilities that this runner doesn't have",
		);
		return false;
	}

	if (!isSubsetOrEqual(runner.profile.taints, jobConstraints.tolerates)) {
		// e.g. the runner has an `expensive` taint that repels the job because
		// the job can't tolerate it
		log.trace(
			{ runner, jobConstraints },
			"can't schedule job on this runner: job doesn't have toleration for runner taint",
		);
		return false;
	}

	const newAllocated: ResourceRequest = {
		milliCpu: runner.allocated.milliCpu + jobConstraints.resources.milliCpu,
		megabyteMemory:
			runner.allocated.megabyteMemory + jobConstraints.resources.megabyteMemory,
		megabyteDisk:
			runner.allocated.megabyteDisk + jobConstraints.resources.megabyteDisk,
	};

	if (newAllocated.milliCpu > runner.resourceLimit.milliCpu) {
		log.trace(
			{ runner, jobConstraints },
			"can't schedule job on this runner: not enough CPU allocatable",
		);
		return false;
	}

	if (newAllocated.megabyteMemory > runner.resourceLimit.megabyteMemory) {
		log.trace(
			{ runner, jobConstraints },
			"can't schedule job on this runner: not enough memory allocatable",
		);
		return false;
	}

	if (newAllocated.megabyteDisk > runner.resourceLimit.megabyteDisk) {
		log.trace(
			{ runner, jobConstraints },
			"can't schedule job on this runner: not enough disk allocatable",
		);
		return false;
	}

	if (runner.activeJobs.size >= runner.resourceLimit.numJobs) {
		log.trace(
			{ runner },
			"can't schedule job on this runner: runner already running max number of jobs",
		);
		return false;
	}

	return true;
}

export interface SchedulingJob {
	constraints: ScheduleConstraints;

	workflow: WorkflowRunId;
	plannedJob: PlannedJob;
}

interface SchedulingWorkflow {
	jobs: Map<JobRunId, SchedulingJob>;
}

/**
 * The Scheduler is responsible for tracking ready jobs
 * and finding them runners to run on.
 */
export class Scheduler {
	/**
	 * Jobs that are ready to be scheduled.
	 */
	private readyJobs: Set<SchedulingJob> = new Set();

	/**
	 * Runners that we can schedule jobs against.
	 */
	private runners: Runner[] = [];

	constructor(runner?: IRunner) {
		if (runner) {
			this.runners.push({
				name: "default",
				profile: {
					capabilities: new Set(),
					taints: new Set(),
				},
				// TODO come back to this
				resourceLimit: {
					milliCpu: 999999,
					megabyteMemory: 999999,
					megabyteDisk: 999999,
					numJobs: 999999,
				},
				allocated: {
					milliCpu: 0,
					megabyteMemory: 0,
					megabyteDisk: 0,
				},
				activeJobs: new Set(),
				instance: runner,
			});
		}
	}

	/**
	 * Information about workflows that are currently in the scheduler.
	 */
	private workflowInfo: Map<WorkflowRunId, SchedulingWorkflow> = new Map();

	/**
	 * Try to schedule some pending jobs now.
	 */
	private tryScheduleNow(): void {
		if (this.readyJobs.size === 0) {
			// Nothing to do
			return;
		}

		const scheduled: SchedulingJob[] = [];

		if (this.runners.length === 0) {
			log.warn(
				{ readyJobs: this.readyJobs.size },
				"Jobs are waiting to be scheduled but there are no runners",
			);
			return;
		}

		try {
			nextJob: for (const job of this.readyJobs) {
				for (const runner of this.runners) {
					if (!canScheduleJobOnRunner(job.constraints, runner)) {
						continue;
					}

					// Actually submit to the runner and track that we did
					const reporter = new PinoProgressReporter(
						log.child({ job: job.plannedJob.id }),
					);
					runner.instance
						.runJob(toRunnerJob(job.plannedJob), reporter)
						.then(() =>
							handleJobComplete(job.workflow, job.plannedJob.id, true),
						)
						.catch((err) => {
							log.warn({ err }, "job failed");
							return handleJobComplete(job.workflow, job.plannedJob.id, false);
						})
						.finally(() => this.tryScheduleNow());

					log.info({ job, runner: runner.name }, "job scheduled on runner");

					// Remove from the queue at end of iteration.
					scheduled.push(job);

					// This job is scheduled now, so don't iterate through
					// any more runners and instead try to schedule the next job.
					continue nextJob;
				}
			}
		} finally {
			scheduled.forEach((job) => {
				this.readyJobs.delete(job);
			});
		}
	}

	/**
	 * Get real-time information about a workflow that might be in the scheduler.
	 *
	 * Used to overlay the information in the database, when presenting real-time information
	 * to users.
	 */
	public getWorkflowStateOverlay(workflowRunId: WorkflowRunId): void {
		const workflowInfo = this.workflowInfo.get(workflowRunId);
		if (workflowInfo === undefined) {
			return;
		}
		/* TODO */
	}

	/**
	 * Get real-time information about a job that might be in the scheduler.
	 *
	 * Used to overlay the information in the database, when presenting real-time information
	 * to users.
	 */
	public getJobStateOverlay(
		workflowRunId: WorkflowRunId,
		jobRunId: JobRunId,
	): void {
		const workflowInfo = this.workflowInfo.get(workflowRunId);
		if (workflowInfo === undefined) {
			return;
		}
		const jobInfo = workflowInfo.jobs.get(jobRunId);
		if (jobInfo === undefined) {
			return;
		}
		/* TODO */
	}

	/**
	 * Schedule a workflow of jobs.
	 *
	 * The workflow must have already been persisted to the database and therefore
	 * must have an ID.
	 */
	public schedule(workflow: PlannedWorkflow): void {
		const jobs: Map<JobRunId, SchedulingJob> = new Map();

		if (workflow.id === undefined) {
			throw new Error(
				"tried to schedule a workflow that hasn't been persisted",
			);
		}

		// First build SchedulingJobs for each job
		for (const [_stageName, stage] of workflow.stages) {
			for (const [_jobName, plannedJob] of stage.jobs) {
				const schedulingJob: SchedulingJob = {
					constraints: {
						// TODO: Support resource allocations
						resources: {
							megabyteDisk: 4000,
							megabyteMemory: 4000,
							milliCpu: 4000,
						},
						// TODO Support capabilities
						needs: new Set(),
						// TODO Support tolerations
						tolerates: new Set(),
					},
					workflow: workflow.id,
					plannedJob,
				};
				jobs.set(plannedJob.id, schedulingJob);
			}
		}

		// Then attach dependencies between jobs at the scheduler level
		for (const [_stageName, stage] of workflow.stages) {
			for (const [_jobName, _plannedJob] of stage.jobs) {
				// TODO Support dependencies between jobs
			}
		}

		///// CRITICAL SECTION: Update scheduler state
		this.workflowInfo.set(workflow.id, {
			jobs,
		});

		// Place ready jobs into the ready queue
		for (const [_, schedulingJob] of jobs) {
			// TODO Support dependencies between jobs: check if it's ready first

			this.readyJobs.add(schedulingJob);
		}
		///// CRITICAL SECTION END

		// Trigger a scheduling attempt, to start running the new jobs straight away
		this.tryScheduleNow();
	}
}
