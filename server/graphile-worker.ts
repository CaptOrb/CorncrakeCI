import { run, type Task } from "graphile-worker";
import preset from "./graphile.config";

const taskList = {
    setup_webhooks: async (payload: unknown, helpers) => {
        const { repoId, ownerId } = payload as { repoId: string; ownerId: string };
        helpers.logger.info(`Setting up webhooks for repo ${repoId}`);
    },
};

async function main() {
    const runner = await run({
        ...preset.worker,
        taskList,
    });

    runner.events.on("job:success", ({ worker, job }) => {
        console.log(`Worker ${worker.workerId} completed job ${job.id}`);
    });

    await runner.promise;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
