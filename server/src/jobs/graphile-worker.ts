import { type Runner, run, type TaskList } from "graphile-worker";
import type { Pool } from "pg";
import { setup_webhooks } from "./setup-webhooks";

const taskList: TaskList = {
	setup_webhooks,
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
			console.log(`Worker ${worker.workerId} completed job ${job.id}`);
		});

		runner.events.on("job:error", ({ worker, job, error }) => {
			console.error(`Worker ${worker.workerId} failed job ${job.id}:`, error);
		});

		await runner.promise;
	} catch (err) {
		console.error("Graphile Worker error: ", err);
		return;
	}
}
