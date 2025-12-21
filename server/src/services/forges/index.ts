import { KeyedMutex } from "keyed-mutex";
import { config } from "../../config";
import type { ForgeInstanceConfig } from "../../config/schema";
import { coalesceConcurrent } from "../../util/coalesce";
import { findUserById, getTokenInfo, updateTokens } from "../user";
import type { Forge, ForgeWithUser } from "./forge";
import { GiteaForge } from "./gitea";

/**
 * Map from forge ID to the forge instance.
 */
export const _forgeMap: Map<number, Forge> = new Map();

/**
 * Get a forge from its ID.
 */
export function getForge(forgeId: number): Forge | null {
	return _forgeMap.get(forgeId) || null;
}

/**
 * Get a forge from its ID, throwing an error if the forge isn't configured.
 */
export function mustGetForge(forgeId: number): Forge {
	const forge = _forgeMap.get(forgeId);
	if (!forge) throw new Error(`Forge with ID ${forgeId} not found.`);
	return forge;
}

/**
 * Creates forges from the config.
 * Throws an error if the forge is not enabled or not implemented.
 */
export function createForgesFromConfig(): void {
	function makeForge(forgeId: number, forgeConfig: ForgeInstanceConfig): Forge {
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
		_forgeMap.set(forgeId, makeForge(forgeId, forgeConfig));
	}
}

/**
 * Returns the list of available forge IDs from config.
 */
export function listAvailableForgeIds(): number[] {
	return Array.from(_forgeMap.keys());
}

/**
 * Gets a ForgeWithUser for a given molciuser ID, automatically refreshing the access token if it's about to expire.
 */
async function getForgeWithUserUnwrapped(
	userId: number,
): Promise<ForgeWithUser> {
	// Lock the user's tokens so that e.g. the background job doesn't
	// refresh concurrently with us.
	using _lock = await userTokenMutexes.lock(String(userId));

	const user = await findUserById(userId);
	if (!user) {
		throw new Error("User not found");
	}

	const forge = mustGetForge(user.forge_id);

	const tokenInfo = await getTokenInfo(userId);
	if (!tokenInfo) {
		throw new Error("No tokens found for user");
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
			throw new Error("Failed to refresh token");
		}
	}

	return forge.withUser(tokenInfo.accessToken);
}

/**
 * User ID -> `getForgeWithUser` promises.
 */
const coalesceMapForgeWithUser: Map<number, Promise<ForgeWithUser>> = new Map();

/**
 * Gets a ForgeWithUser for a given molciuser ID, automatically refreshing the access token if it's about to expire.
 *
 * Concurrent calls will be coalesced into one.
 */
export function getForgeWithUser(userId: number): Promise<ForgeWithUser> {
	return coalesceConcurrent(coalesceMapForgeWithUser, userId, () =>
		getForgeWithUserUnwrapped(userId),
	);
}

/**
 * Mutexes for refreshing/mutating user access and refresh tokens.
 * Keyed by user ID stringified.
 */
export const userTokenMutexes: KeyedMutex = new KeyedMutex();
