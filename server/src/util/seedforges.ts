import { config } from "../config";
import type { ForgeId } from "../db/schema/public/Forges";
import { transaction } from "../db/stores";

export async function seedForges(): Promise<void> {
	await transaction(async (txn) => {
		for (const [forgeId, forgeConfig] of config.forges) {
			try {
				await txn.kysely
					.insertInto("forges")
					.values({
						forge_id: forgeId as ForgeId,
						display_name: forgeConfig.name,
					})
					.onConflict((oc) =>
						oc.column("forge_id").doUpdateSet({
							display_name: forgeConfig.name,
						}),
					)
					.execute();
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
