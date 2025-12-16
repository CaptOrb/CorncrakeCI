import { config } from "../../config";
import type { ForgeInstanceConfig } from "../../config/schema";
import type { Forge } from "./forge";
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
