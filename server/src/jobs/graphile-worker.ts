import { type JobHelpers, run, type TaskList } from "graphile-worker";
import { config } from "../config";
import { txn } from "../db/stores";
import { createForge } from "../services/forges";
import crypto from 'crypto';
import { error } from "console";

const taskList: TaskList = {
	setup_webhooks: async (payload: unknown, helpers: JobHelpers) => {
		const { repoId } = payload as { repoId: string; ownerId: string };
		helpers.logger.info(`Setting up webhooks for repo ${repoId}`);

		try {
			const repoResult = await txn(async (tx) => {
				const result = await tx.client.query(
					`SELECT r.forge_id, r.forge_repo_id, u.forge_user_id, u.access_token, f.base_url
					FROM repositories r
					JOIN users u ON r.owner_id = u.user_id
					JOIN forges f ON u.forge_id = f.forge_id
					WHERE r.repo_id = $1`,
					[repoId],
				);
				return result.rows[0];
			});

			if (!repoResult) {
				helpers.logger.error(`Repository ${repoId} not found`);
				return;
			}

			const accessToken = repoResult.access_token;
			if (!accessToken) {
				helpers.logger.error(`No access token found`);
				return;
			}

			const forge = createForge(repoResult.forge_id);

			const webhookUrl = `${repoResult.base_url.replace("/api/v1", "")}/webhooks/gitea`;

			const webhookSecret = secureRandomBase64Url();

			const webhook = await forge.createWebhook(
				accessToken,
				repoResult.forge_repo_id,
				webhookUrl,
				webhookSecret,
			);

			await txn(async (tx) => {
				await tx.client.query(
					`
					UPDATE repositories
					SET
						webhook_secret = $1,
						updated_at    = NOW()
					WHERE repo_id = $2
					`,
					[webhookSecret, repoId],
				);
			});

			helpers.logger.info(
				`Successfully created webhook ${webhook.id} for repo ${repoId}`,
			);
		} catch (error) {
			helpers.logger.error(
				`Failed to setup webhook for repo ${repoId}: ${error}`,
			);

			await txn(async (tx) => {
			await tx.client.query(
				`
				UPDATE repositories
				SET webhook_secret = NULL,
					updated_at = NOW()
				WHERE repo_id = $1
				`,
				[repoId],
			);
			});
		}
		throw error;
	},
};

export async function runJobs() {
	const runner = await run({
		connectionString: config.db.connectionuri,
		maxPoolSize: 10,
		pollInterval: 2000,
		noPreparedStatements: false,
		schema: "graphile_worker",
		concurrency: 5,
		taskList,
	});

	runner.events.on("job:success", ({ worker, job }) => {
		console.log(`Worker ${worker.workerId} completed job ${job.id}`);
	});

	await runner.promise;
}

function secureRandomBase64Url(bytes = 32) {
  return crypto.randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}