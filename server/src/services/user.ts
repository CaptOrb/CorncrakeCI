import type { User } from "../db/models/user";
import { transaction } from "../db/stores";
import type { StoredTokenInfo } from "../db/stores/user";
import { scheduleRefreshTokenJob } from "../jobs/refresh-tokens";

export const findUserById = (userId: number): Promise<User | null> => {
	return transaction((txn) => txn.users.findUserById(userId));
};

export const findUserByForge = (
	forgeId: number,
	forgeUserId: string,
): Promise<User | null> => {
	return transaction((txn) => txn.users.findUserByForge(forgeId, forgeUserId));
};

export const insertUser = (
	forgeId: number,
	forgeUserId: string,
): Promise<User> => {
	return transaction((txn) => txn.users.insertUser(forgeId, forgeUserId));
};

export const getOrCreateUser = async (
	forgeId: number,
	forgeUserId: string,
	access_token: string,
	access_token_expires_at: Date,
	refresh_token: string,
	refresh_token_expires_at: Date,
): Promise<User> => {
	const user = await transaction((txn) =>
		txn.users.getOrCreateUser(
			forgeId,
			forgeUserId,
			access_token,
			access_token_expires_at,
			refresh_token,
			refresh_token_expires_at,
		),
	);
	await scheduleRefreshTokenJob(user.user_id, refresh_token_expires_at);
	return user;
};

export const getAccessToken = (userId: number): Promise<string | null> => {
	return transaction((txn) => txn.users.getAccessToken(userId));
};

export const getTokenInfo = (
	userId: number,
): Promise<StoredTokenInfo | null> => {
	return transaction((txn) => txn.users.getTokenInfo(userId));
};

export const updateTokens = async (
	userId: number,
	access_token: string,
	access_token_expires_at: Date,
	refresh_token: string,
	refresh_token_expires_at: Date,
): Promise<void> => {
	await transaction((txn) =>
		txn.users.updateTokens(
			userId,
			access_token,
			access_token_expires_at,
			refresh_token,
			refresh_token_expires_at,
		),
	);
	await scheduleRefreshTokenJob(userId, refresh_token_expires_at);
};

export const getForgeIdforUser = async (
	userId: number,
): Promise<number | null> => {
	const user = await transaction((txn) => txn.users.findUserById(userId));

	if (user == null) {
		throw new Error("User not found");
	}

	return user.forge_id;
};
