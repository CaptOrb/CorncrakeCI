import type { PoolClient } from "pg";
import { config } from "../../config";
import { decrypt, encrypt } from "../../util/crypto";
import type { User } from "../models/user";

export class UserStore {
	constructor(private client: PoolClient) {}

	async findUserById(userId: number): Promise<User | null> {
		const result = await this.client.query(
			`SELECT user_id, forge_id, forge_user_id
			FROM users WHERE user_id = $1`,
			[userId],
		);
		return result.rows[0] ?? null;
	}

	async findUserByForge(
		forgeId: number,
		forgeUserId: string,
	): Promise<User | null> {
		const result = await this.client.query(
			`SELECT user_id, forge_id, forge_user_id
			FROM users WHERE forge_id = $1 AND forge_user_id = $2`,
			[forgeId, forgeUserId],
		);
		return result.rows[0] ?? null;
	}

	async insertUser(forgeId: number, forgeUserId: string): Promise<User> {
		const result = await this.client.query(
			`INSERT INTO users (forge_id, forge_user_id)
       VALUES ($1, $2)
       RETURNING user_id, forge_id, forge_user_id`,
			[forgeId, forgeUserId],
		);
		return result.rows[0];
	}

	async getOrCreateUser(
		forgeId: number,
		forgeUserId: string,
		access_token: string,
		access_token_expires_at?: Date,
	): Promise<User> {
		const userResult = await this.client.query(
			`SELECT user_id, forge_id, forge_user_id
			FROM users WHERE forge_id = $1 AND forge_user_id = $2`,
			[forgeId, forgeUserId],
		);

		let user: User;
		if (userResult.rows[0]) {
			// found existing user
			user = userResult.rows[0];
		} else {
			// create new user
			const insertResult = await this.client.query(
				`INSERT INTO users (forge_id, forge_user_id)
				VALUES ($1, $2)
				RETURNING user_id, forge_id, forge_user_id`,
				[forgeId, forgeUserId],
			);
			user = insertResult.rows[0];
		}

		// Encrypt tokens before storing
		const accessTokenBuffer = encrypt(access_token, config.app.encryptionkey);

		// TODO
		const refreshTokenBuffer = Buffer.alloc(0);
		const refreshTokenExpiresAt = new Date("2100-01-01T00:00:00Z");

		await this.client.query(
			`INSERT INTO forge_access_tokens
         (user_id, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id)
         DO UPDATE SET
           access_token = EXCLUDED.access_token,
		   access_token_expires_at = EXCLUDED.access_token_expires_at,
		   refresh_token = EXCLUDED.refresh_token,
           refresh_token_expires_at = EXCLUDED.refresh_token_expires_at`,
			[
				user.user_id,
				accessTokenBuffer,
				access_token_expires_at,
				refreshTokenBuffer,
				refreshTokenExpiresAt,
			],
		);

		return user;
	}

	async getAccessToken(userId: number): Promise<string | null> {
		const result = await this.client.query(
			`SELECT access_token FROM forge_access_tokens WHERE user_id = $1`,
			[userId],
		);
		if (result.rows.length === 0) {
			return null;
		}
		// Decrypt token from BYTEA (Buffer)

		return decrypt(result.rows[0]?.access_token, config.app.encryptionkey);
	}
}
