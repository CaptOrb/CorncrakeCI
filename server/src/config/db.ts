import { Pool } from "pg";
import { config } from "./index";

let pool: Pool;

const connectionString = config.db.connectionString;

pool = new Pool({
	connectionString,
});

const connectDB = async () => {
	try {
		const client = await pool.connect();
		console.log("PostgreSQL DATABASE connected");
		client.release();
	} catch (err) {
		const error = err as Error;
		console.error("DB connection error:", error.stack || error.message);
	}
	const connectionString = config.db.connectionString;

	console.log("Connection string:", connectionString); // Check what's actually there
	console.log("DB config:", config.db); // See all db config values
};

export { pool, connectDB };
