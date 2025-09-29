import * as v from "valibot";
import { CONFIG_SCHEMA_KEYS, type Config, ConfigSchema } from "./schema";
import { transformEnvToConfig } from "./transformer";

function createConfig(): Config {
	const rawConfig = transformEnvToConfig(
		process.env as Record<string, string>,
		CONFIG_SCHEMA_KEYS,
	);

	const result = v.safeParse(ConfigSchema, rawConfig);
	if (!result.success) {
		const issueStrings = result.issues.map(
			(issue) => `- ${v.getDotPath(issue)}: ${issue.message}`,
		);
		throw new Error(`Invalid configuration:\n${issueStrings.join("\n")}`);
	}

	return result.output;
}

export const config = createConfig();
