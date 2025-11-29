import type { User } from "../db/models/user";
import { userRepository } from "../db/stores";

export const findUserById = (userId: number): Promise<User | null> => {
	return userRepository.findUserById(userId);
};

export const findUserByForge = (
	forgeId: number,
	forgeUserId: string,
): Promise<User | null> => {
	return userRepository.findUserByForge(forgeId, forgeUserId);
};

export const insertUser = (
	forgeId: number,
	forgeUserId: string,
	access_token?: string,
	token_expires_at?: Date,
): Promise<User> => {
	return userRepository.insertUser(
		forgeId,
		forgeUserId,
		access_token,
		token_expires_at,
	);
};

export const getOrCreateUser = (
	forgeId: number,
	forgeUserId: string,
	access_token?: string,
	token_expires_at?: Date,
): Promise<User> => {
	return userRepository.getOrCreateUser(
		forgeId,
		forgeUserId,
		access_token,
		token_expires_at,
	);
};

export const getAccessToken = (userId: number): Promise<string | null> => {
	return userRepository.getAccessToken(userId);
};
