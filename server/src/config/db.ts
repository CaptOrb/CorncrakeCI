import type { Pool } from "pg";

export let pool: Pool | null = null;

/**
 * Sets the database connection pool and makes a test connection to ensure it works.
 *
 * Will fail if a pool has already been set.
 */
export async function connectDB(newPool: Pool): Promise<void> {
	if (pool !== null) {
		throw new Error("Database already connected");
	}

	pool = newPool;

	// Log idle pool errors rather than letting them become uncaught exceptions.
	// A common case is 57P01 ("terminating connection due to administrator
	// command")
	pool.on("error", (err) => {
		console.error("Database pool error:", err);
	});

	// Check the connection upfront
	try {
		const client = await pool.connect();
		console.log("PostgreSQL Database connected");
		client.release();
	} catch (err) {
		const error = err as Error;
		console.error("DB connection error:", error.stack || error.message);
		throw error;
	}
}

/**
 * Sets the database connection pool forcefully, for use in test setup.
 */
export function _setPool(newPool: Pool): void {
	pool = newPool;
}
