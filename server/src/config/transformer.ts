/**
 * Transforms environment variables into a hierarchical (nested) configuration object.
 * Environment variables are expected to have underscore-delimited keys.
 * Keys are lowercased.
 *
 * Only variables with root keys included in the allowedKeys array are processed.
 *
 * For example, the environment variable `DATABASE_HOST=localhost` would be
 * transformed into `{ database: { host: "localhost" } }`
 * as long as "database" is in the allowedKeys.
 */
export function transformEnvToConfig<Keys extends string[]>(
	env: Record<string, string>,
	allowedKeys: Keys,
): Record<(typeof allowedKeys)[number], unknown> {
	const config: Record<string, unknown> = {};

	for (const [keyPath, value] of Object.entries(env)) {
		const keyPathParts = keyPath.toLowerCase().split("_");
		if (!allowedKeys.includes(keyPathParts[0]!) || keyPathParts.length < 2) {
			// Not an env var we care about.
			continue;
		}

		// Start at the top-level config map, then
		// descend into the deeper layers
		// (following keyPath)
		let current: Record<string, unknown> = config;
		for (const part of keyPathParts.slice(0, -1)) {
			if (!(part in current)) {
				current[part] = {};
			}
			if (typeof current[part] !== "object") {
				throw new Error(
					`Mixed config types: can't descend into ${part} on ${keyPath}, have: ${current[part]}`,
				);
			}
			current = current[part] as Record<string, unknown>;
		}

		// then set the value.
		const lastPart = keyPathParts[keyPathParts.length - 1]!;
		current[lastPart] = value;
	}

	return config;
}
