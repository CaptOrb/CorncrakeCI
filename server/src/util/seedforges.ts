import { config } from "../config";
import { transaction } from "../db/stores";

export async function seedForges(): Promise<void> {
	await transaction(async (txn) => {
		for (const [forgeId, forgeConfig] of config.forges) {
			try {
				await txn.client.query(
					`INSERT INTO forges (forge_id, display_name)
					VALUES ($1, $2)
					ON CONFLICT (forge_id)
					DO UPDATE SET display_name = EXCLUDED.display_name`,
					[forgeId, forgeConfig.name],
				);
				console.log(
					`Forge seeded: ${forgeConfig.name} (${forgeId}, ${forgeConfig.type}) (${forgeConfig.url})`,
				);
			} catch (err) {
				console.error(
					`Failed to seed forge ${forgeConfig.name} (${forgeId}, ${forgeConfig.type}):`,
					err,
				);
				throw err;
			}
		}
	});
}
