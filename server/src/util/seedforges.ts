import { config } from "../config";
import { transaction } from "../db/stores";

export async function seedForges(): Promise<void> {
	await transaction(async (txn) => {
		for (const [forgeId, forgeConfig] of config.forges) {
			try {
				await txn.client.query(
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
	});
}
