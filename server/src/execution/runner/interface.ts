export interface DockerError {
	statusCode?: number;
}

export interface RunnerStep {
	image?: string;
	command: string;
}

export interface RunnerJob {
	id: string;
	steps: RunnerStep[];
} // id = `${workflowRunId}/${jobRunId}` for logging
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
	runJob(job: RunnerJob, reporter: IProgressReporter): Promise<void>;

	/**
	 * Cancel a running job.
	 */
	cancelJob(job: null): Promise<void>;
}

/**
 * Handle given to the runner to report progress back.
 */
// TODO THIS IS TEMPORARY
export interface IProgressReporter {
	onLog(line: string): void;
}
