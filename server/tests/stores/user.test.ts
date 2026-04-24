import { describe, expect, it } from "vitest";
import type { ForgeId } from "../../src/db/schema/public/Forges";
import type { UserId } from "../../src/db/schema/public/Users";
import { transaction } from "../../src/db/stores";
import { databaseHelper } from "../helpers/database";
import { testForgeHelper } from "../helpers/forge";

const TEST_FORGE_ID = 1 as ForgeId;
const MISSING_USER_ID = 99999 as UserId;

describe("UserStore database tests", () => {
	databaseHelper(); // Setup database
	testForgeHelper(); // Setup forge and insert it into the database

	it("should insert a new user", async () => {
		await transaction(async (txn) => {
			const user = await txn.users.insertUser(
				TEST_FORGE_ID,
				"test_user_1",
				"testuser1",
			);

			expect(user.forge_user_id).toBe("test_user_1");
			expect(user.forge_username).toBe("testuser1");
			expect(user.forge_id).toBe(TEST_FORGE_ID);
			expect(user.user_id).toBe(1);
			expect(user.user_id).toBeDefined();
			expect(typeof user.user_id).toBe("number");
		});
	});

	it("should find user by ID", async () => {
		let userId!: UserId;

		await transaction(async (txn) => {
			const user = await txn.users.insertUser(
				TEST_FORGE_ID,
				"find_by_id_user",
				"finduser",
			);
			userId = user.user_id;
		});

		await transaction(async (txn) => {
			const found = await txn.users.findUserById(userId);
			expect(found).not.toBeNull();
			expect(found!.forge_user_id).toBe("find_by_id_user");
			expect(found!.forge_id).toBe(TEST_FORGE_ID);
			expect(found!.user_id).toBe(userId);
		});
	});

	it("should find user by forge and forge_user_id", async () => {
		await transaction(async (txn) => {
			await txn.users.insertUser(
				TEST_FORGE_ID,
				"find_by_forge_user",
				"forgeuser",
			);
		});

		await transaction(async (txn) => {
			const found = await txn.users.findUserByForge(
				TEST_FORGE_ID,
				"find_by_forge_user",
			);
			expect(found).not.toBeNull();
			expect(found!.forge_user_id).toBe("find_by_forge_user");
			expect(found!.forge_id).toBe(TEST_FORGE_ID);
		});

		// Test non-existent user
		await transaction(async (txn) => {
			const notFound = await txn.users.findUserByForge(
				TEST_FORGE_ID,
				"non_existent",
			);
			expect(notFound).toBeNull();
		});
	});

	it("should return null when user not found by ID", async () => {
		await transaction(async (txn) => {
			const found = await txn.users.findUserById(MISSING_USER_ID);
			expect(found).toBeNull();
		});
	});

	it("should create a new user", async () => {
		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				TEST_FORGE_ID,
				"get_or_create_user",
				"getorcreateuser",
				"new_token",
				new Date("2100-01-01T00:00:00Z"),
				"refresh_token",
				new Date("2100-01-01T00:00:00Z"),
			);

			expect(user.forge_user_id).toBe("get_or_create_user");
			expect(user.forge_id).toBe(TEST_FORGE_ID);

			const tokens = await txn.users.getTokenInfo(user.user_id);
			expect(tokens!.accessToken).toBe("new_token");
		});
	});

	it("should return an existing user", async () => {
		let firstUserId!: UserId;

		// Create a user
		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				TEST_FORGE_ID,
				"existing_user",
				"existinguser",
				"original_token",
				new Date("2100-01-01T00:00:00Z"),
				"refresh_token",
				new Date("2100-01-01T00:00:00Z"),
			);
			firstUserId = user.user_id;
		});

		// Get the user again
		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				TEST_FORGE_ID,
				"existing_user",
				"existinguser",
				"updated_token",
				new Date("2100-01-01T00:00:00Z"),
				"refresh_token",
				new Date("2100-01-02T00:00:00Z"),
			);

			// Should return the same user ID
			expect(user.user_id).toBe(firstUserId);

			const tokens = await txn.users.getTokenInfo(user.user_id);
			expect(tokens!.accessToken).toBe("updated_token");
			expect(tokens!.accessTokenExpiresAt.toISOString()).toBe(
				"2100-01-01T00:00:00.000Z",
			);
			expect(tokens!.refreshToken).toBe("refresh_token");
			expect(tokens!.refreshTokenExpiresAt.toISOString()).toBe(
				"2100-01-02T00:00:00.000Z",
			);
		});
	});

	it("should get access and refresh token info for user", async () => {
		let userId!: UserId;
		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				TEST_FORGE_ID,
				"token_user",
				"tokenuser",
				"secret_token",
				new Date("2100-01-01T00:00:00Z"),
				"refresh_token",
				new Date("2100-02-01T00:00:00Z"),
			);
			userId = user.user_id;
		});
		await transaction(async (txn) => {
			const tokens = await txn.users.getTokenInfo(userId);
			expect(tokens!.accessToken).toBe("secret_token");
			expect(tokens!.accessTokenExpiresAt.toISOString()).toBe(
				"2100-01-01T00:00:00.000Z",
			);
			expect(tokens!.refreshToken).toBe("refresh_token");
			expect(tokens!.refreshTokenExpiresAt.toISOString()).toBe(
				"2100-02-01T00:00:00.000Z",
			);
		});
		// Test non-existent user
		await transaction(async (txn) => {
			const tokens = await txn.users.getTokenInfo(MISSING_USER_ID);
			expect(tokens).toBeNull();
		});
	});
});
