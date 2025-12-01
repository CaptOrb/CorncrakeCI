import type { User } from "../db/models/user";
import { transaction } from "../db/stores";

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
	access_token?: string,
	token_expires_at?: Date,
): Promise<User> => {
	return transaction((txn) =>
		txn.users.insertUser(forgeId, forgeUserId, access_token, token_expires_at),
	);
};

export const getOrCreateUser = (
	forgeId: number,
	forgeUserId: string,
	access_token?: string,
	token_expires_at?: Date,
): Promise<User> => {
	return transaction((txn) =>
		txn.users.getOrCreateUser(
			forgeId,
			forgeUserId,
			access_token,
			token_expires_at,
		),
	);
};

export const getAccessToken = (userId: number): Promise<string | null> => {
	return transaction((txn) => txn.users.getAccessToken(userId));
};
