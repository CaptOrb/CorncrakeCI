import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForgeId } from "../src/db/schema/public/Forges";
import type { UserId } from "../src/db/schema/public/Users";
import { transaction } from "../src/db/stores";
import {
	getForge,
	getForgeWithUser,
	listAvailableForgeIds,
	listAvailableForges,
	mustGetForge,
} from "../src/services/forges";
import { AuthError } from "../src/services/forges/errors";
import type { TestForge } from "./helpers/forge";
import { databaseHelper } from "./helpers/database";
import { testForgeHelper } from "./helpers/forge";

const TEST_FORGE_ID = 1 as ForgeId;
const UNKNOWN_FORGE_ID = 999 as ForgeId;
const UNKNOWN_USER_ID = 99999 as UserId;

describe("Forge service tests", () => {
	databaseHelper();
	testForgeHelper();

	afterEach(() => vi.restoreAllMocks())

	async function createUserWithTokens(opts?: {
		forgeUserId?: string;
		forgeUsername?: string;
		accessToken?: string;
		accessTokenExpiresAt?: Date;
		refreshToken?: string;
		refreshTokenExpiresAt?: Date;
	}) {
		const {
			forgeUserId = "test_user",
			forgeUsername = "testuser",
			accessToken = "testAccessToken",
			accessTokenExpiresAt = new Date(Date.now() + 3_600_000),
			refreshToken = "testRefreshToken",
			refreshTokenExpiresAt = new Date(Date.now() + 86_400_000),
		} = opts ?? {};

		return transaction(async (txn) => {
			return txn.users.getOrCreateUser(
				TEST_FORGE_ID,
				forgeUserId,
				forgeUsername,
				accessToken,
				accessTokenExpiresAt,
				refreshToken,
				refreshTokenExpiresAt,
			);
		});
	}

	it("gets and lists configured forges", () => {
		const forge = mustGetForge(TEST_FORGE_ID);

		expect(getForge(TEST_FORGE_ID)).toBe(forge);
		expect(getForge(UNKNOWN_FORGE_ID)).toBeNull();

		expect(listAvailableForgeIds()).toEqual([TEST_FORGE_ID]);
		expect(listAvailableForges()).toEqual([
			{
				id: TEST_FORGE_ID,
				forge,
			},
		]);
	});

	it("throws when getting a missing forge", () => {
		expect(() => mustGetForge(UNKNOWN_FORGE_ID)).toThrow(
			`Forge with ID ${UNKNOWN_FORGE_ID} not found.`,
		);
	});


	it("refreshes tokens when the access token is expiring", async () => {
		const user = await createUserWithTokens({
			accessTokenExpiresAt: new Date(Date.now() + 60_000),
		});
		const forge = mustGetForge(TEST_FORGE_ID) as TestForge;
		// spyOn observes a functions behaviour without changing it, in this test, we want to see whether refreshAccessToken was called
		const refreshSpy = vi.spyOn(forge, "refreshAccessToken");

		const forgeWithUser = await getForgeWithUser(user.user_id);

		expect(refreshSpy).toHaveBeenCalledWith("testRefreshToken");
		expect(forgeWithUser.getForgeId()).toBe(TEST_FORGE_ID);

		const tokenInfo = await transaction(async (txn) => {
			return txn.users.getTokenInfo(user.user_id);
		});

		expect(tokenInfo).not.toBeNull();
		expect(tokenInfo?.accessToken).toBe("refreshedAccessToken");
		expect(tokenInfo?.refreshToken).toBe("newRefreshToken");
	});

	it("refreshes tokens when the access token has already expired", async () => {
		const user = await createUserWithTokens({
			accessTokenExpiresAt: new Date(Date.now() - 1_000),
		});
		const forge = mustGetForge(TEST_FORGE_ID) as TestForge;
		const refreshSpy = vi.spyOn(forge, "refreshAccessToken");

		const forgeWithUser = await getForgeWithUser(user.user_id);

		expect(refreshSpy).toHaveBeenCalledWith("testRefreshToken");
		expect(forgeWithUser.getForgeId()).toBe(TEST_FORGE_ID);

		const tokenInfo = await transaction(async (txn) => {
			return txn.users.getTokenInfo(user.user_id);
		});

		expect(tokenInfo).not.toBeNull();
		expect(tokenInfo?.accessToken).toBe("refreshedAccessToken");
		expect(tokenInfo?.refreshToken).toBe("newRefreshToken");
	});

	it("throws AuthError when user does not exist", async () => {
		await expect(getForgeWithUser(UNKNOWN_USER_ID))
			.rejects.toThrow(new AuthError("User not found"));
	});

	it("throws AuthError when user has no stored tokens", async () => {
		const user = await transaction(async (txn) => {
			return txn.users.insertUser(TEST_FORGE_ID, "no_token_user", "notokenuser");
		});

		await expect(getForgeWithUser(user.user_id))
			.rejects.toThrow(new AuthError("No tokens found for user"));
	});

	it("throws AuthError when token refresh fails", async () => {
		const user = await createUserWithTokens({
			accessTokenExpiresAt: new Date(Date.now() + 60_000),
		});
		const forge = mustGetForge(TEST_FORGE_ID) as TestForge;
		vi.spyOn(forge, "refreshAccessToken").mockRejectedValue(
			new Error("refresh failed"),
		);

		await expect(getForgeWithUser(user.user_id))
			.rejects.toThrow(new AuthError("Failed to refresh token"));
	});

});
