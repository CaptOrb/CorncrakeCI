import { config } from "../config";
import { pool } from "../config/db";

export async function seedForges(): Promise<void> {
	for (const [forgeId, forgeConfig] of config.forges) {
		try {
			await pool.query(
				`INSERT INTO forges (forge_id, display_name, base_url)
					VALUES ($1, $2, $3)
					ON CONFLICT (forge_id)
					DO UPDATE SET base_url = EXCLUDED.base_url`,
				[forgeId, forgeConfig.type, forgeConfig.url],
			);
			console.log(`Forge seeded: ${forgeConfig.type} (${forgeConfig.url})`);
		} catch (err) {
			console.error(`Failed to seed forge ${forgeConfig.type}:`, err);
			throw err;
		}
	}
}
