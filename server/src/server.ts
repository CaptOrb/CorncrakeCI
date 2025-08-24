import express from "express";
import { connectDB, pool } from "./config/db";
import { config, isProduction } from "./config/env";
import { OpenAPIBackend, type Request } from "openapi-backend";
import type { Repository } from "./types/openapi";

const api = new OpenAPIBackend({
	definition: "./openapi.yaml",
	validate: true,
});

api.register({
	listAvailableRepos: async (
		_c,
		_req: express.Request,
		res: express.Response,
	) => {
		const repos: Repository[] = [];
		return res.json(repos);
	},
});

const app = express();
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

api.init();
app.use((req, res) => api.handleRequest(req as Request, req, res));

connectDB();


const PORT = config.APP_PORT;
app.listen(PORT, () => {
	console.log(
		`Server running in ${isProduction ? "production" : "development"} mode on port ${PORT}`,
	);
});
