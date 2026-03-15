import type { JobHelpers } from "graphile-worker";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transaction } from "../../src/db/stores";
import {
	refresh_tokens,
	scheduleRefreshTokenJob,
} from "../../src/jobs/refresh-tokens";
import { databaseHelper } from "../helpers/database";
import { testForgeHelper } from "../helpers/forge";

describe("Token auto-refresh", () => {
	let pool: Pool;

	databaseHelper((p) => {
		pool = p;
	});

	testForgeHelper();

	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * Insert a user with tokens directly via the store (bypasses service layer,
	 * so no refresh job is scheduled as a side-effect).
	 */
	async function createUserWithTokens(opts: {
		accessTokenExpiresAt: Date;
		refreshTokenExpiresAt: Date;
	}) {
		return transaction(async (txn) => {
			return txn.users.getOrCreateUser(
				1,
				"test_user_1",
				"testuser",
				"testAccessToken",
				opts.accessTokenExpiresAt,
				"testRefreshToken",
				opts.refreshTokenExpiresAt,
			);
		});
	}

	function makeHelpers(): JobHelpers {
		return {
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			},
		} as unknown as JobHelpers;
	}

	describe("scheduleRefreshTokenJob", () => {
		it("schedules job at expiry minus threshold", async () => {
			// Default refreshtokenthreshold is 1209600s (14 days)
			const thresholdSec = 1209600;
			const expiresAt = new Date("2100-06-01T00:00:00Z");
			const expectedRunAt = new Date(expiresAt.getTime() - thresholdSec * 1000);

			await scheduleRefreshTokenJob(42, expiresAt);

			const result = await pool.query(
				`SELECT j.run_at, pj.payload
				 FROM graphile_worker.jobs j
				 JOIN graphile_worker._private_jobs pj ON pj.id = j.id
				 WHERE j.task_identifier = 'refresh_tokens'
				 AND j.key = $1`,
				["refresh:42"],
			);

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0].run_at).toEqual(expectedRunAt);
			expect(result.rows[0].payload).toEqual({ userId: 42 });
		});

		it("replaces an existing job for the same user", async () => {
			const firstExpiry = new Date("2100-06-01T00:00:00Z");
			const secondExpiry = new Date("2100-07-01T00:00:00Z");
			const thresholdSec = 1209600;

			await scheduleRefreshTokenJob(42, firstExpiry);
			await scheduleRefreshTokenJob(42, secondExpiry);

			const result = await pool.query(
				`SELECT run_at
				 FROM graphile_worker.jobs
				 WHERE task_identifier = 'refresh_tokens'
				 AND key = $1`,
				["refresh:42"],
			);

			expect(result.rows).toHaveLength(1);
			const expectedRunAt = new Date(
				secondExpiry.getTime() - thresholdSec * 1000,
			);
			expect(result.rows[0].run_at).toEqual(expectedRunAt);
		});
	});

	describe("refresh_tokens job handler", () => {
		it("refreshes tokens and stores new values", async () => {
			const user = await createUserWithTokens({
				accessTokenExpiresAt: new Date("2100-01-01T00:00:00Z"),
				refreshTokenExpiresAt: new Date("2100-06-01T00:00:00Z"),
			});

			await refresh_tokens({ userId: user.user_id }, makeHelpers());

			// Verify tokens were updated in the DB
			const tokens = await transaction(async (txn) =>
				txn.users.getTokenInfo(user.user_id),
			);

			expect(tokens).not.toBeNull();
			// TestForge.refreshAccessToken returns "refreshedAccessToken" and "newRefreshToken"
			expect(tokens!.accessToken).toBe("refreshedAccessToken");
			expect(tokens!.refreshToken).toBe("newRefreshToken");
		});

		it("schedules a new refresh job after refreshing", async () => {
			const user = await createUserWithTokens({
				accessTokenExpiresAt: new Date("2100-01-01T00:00:00Z"),
				refreshTokenExpiresAt: new Date("2100-06-01T00:00:00Z"),
			});

			await refresh_tokens({ userId: user.user_id }, makeHelpers());

			const result = await pool.query(
				`SELECT run_at
				 FROM graphile_worker.jobs
				 WHERE task_identifier = 'refresh_tokens'
				 AND key = $1`,
				[`refresh:${user.user_id}`],
			);

			expect(result.rows).toHaveLength(1);
		});

		it("returns early when user has no tokens", async () => {
			// Create user without tokens (insert directly)
			const user = await transaction(async (txn) =>
				txn.users.insertUser(1, "no_token_user", "notokenuser"),
			);

			const helpers = makeHelpers();
			// Should not throw - just logs and returns
			await refresh_tokens({ userId: user.user_id }, helpers);

			expect(helpers.logger.error).toHaveBeenCalledWith(
				"No token found for the user",
			);
		});

		it("handles expired refresh token gracefully", async () => {
			vi.useFakeTimers();
			// Set "now" to a fixed point
			const now = new Date("2025-06-01T00:00:00Z");
			vi.setSystemTime(now);

			const user = await createUserWithTokens({
				accessTokenExpiresAt: new Date("2025-05-01T00:00:00Z"), // already expired
				refreshTokenExpiresAt: new Date("2025-05-15T00:00:00Z"), // already expired
			});

			const helpers = makeHelpers();
			// getTokenInfo returns null when refresh token is expired
			await refresh_tokens({ userId: user.user_id }, helpers);

			expect(helpers.logger.error).toHaveBeenCalledWith(
				"No token found for the user",
			);
		});
	});
});
