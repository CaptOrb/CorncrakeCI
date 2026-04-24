import type { ForgeId } from "../db/schema/public/Forges";
import type { Users as User, UserId } from "../db/schema/public/Users";
import { transaction } from "../db/stores";
import type { StoredTokenInfo } from "../db/stores/user";
import { scheduleRefreshTokenJob } from "../jobs/refresh-tokens";

export const findUserById = (userId: UserId): Promise<User | null> => {
	return transaction((txn) => txn.users.findUserById(userId));
};

export const findUserByForge = (
	forgeId: ForgeId,
	forgeUserId: string,
): Promise<User | null> => {
	return transaction((txn) => txn.users.findUserByForge(forgeId, forgeUserId));
};

export const insertUser = (
	forgeId: ForgeId,
	forgeUserId: string,
	forgeUserLogin: string,
): Promise<User> => {
	return transaction((txn) =>
		txn.users.insertUser(forgeId, forgeUserId, forgeUserLogin),
	);
};

export const getOrCreateUser = async (
	forgeId: ForgeId,
	forgeUserId: string,
	forgeUserLogin: string,
	access_token: string,
	access_token_expires_at: Date,
	refresh_token: string,
	refresh_token_expires_at: Date,
): Promise<User> => {
	const user = await transaction((txn) =>
		txn.users.getOrCreateUser(
			forgeId,
			forgeUserId,
			forgeUserLogin,
			access_token,
			access_token_expires_at,
			refresh_token,
			refresh_token_expires_at,
		),
	);
	await scheduleRefreshTokenJob(user.user_id, refresh_token_expires_at);
	return user;
};

export const getTokenInfo = (
	userId: UserId,
): Promise<StoredTokenInfo | null> => {
	return transaction((txn) => txn.users.getTokenInfo(userId));
};

export const updateTokens = async (
	userId: UserId,
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
	userId: UserId,
): Promise<ForgeId | null> => {
	const user = await transaction((txn) => txn.users.findUserById(userId));

	if (user == null) {
		throw new Error("User not found");
	}

	return user.forge_id;
};
