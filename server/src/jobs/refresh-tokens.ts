import type { JobHelpers } from "graphile-worker";
import * as v from "valibot";
import { config } from "../config";
import { transaction } from "../db/stores";
import { mustGetForge, userTokenMutexes } from "../services/forges";
import { findUserById, getTokenInfo, updateTokens } from "../services/user";

export const RefreshTokensPayload = v.object({
	userId: v.number(),
});
export type RefreshTokensPayload = v.InferOutput<typeof RefreshTokensPayload>;

export async function refresh_tokens(payload: unknown, helpers: JobHelpers) {
	const { userId } = v.parse(RefreshTokensPayload, payload);
	helpers.logger.info(`Refreshing tokens for user ${userId}`);

	// Lock the user for token refreshes, so that we don't race with a user request
	// refreshing at the same time.
	using _lock = await userTokenMutexes.lock(userId);

	try {
		const user = await findUserById(userId);
		const tokenInfo = await getTokenInfo(userId);

		if (tokenInfo === null) {
			helpers.logger.error("No token found for the user");
			return;
		}

		const forge = mustGetForge(user!.forge_id);
		const newTokens = await forge.refreshAccessToken(tokenInfo.refreshToken);

		await updateTokens(
			userId,
			newTokens.accessToken,
			newTokens.accessTokenExpiresAt,
			newTokens.refreshToken,
			newTokens.refreshTokenExpiresAt,
		);

		helpers.logger.info(`Successfully refreshed tokens for user ${userId}`);
	} catch (error) {
		helpers.logger.error(
			`Failed to refresh tokens for user ${userId}: ${error}`,
		);
		throw error;
	}
}

/**
 * Schedules (or replaces) a token refresh job for a user.
 * Uses a job_key to ensure only one refresh job exists per user.
 * https://worker.graphile.org/docs/sql-add-job
 * https://worker.graphile.org/docs/job-key#replacingupdating-jobs
 */
export async function scheduleRefreshTokenJob(
	userId: number,
	refreshTokenExpiresAt: Date,
): Promise<void> {
	const thresholdMs = config.app.refreshtokenthreshold * 1000;
	const runAt = new Date(refreshTokenExpiresAt.getTime() - thresholdMs);

	await transaction(async (txn) => {
		await txn.client.query(
			`SELECT graphile_worker.add_job(
				'refresh_tokens',
				$1,
				job_key := $2,
				run_at := $3
			)`,
			[{ userId } satisfies RefreshTokensPayload, `refresh:${userId}`, runAt],
		);
	});
}
