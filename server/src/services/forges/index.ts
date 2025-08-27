import { GiteaForge } from "./gitea";
import type { Forge } from "../../types/forge";
import { config } from "../../config/env";

/**
 * Returns a Forge implementation for the given forgeType.
 * Throws an error if the forge is not enabled or not implemented.
 */
export function createForge(forgeType: string): Forge {
	if (!config.FORGE_TYPES.includes(forgeType)) {
		throw new Error(`Unsupported forge type: ${forgeType}`);
	}

	switch (forgeType) {
		case "gitea":
			return new GiteaForge();
		case "github":
			throw new Error("GitHubForge not implemented yet");
		case "gitlab":
			throw new Error("GitLabForge not implemented yet");
		default:
			throw new Error(`Unsupported forge type: ${forgeType}`);
	}
}

/**
 * Returns the list of available forge types from config.
 */
export function listAvailableForges(): string[] {
	return [...config.FORGE_TYPES];
}
