import type { Transaction } from "kysely";
import { config } from "../../config";
import { decrypt, encrypt } from "../../util/crypto";
import type Database from "../schema/Database";
import type { ForgeId } from "../schema/public/Forges";
import type { User, UserId } from "../schema/public/Users";

export interface StoredTokenInfo {
	accessToken: string;
	accessTokenExpiresAt: Date;
	refreshToken: string;
	refreshTokenExpiresAt: Date;
}

export class UserStore {
	constructor(private kysely: Transaction<Database>) {}

	async findUserById(userId: UserId): Promise<User | null> {
		const result = await this.kysely
			.selectFrom("users")
			.select(["user_id", "forge_id", "forge_user_id", "forge_username"])
			.where("user_id", "=", userId)
			.executeTakeFirst();
		return result ?? null;
	}

	async findUserByForge(
		forgeId: ForgeId,
		forgeUserId: string,
	): Promise<User | null> {
		const result = await this.kysely
			.selectFrom("users")
			.select(["user_id", "forge_id", "forge_user_id", "forge_username"])
			.where("forge_id", "=", forgeId)
			.where("forge_user_id", "=", forgeUserId)
			.executeTakeFirst();
		return result ?? null;
	}

	async insertUser(
		forgeId: ForgeId,
		forgeUserId: string,
		forgeUserName: string,
	): Promise<User> {
		const result = await this.kysely
			.insertInto("users")
			.values({
				forge_id: forgeId,
				forge_user_id: forgeUserId,
				forge_username: forgeUserName,
			})
			.returning(["user_id", "forge_id", "forge_user_id", "forge_username"])
			.executeTakeFirstOrThrow();
		return result;
	}

	async getOrCreateUser(
		forgeId: ForgeId,
		forgeUserId: string,
		forgeUserLogin: string,
		access_token: string,
		access_token_expires_at: Date,
		refresh_token: string,
		refresh_token_expires_at: Date,
	): Promise<User> {
		let user = await this.findUserByForge(forgeId, forgeUserId);

		if (user) {
			if (user.forge_username !== forgeUserLogin) {
				await this.kysely
					.updateTable("users")
					.set({ forge_username: forgeUserLogin })
					.where("user_id", "=", user.user_id)
					.execute();
				user.forge_username = forgeUserLogin;
			}
		} else {
			user = await this.insertUser(forgeId, forgeUserId, forgeUserLogin);
		}

		// Encrypt access and refresh tokens before storing
		const accessTokenBuffer = encrypt(access_token, config.app.encryptionkey);
		const refreshTokenBuffer = encrypt(refresh_token, config.app.encryptionkey);

		await this.kysely
			.insertInto("forge_access_tokens")
			.values({
				user_id: user.user_id,
				access_token: accessTokenBuffer,
				access_token_expires_at: access_token_expires_at,
				refresh_token: refreshTokenBuffer,
				refresh_token_expires_at: refresh_token_expires_at,
			})
			.onConflict((oc) =>
				oc.column("user_id").doUpdateSet({
					access_token: accessTokenBuffer,
					access_token_expires_at: access_token_expires_at,
					refresh_token: refreshTokenBuffer,
					refresh_token_expires_at: refresh_token_expires_at,
				}),
			)
			.execute();

		return user;
	}

	async getTokenInfo(userId: UserId): Promise<StoredTokenInfo | null> {
		const row = await this.kysely
			.selectFrom("forge_access_tokens")
			.select([
				"access_token",
				"access_token_expires_at",
				"refresh_token",
				"refresh_token_expires_at",
			])
			.where("user_id", "=", userId)
			.executeTakeFirst();

		if (!row) return null;

		if (row.refresh_token_expires_at < new Date()) return null;

		return {
			accessToken: decrypt(row.access_token, config.app.encryptionkey),
			accessTokenExpiresAt: row.access_token_expires_at,
			refreshToken: decrypt(row.refresh_token, config.app.encryptionkey),
			refreshTokenExpiresAt: row.refresh_token_expires_at,
		};
	}

	async updateTokens(
		userId: UserId,
		accessToken: string,
		accessTokenExpiresAt: Date,
		refreshToken: string,
		refreshTokenExpiresAt: Date,
	): Promise<void> {
		const accessTokenBuffer = encrypt(accessToken, config.app.encryptionkey);
		const refreshTokenBuffer = encrypt(refreshToken, config.app.encryptionkey);

		await this.kysely
			.updateTable("forge_access_tokens")
			.set({
				access_token: accessTokenBuffer,
				access_token_expires_at: accessTokenExpiresAt,
				refresh_token: refreshTokenBuffer,
				refresh_token_expires_at: refreshTokenExpiresAt,
			})
			.where("user_id", "=", userId)
			.execute();
	}
}
