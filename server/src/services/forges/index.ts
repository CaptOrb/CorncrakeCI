import { config } from "../../config";
import type { Forge } from "../../types/forge";
import { GiteaForge } from "./gitea";

/**
 * Returns a Forge implementation for the given forge ID.
 * Throws an error if the forge is not enabled or not implemented.
 */
export function createForge(forgeId: number): Forge {
	const forgeConfig = config.forges.get(forgeId);

	if (!forgeConfig) {
		throw new Error(`Forge with ID ${forgeId} not found`);
	}

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

/**
 * Returns the list of available forge IDs from config.
 */
export function listAvailableForgeIds(): number[] {
	return Array.from(config.forges.keys());
}
