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
	runJob(
		job: null /* TODO */,
		progressReporter: IProgressReporter,
	): Promise<void>;

	/**
	 * Cancel a running job.
	 */
	cancelJob(job: null): Promise<void>;
}

/**
 * Handle given to the runner to report progress back.
 */
export type IProgressReporter = never; // TODO
