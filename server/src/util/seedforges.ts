import { config } from "../config";
import type { ForgeId } from "../db/schema/public/Forges";
import { transaction } from "../db/stores";
import { createLogger } from "../util/logging";

const log = createLogger(import.meta.url);

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
				log.info(
					{
						forgeId,
						name: forgeConfig.name,
						type: forgeConfig.type,
						url: forgeConfig.url,
					},
					"Forge seeded",
				);
			} catch (err) {
				log.error(
					{ forgeId, name: forgeConfig.name, type: forgeConfig.type, err },
					"Failed to seed forge",
				);
				throw err;
			}
		}
	});
}
