import express from "express";
import { pool } from "./config/db";
import { config, isProduction } from "./config/env";

const app = express();
const PORT = config.APP_PORT;

app.use(express.json());

app.get("/ping", async (_req, res) => {
	try {
		const result = await pool.query("SELECT NOW()");
		res.json({ success: true, time: result.rows[0].now });
	} catch (error) {
		console.error("Database error:", error);
		res
			.status(500)
			.json({ success: false, error: "Database connection failed" });
	}
});

app.listen(PORT, () => {
	console.log(
		`Server running in ${isProduction ? "production" : "development"} mode on port ${PORT}`,
	);
});
