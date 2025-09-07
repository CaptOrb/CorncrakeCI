import { pool } from "../config/db";
import { config } from "../config/env";
import { FORGE_IDS } from "../services/forges/constants";

export async function seedForges(): Promise<void> {
	for (const forgeType of config.FORGE_TYPES) {
		const forgeId = FORGE_IDS[forgeType];
		if (forgeId === undefined) {
			console.warn(`Skipping unknown forge type: ${forgeType}`);
			continue;
		}

		let baseUrl: string;
		switch (forgeType) {
			case "gitea":
				baseUrl = config.GITEA_URL;
				break;
			default:
				console.warn(`Forge type ${forgeType} not supported`);
				continue;
		}

		try {
			await pool.query(
				`INSERT INTO forges (forge_id, display_name, base_url)
					VALUES ($1, $2, $3)
					ON CONFLICT (forge_id)
					DO UPDATE SET base_url = EXCLUDED.base_url`,
				[forgeId, forgeType, baseUrl],
			);
			console.log(`Forge seeded: ${forgeType} (${baseUrl})`);
		} catch (err) {
			console.error(`Failed to seed forge ${forgeType}:`, err);
			throw err;
		}
	}
}
