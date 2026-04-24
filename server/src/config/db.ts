import { Kysely, PostgresDialect } from "kysely";
import type { Pool } from "pg";
import type Database from "../db/schema/Database";

/**
 * Direct access to the database pool without any sugary wrapping.
 * Use `pool` instead for making queries.
 */
let rawPool: Pool | null = null;

/**
 * Kysely wrapped around `rawPool`
 */
export let pool: Kysely<Database> | null = null;

/**
 * Sets the database connection pool and creates a Kysely instance.
 *
 * Will fail if a pool has already been set.
 */
export async function connectDB(newPool: Pool): Promise<void> {
	if (rawPool !== null) {
		throw new Error("Database already connected");
	}

	rawPool = newPool;

	pool = new Kysely<Database>({
		dialect: new PostgresDialect({ pool: rawPool }),
	});

	// Log idle pool errors rather than letting them become uncaught exceptions.
	// A common case is 57P01 ("terminating connection due to administrator
	// command")
	rawPool.on("error", (err) => {
		console.error("Database pool error:", err);
	});

	// Check the connection upfront
	try {
		const client = await rawPool.connect();
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
	rawPool = newPool;
	pool = new Kysely<Database>({
		dialect: new PostgresDialect({ pool: newPool }),
	});
}
