import crypto from "node:crypto";
import type { JobHelpers } from "graphile-worker";
import * as v from "valibot";
import { config } from "../config";
import { transaction } from "../db/stores";
import { mustGetForge } from "../services/forges";
import { decrypt } from "../util/crypto";

export const SetupWebhooksJobPayload = v.object({
	repoId: v.number(),
});
export type SetupWebhooksJobPayload = v.InferOutput<
	typeof SetupWebhooksJobPayload
>;

export async function setup_webhooks(payload: unknown, helpers: JobHelpers) {
	const { repoId } = v.parse(SetupWebhooksJobPayload, payload);
	helpers.logger.info(`Setting up webhooks for repo ${repoId}`);

	try {
		const repoResult:
			| {
					forge_id: number;
					forge_repo_id: string;
					forge_user_id: string;
					access_token: Buffer | null;
					webhook_secret: string | null;
			  }
			| undefined = await transaction(async (txn) => {
			const result = await txn.client.query(
				`SELECT r.forge_id, r.forge_repo_id, u.forge_user_id, tokens.access_token, r.webhook_secret
				FROM repositories r
				JOIN users u ON r.owner_id = u.user_id
				LEFT JOIN forge_access_tokens tokens ON u.user_id = tokens.user_id
				WHERE r.repo_id = $1`,
				[repoId],
			);
			return result.rows[0];
		});

		if (!repoResult) {
			helpers.logger.error(`Repository ${repoId} not found`);
			return;
		}

		if (!repoResult.access_token) {
			helpers.logger.error(`No access token found`);
			return;
		}

		// If webhook already exists, skip creation to avoid duplicates
		if (repoResult.webhook_secret !== null) {
			helpers.logger.info(
				`Webhook already exists for repo ${repoId}, skipping creation`,
			);
			return;
		}
		// Decrypt token from BYTEA (Buffer)
		const accessToken = decrypt(
			repoResult.access_token,
			config.app.encryptionkey,
		);

		const forge = mustGetForge(repoResult.forge_id).withUser(accessToken);

		const webhookUrl = `${config.app.baseurl}/api/_webhooks/${repoId}`;

		const webhookSecret = secureRandomBase64Url();

		const webhook = await forge.createWebhook(
			repoResult.forge_repo_id,
			webhookUrl,
			webhookSecret,
		);

		await transaction(async (txn) => {
			await txn.client.query(
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

		await transaction(async (txn) => {
			await txn.client.query(
				`
			UPDATE repositories
			SET webhook_secret = NULL,
				updated_at = NOW()
			WHERE repo_id = $1
			`,
				[repoId],
			);
		});
		throw error; // so the graphile job system knows it has failed and will retry it
	}
}

function secureRandomBase64Url(bytes = 32) {
	return crypto
		.randomBytes(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
