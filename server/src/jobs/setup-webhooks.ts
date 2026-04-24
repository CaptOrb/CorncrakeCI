import crypto from "node:crypto";
import type { JobHelpers } from "graphile-worker";
import * as v from "valibot";
import { config } from "../config";
import type { RepoId } from "../db/schema/public/Repositories";
import { transaction } from "../db/stores";
import { mustGetForge } from "../services/forges";
import type { ForgeWithUser } from "../services/forges/forge";
import { decrypt } from "../util/crypto";

export const SetupWebhooksJobPayload = v.object({
	repoId: v.pipe(
		v.number(),
		v.transform((n) => n as RepoId),
	),
});
export type SetupWebhooksJobPayload = v.InferOutput<
	typeof SetupWebhooksJobPayload
>;

async function cleanupExistingWebhooks(
	forge: ForgeWithUser,
	repoId: RepoId,
	forgeRepoId: string,
	corncrakeciBaseUrl: string,
	helpers: JobHelpers,
): Promise<void> {
	try {
		const existingWebhooks = await forge.listWebhooks(forgeRepoId);
		const corncrakeciWebhookUrlPrefix = `${corncrakeciBaseUrl}/api/_webhooks/`;

		for (const webhook of existingWebhooks) {
			if (webhook.url?.startsWith(corncrakeciWebhookUrlPrefix)) {
				try {
					await forge.deleteWebhook(forgeRepoId, webhook.id);
					helpers.logger.info(
						`Deleted stale webhook ${webhook.id} for repo ${repoId}`,
					);
				} catch (error) {
					helpers.logger.warn(
						`Failed to delete webhook ${webhook.id}: ${error}`,
					);
				}
			}
		}
	} catch (error) {
		helpers.logger.warn(
			`Failed to list/cleanup webhooks for repo ${repoId}: ${error}`,
		);
		// Continue with webhook creation even if cleanup fails
	}
}

export async function setup_webhooks(payload: unknown, helpers: JobHelpers) {
	const { repoId } = v.parse(SetupWebhooksJobPayload, payload);
	helpers.logger.info(`Setting up webhooks for repo ${repoId}`);

	try {
		const repoResult = await transaction(async (txn) => {
			return await txn.repositories.getRepositoryForWebhookSetup(repoId);
		});

		if (!repoResult) {
			helpers.logger.error(`Repository ${repoId} not found`);
			return;
		}

		if (!repoResult.access_token) {
			helpers.logger.error(`No access token found`);
			return;
		}

		// Decrypt token from BYTEA (Buffer)
		const accessToken = decrypt(
			repoResult.access_token,
			config.app.encryptionkey,
		);

		const forgeOnly = mustGetForge(repoResult.forge_id);
		const forge = forgeOnly.withUser(accessToken);

		const webhookUrl = `${forgeOnly.corncrakeciBaseUrl}/api/_webhooks/${repoId}`;

		await cleanupExistingWebhooks(
			forge,
			repoId,
			repoResult.forge_repo_id,
			forgeOnly.corncrakeciBaseUrl,
			helpers,
		);

		const webhookSecret = secureRandomBase64Url();

		const webhook = await forge.createWebhook(
			repoResult.forge_repo_id,
			webhookUrl,
			webhookSecret,
		);

		await transaction(async (txn) => {
			await txn.repositories.updateWebhookSecret(repoId, webhookSecret);
		});

		helpers.logger.info(
			`Successfully created webhook ${webhook.id} for repo ${repoId}`,
		);
	} catch (error) {
		helpers.logger.error(
			`Failed to setup webhook for repo ${repoId}: ${error}`,
		);

		await transaction(async (txn) => {
			await txn.repositories.updateWebhookSecret(repoId, null);
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
