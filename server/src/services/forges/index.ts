import { KeyedMutex } from "keyed-mutex";
import { config } from "../../config";
import type { ForgeInstanceConfig } from "../../config/schema";
import type { ForgeId } from "../../db/schema/public/Forges";
import type { UserId } from "../../db/schema/public/Users";
import { findUserById, getTokenInfo, updateTokens } from "../user";
import { AuthError } from "./errors";
import type { Forge, ForgeWithUser } from "./forge";
import { GiteaForge } from "./gitea";

// Re-export error classes
export { AuthError, NotFoundError } from "./errors";
export { AccessLevel } from "./forge";

/**
 * Map from forge ID to the forge instance.
 */
export const _forgeMap: Map<ForgeId, Forge> = new Map();

/**
 * Get a forge from its ID.
 */
export function getForge(forgeId: ForgeId): Forge | null {
	return _forgeMap.get(forgeId) || null;
}

/**
 * Get a forge from its ID, throwing an error if the forge isn't configured.
 */
export function mustGetForge(forgeId: ForgeId): Forge {
	const forge = _forgeMap.get(forgeId);
	if (!forge) throw new Error(`Forge with ID ${forgeId} not found.`);
	return forge;
}

/**
 * Creates forges from the config.
 * Throws an error if the forge is not enabled or not implemented.
 */
export function createForgesFromConfig(): void {
	function makeForge(
		forgeId: ForgeId,
		forgeConfig: ForgeInstanceConfig,
	): Forge {
		switch (forgeConfig.type) {
			case "gitea":
				return new GiteaForge(forgeId, forgeConfig);
			case "github":
				throw new Error("GitHubForge not implemented yet");
			case "gitlab":
				throw new Error("GitLabForge not implemented yet");
			default:
				throw new Error(`Unsupported forge type: ${forgeConfig.type}`);
		}
	}
	for (const [forgeId, forgeConfig] of config.forges) {
		const id = forgeId as ForgeId;
		_forgeMap.set(id, makeForge(id, forgeConfig));
	}
}

/**
 * Returns the list of available forge IDs from config.
 */
export function listAvailableForgeIds(): ForgeId[] {
	return Array.from(_forgeMap.keys());
}

/**
 * Returns the list of available forges with their ID and name.
 */
export function listAvailableForges(): Array<{
	id: ForgeId;
	forge: Forge;
}> {
	return Array.from(_forgeMap.entries()).map(([id, forge]) => ({ id, forge }));
}

/**
 * Gets a ForgeWithUser for a given corncrakeci user ID, automatically refreshing the access token if it's about to expire.
 * @throws {AuthError} if user not found, tokens missing, or token refresh fails
 */
export async function getForgeWithUser(userId: UserId): Promise<ForgeWithUser> {
	// Lock the user's tokens so that e.g. the background job doesn't
	// refresh concurrently with us.
	using _lock = await userTokenMutexes.lock(userId);

	const user = await findUserById(userId);
	if (!user) {
		throw new AuthError("User not found");
	}

	const forge = mustGetForge(user.forge_id);

	const tokenInfo = await getTokenInfo(userId);
	if (!tokenInfo) {
		throw new AuthError("No tokens found for user");
	}

	const now = new Date();
	const thresholdMs = config.app.accesstokenthreshold * 1000;
	const expiresAt = tokenInfo.accessTokenExpiresAt;

	const isExpiring =
		expiresAt && expiresAt.getTime() - now.getTime() < thresholdMs;

	if (isExpiring) {
		try {
			const newTokens = await forge.refreshAccessToken(tokenInfo.refreshToken);

			await updateTokens(
				userId,
				newTokens.accessToken,
				newTokens.accessTokenExpiresAt,
				newTokens.refreshToken,
				newTokens.refreshTokenExpiresAt,
			);

			return forge.withUser(newTokens.accessToken);
		} catch (error) {
			console.error("Failed to refresh token for user", error);
			throw new AuthError("Failed to refresh token");
		}
	}

	return forge.withUser(tokenInfo.accessToken);
}

/**
 * Mutexes for refreshing/mutating user access and refresh tokens.
 * Keyed by user ID.
 */
export const userTokenMutexes: KeyedMutex<UserId> = new KeyedMutex();
