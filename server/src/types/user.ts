import { pool } from "../config/db";
import { FORGE_IDS } from "../services/forges/constants";

export interface User {
	user_id: number; // internal molci ID
	avatar_url?: string;
	access_token?: string;
	forge_id: number;
	forge_user_id: string;
	forge_type: string;
	token_expires_at?: Date;
}

const resolveForgeId = (forgeType: string): number => {
	const forgeId = FORGE_IDS[forgeType];
	if (forgeId === undefined)
		throw new Error(`Unsupported forge type: ${forgeType}`);
	return forgeId;
};

/**
 * Find a user by internal Molci ID
 */
export const findUserById = async (userId: number): Promise<User | null> => {
	const result = await pool.query(`SELECT * FROM users WHERE user_id = $1`, [
		userId,
	]);
	return result.rows[0] ?? null;
};

/**
 * Find a user by forge_id + forge_user_id
 */
export const findUserByForge = async (
	forgeId: number,
	forgeUserId: string,
): Promise<User | null> => {
	const result = await pool.query(
		`SELECT * FROM users WHERE forge_id = $1 AND forge_user_id = $2`,
		[forgeId, forgeUserId],
	);
	return result.rows[0] ?? null;
};

export const insertUser = async (
	forgeType: string,
	forgeUserId: string,
	access_token?: string,
	token_expires_at?: Date,
): Promise<User> => {
	const forgeId = resolveForgeId(forgeType);

	const result = await pool.query(
		`INSERT INTO users
		(forge_id, forge_user_id, access_token, token_expires_at, forge_type)
		VALUES ($1, $2, $3, $4, $5)
		 RETURNING *`,
		[forgeId, forgeUserId, access_token, token_expires_at, forgeType],
	);
	return result.rows[0];
};

export const getOrCreateUser = async (
	forgeType: string,
	forgeUserId: string,
	access_token?: string,
	token_expires_at?: Date,
): Promise<User> => {
	const forgeId = resolveForgeId(forgeType);

	let user = await findUserByForge(forgeId, forgeUserId);
	if (!user) {
		user = await insertUser(
			forgeType,
			forgeUserId,
			access_token,
			token_expires_at,
		);
	}
	return user;
};
