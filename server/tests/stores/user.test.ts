import { describe, expect, it } from "vitest";
import { transaction } from "../../src/db/stores";
import { databaseHelper } from "../helpers/database";
import { testForgeHelper } from "../helpers/forge";

describe("UserStore database tests", () => {
	databaseHelper(); // Setup database
	testForgeHelper(); // Setup forge and insert it into the database

	it("should insert a new user", async () => {
		await transaction(async (txn) => {
			const user = await txn.users.insertUser(1, "test_user_1");

			expect(user.forge_user_id).toBe("test_user_1");
			expect(user.forge_id).toBe(1);
			expect(user.user_id).toBe(1);
			expect(user.user_id).toBeDefined();
			expect(typeof user.user_id).toBe("number");
		});
	});

	it("should find user by ID", async () => {
		let userId: number;

		await transaction(async (txn) => {
			const user = await txn.users.insertUser(1, "find_by_id_user");
			userId = user.user_id;
		});

		await transaction(async (txn) => {
			const found = await txn.users.findUserById(userId!);
			expect(found).not.toBeNull();
			expect(found!.forge_user_id).toBe("find_by_id_user");
			expect(found!.forge_id).toBe(1);
			expect(found!.user_id).toBe(userId);
		});
	});

	it("should find user by forge and forge_user_id", async () => {
		await transaction(async (txn) => {
			await txn.users.insertUser(1, "find_by_forge_user");
		});

		await transaction(async (txn) => {
			const found = await txn.users.findUserByForge(1, "find_by_forge_user");
			expect(found).not.toBeNull();
			expect(found!.forge_user_id).toBe("find_by_forge_user");
			expect(found!.forge_id).toBe(1);
		});

		// Test non-existent user
		await transaction(async (txn) => {
			const notFound = await txn.users.findUserByForge(1, "non_existent");
			expect(notFound).toBeNull();
		});
	});

	it("should return null when user not found by ID", async () => {
		await transaction(async (txn) => {
			const found = await txn.users.findUserById(99999);
			expect(found).toBeNull();
		});
	});

	it("should create a new user", async () => {
		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				1,
				"get_or_create_user",
				"new_token",
				new Date("2100-01-01T00:00:00Z"),
				"refresh_token",
				new Date("2100-01-01T00:00:00Z"),
			);

			expect(user.forge_user_id).toBe("get_or_create_user");
			expect(user.forge_id).toBe(1);

			const token = await txn.users.getAccessToken(user.user_id);
			expect(token).toBe("new_token");
		});
	});

	it("should return an existing user", async () => {
		let firstUserId: number;

		// Create a user
		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				1,
				"existing_user",
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
				1,
				"existing_user",
				"updated_token",
				new Date("2100-01-01T00:00:00Z"),
				"refresh_token",
				new Date("2100-01-01T00:00:00Z"),
			);

			// Should return the same user ID
			expect(user.user_id).toBe(firstUserId);
			// Should update the access token
			const token = await txn.users.getAccessToken(user.user_id);
			expect(token).toBe("updated_token");
		});
	});

	it("should get access token for user", async () => {
		let userId: number;

		await transaction(async (txn) => {
			const user = await txn.users.getOrCreateUser(
				1,
				"token_user",
				"secret_token",
				new Date("2100-01-01T00:00:00Z"),
				"refresh_token",
				new Date("2100-01-01T00:00:00Z"),
			);
			userId = user.user_id;
		});

		await transaction(async (txn) => {
			const token = await txn.users.getAccessToken(userId!);
			expect(token).toBe("secret_token");
		});

		// Test non-existent user
		await transaction(async (txn) => {
			const token = await txn.users.getAccessToken(99999);
			expect(token).toBeNull();
		});
	});
});
