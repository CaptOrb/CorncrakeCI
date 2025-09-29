import { Pool } from "pg";
import { config } from "./index";

let pool: Pool;

pool = new Pool({
	user: config.db.user,
	host: config.db.host,
	database: config.db.name,
	password: config.db.password,
	port: config.db.port,
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
};

export { pool, connectDB };
