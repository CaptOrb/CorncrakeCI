import type { Logger } from "pino";
import type { IProgressReporter, JobEndStatus, StepStatus } from "./interface";

/**
 * TEMPORARY: Basic progress reporter that logs to pino.
 * Will be replaced with a proper streaming reporter later.
 */
export class PinoProgressReporter implements IProgressReporter {
	constructor(private logger: Logger) {}

	onLog(line: string): void {
		this.logger.info({ line });
	}

	onStepEnd(status: StepStatus): void {
		this.logger.info(
			{
				stepIndex: status.stepIndex,
				status: status.status,
				exitCode: status.exitCode,
				error: status.error,
			},
			"step ended",
		);
	}

	onJobEnd(status: JobEndStatus): void {
		if (status.success) {
			this.logger.info("job succeeded");
		} else {
			this.logger.error(
				{
					steps: status.steps,
					error: status.error,
				},
				"job failed",
			);
		}
	}
}
