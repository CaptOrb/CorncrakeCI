import type { Readable } from "node:stream";
import type { LogsConfig } from "../../config/schema";
import type { JobRunId } from "../../db/schema/public/JobRuns";
import type { WorkflowRunId } from "../../db/schema/public/WorkflowRuns";

export interface LogLocation {
	workflowRunId: WorkflowRunId;
	jobRunId: JobRunId;
	stepIndex: number;
}

export interface LogReadResult {
	body: Buffer;
	totalSize: number;
	isPartial: boolean;
}

/** Producer side. Used only by the runner write path. */
export interface LogWriter {
	write(loc: LogLocation, chunk: Buffer): void; // append (buffered)
	flush(loc: LogLocation): Promise<void>;
	seal(loc: LogLocation): Promise<void>; // step done: flush + signal EOF
}

/** Consumer side. The only storage dependency of the log HTTP APIs. */
export interface LogReader {
	size(loc: LogLocation): Promise<number>; // logical (uncompressed) size
	read(
		loc: LogLocation,
		start: number,
		endExclusive?: number,
	): Promise<LogReadResult>;
	subscribe(
		loc: LogLocation,
		fromOffset: number,
	): { stream: Readable; unsubscribe(): void };
}

export class LocalDiskLogStore implements LogWriter, LogReader {
	private readonly root: string;
	constructor(config: LogsConfig) {
		this.root = config.root;
	}

	seal(loc: LogLocation): Promise<void> {
		throw new Error("Method not implemented.");
	}
	size(loc: LogLocation): Promise<number> {
		throw new Error("Method not implemented.");
	}
	read(
		loc: LogLocation,
		start: number,
		endExclusive?: number,
	): Promise<LogReadResult> {
		throw new Error("Method not implemented.");
	}
	subscribe(
		loc: LogLocation,
		fromOffset: number,
	): { stream: Readable; unsubscribe(): void } {
		throw new Error("Method not implemented.");
	}
	write(loc: LogLocation, chunk: Buffer): void {
		throw new Error("Method not implemented.");
	}

	async flush(loc: LogLocation): Promise<void> {
		// TODO
	}
}
