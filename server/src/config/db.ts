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

	// Check the connection upfront
	try {
		const client = await pool.connect();
		console.log("PostgreSQL Database connected");
		client.release();
	} catch (err) {
		const error = err as Error;
		console.error("DB connection error:", error.stack || error.message);
	}
}

/**
 * Sets the database connection pool forcefully, for use in test setup.
 */
export async function _setPool(newPool: Pool): Promise<void> {
	pool = newPool;
}
