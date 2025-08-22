import { migrate } from "postgres-migrations";
import { pool } from "../src/config/db";

async function runMigrations() {
	const client = await pool.connect();
	try {
		await migrate({ client }, "./migrations", {
			// Enable logging to see which migrations are being applied
			logger: (msg) => console.log(`[Migration] ${msg}`),
		});
	} catch (err) {
		console.error("Migration failed:", err);
	} finally {
		client.release();
	}
}

runMigrations().catch((err) => {
	console.error("Unexpected error running migrations:", err);
	process.exit(1);
});
