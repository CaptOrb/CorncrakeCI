import { Pool } from "pg";
import { config } from "./env";

let pool: Pool;

const { DB_USER, DB_PASSWORD, DB_NAME } = config;

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
	throw new Error("DB_USER, DB_PASSWORD, and DB_NAME must be set");
}

pool = new Pool({
	user: config.DB_USER,
	host: config.DB_HOST,
	database: config.DB_NAME,
	password: config.DB_PASSWORD,
	port: config.DB_PORT,
});

const connectDB = async () => {
	try {
		await pool.connect();
		console.log("PostgreSQL DATABASE connected");
	} catch (err) {
		const error = err as Error;
		console.error("DB connection error:", error.stack || error.message);
	}
};

export { pool, connectDB };
