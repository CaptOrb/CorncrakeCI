import { type Helpers, JobHelpers, run, TaskList } from "graphile-worker";
import preset from "./graphile.config";

const taskList: TaskList = {
	setup_webhooks: async (payload: unknown, helpers : JobHelpers) => {
		const { repoId } = payload as { repoId: string; ownerId: string };
		helpers.logger.info(`Setting up webhooks for repo ${repoId}`);
	},
};

export async function runJobs() {
	const runner = await run({
		...preset.worker,
		taskList,
	});

	runner.events.on("job:success", ({ worker, job }) => {
		console.log(`Worker ${worker.workerId} completed job ${job.id}`);
	});

	await runner.promise;
}
