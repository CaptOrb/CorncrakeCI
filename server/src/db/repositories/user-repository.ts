import { pool } from "../../config/db";
import type { User } from "../models/user";

class UserRepository {
	/**
	 * Find a user by internal Molci ID
	 */
	async findUserById(userId: number): Promise<User | null> {
		const result = await pool.query(`SELECT * FROM users WHERE user_id = $1`, [
			userId,
		]);
		return result.rows[0] ?? null;
	}

	/**
	 * Find a user by forge_id + forge_user_id
	 */
	async findUserByForge(
		forgeId: number,
		forgeUserId: string,
	): Promise<User | null> {
		const result = await pool.query(
			`SELECT * FROM users WHERE forge_id = $1 AND forge_user_id = $2`,
			[forgeId, forgeUserId],
		);
		return result.rows[0] ?? null;
	}

	async insertUser(
		forgeId: number,
		forgeUserId: string,
		access_token?: string,
		token_expires_at?: Date,
	): Promise<User> {
		const result = await pool.query(
			`INSERT INTO users
			(forge_id, forge_user_id, access_token, token_expires_at)
			VALUES ($1, $2, $3, $4)
			RETURNING user_id, forge_id, forge_user_id`,
			[forgeId, forgeUserId, access_token, token_expires_at],
		);
		return result.rows[0];
	}

	async getOrCreateUser(
		forgeId: number,
		forgeUserId: string,
		access_token?: string,
		token_expires_at?: Date,
	): Promise<User> {
		const result = await pool.query(
			`INSERT INTO users (forge_id, forge_user_id, access_token, token_expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (forge_id, forge_user_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        token_expires_at = EXCLUDED.token_expires_at
       RETURNING user_id, forge_id, forge_user_id, access_token, token_expires_at`,
			[forgeId, forgeUserId, access_token, token_expires_at],
		);

		return result.rows[0];
	}

	async getAccessToken(userId: number): Promise<string | null> {
		const result = await pool.query(
			`SELECT access_token FROM users WHERE user_id = $1`,
			[userId],
		);
		return result.rows[0]?.access_token ?? null;
	}
}

export const userRepository = new UserRepository();
