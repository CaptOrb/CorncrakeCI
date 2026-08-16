import type { PlannedUserJob } from "../plan";

export interface DockerError {
	statusCode?: number;
}

/**
 * Handle to a runner.
 */
export interface IRunner {
	/**
	 * Initialise the runner.
	 *
	 * Will only be called once at a time.
	 * If initialisation fails, will be called again.
	 *
	 * Until this returns successfully, jobs will not be scheduled onto the runner.
	 */
	initialise(): Promise<void>; // TODO 'ensure initialise' pattern...

	/**
	 * Runs the given job, including all of its substeps.
	 *
	 * The caller should wrap this in exception handling to catch errors
	 * that occur whilst contacting the runner.
	 *
	 * TODO timeouts, resources, ...
	 */
	runJob(job: PlannedUserJob, reporter: IProgressReporter): Promise<void>;

	/**
	 * Cancel a running job.
	 */
	cancelJob(job: null): Promise<void>;
}

export interface StepStatus {
	/**
	 * Index of the step within the job's steps
	 */
	stepIndex: number;
	status:
		| "succeeded"
		| "failed"
		| "skipped_condition"
		| "skipped_prerequisite"
		| "cancelled"
		| "timed_out";
	exitCode?: number;
	error?: string;
}

/**
 * Status reported when a job finishes
 * Success and error should be derived from steps?
 */
export interface JobEndStatus {
	/** Whether or not the job completed all steps successfully */
	success: boolean;
	/** Status for each step that was attempted*/
	steps: StepStatus[];
	/** Error message, if the job failed*/
	error?: string;
}

/**
 * Handle given to the runner to report progress back.
 */
// TODO THIS IS TEMPORARY
export interface IProgressReporter {
	onLog(line: string): void;
	onStepEnd(status: StepStatus): void;
	onJobEnd(status: JobEndStatus): void;
}
