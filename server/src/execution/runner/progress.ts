import type { Logger } from "pino";
import type { IProgressReporter, JobEndStatus } from "./interface";

/**
 * TEMPORARY: Basic progress reporter that logs to pino.
 * Will be replaced with a proper streaming reporter later.
 */
export class PinoProgressReporter implements IProgressReporter {
	constructor(private logger: Logger) {}

	onLog(line: string): void {
		this.logger.info({ line });
	}

	onJobEnd(status: JobEndStatus): void {
		if (status.success) {
			this.logger.info("job succeeded");
		} else {
			this.logger.error(
				{
					exitCode: status.exitCode,
					error: status.error,
				},
				"job failed",
			);
		}
	}
}
