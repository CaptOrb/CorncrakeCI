import { type Runner, run, type TaskList } from "graphile-worker";
import type { Pool } from "pg";
import { createLogger } from "../util/logging";
import { refresh_tokens } from "./refresh-tokens";
import { setup_webhooks } from "./setup-webhooks";

const log = createLogger(import.meta.url);

const taskList: TaskList = {
	setup_webhooks,
	refresh_tokens,
};

export async function runJobs(pgPool: Pool) {
	let runner: Runner;
	try {
		runner = await run({
			pgPool,
			pollInterval: 2000,
			noPreparedStatements: false,
			schema: "graphile_worker",
			concurrency: 5,
			taskList,
		});

		runner.events.on("job:success", ({ worker, job }) => {
			log.info({ workerId: worker.workerId, jobId: job.id }, "Job completed");
		});

		runner.events.on("job:error", ({ worker, job, error }) => {
			log.error(
				{ workerId: worker.workerId, jobId: job.id, err: error },
				"Job failed",
			);
		});

		await runner.promise;
	} catch (err) {
		log.error({ err }, "Graphile Worker error");
		return;
	}
}
