import type { Logger } from "pino";
import type { IProgressReporter } from "./interface";

/**
 * TEMPORARY: Basic progress reporter that logs to pino.
 * Will be replaced with a proper streaming reporter later.
 */
export class PinoProgressReporter implements IProgressReporter {
	constructor(private logger: Logger) {}

	onLog(line: string): void {
		this.logger.info({ line });
	}
}
