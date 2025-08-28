import express, {
	type Request as ExpressRequest,
	type Response as ExpressResponse,
} from "express";
import session from "express-session";
import { OpenAPIBackend, type Request } from "openapi-backend";
import { connectDB, pool } from "./config/db";
import { config, isProduction } from "./config/env";
import authRouter from "./routes/auth";
import { createForge } from "./services/forges";
import { FORGE_IDS } from "./services/forges/constants";
import { getAccessToken } from "./types/user";

const app = express();
app.use(express.json());

// express session for Session cookie on the browser and Session object on the server
app.use(
	session({
		secret: config.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: config.IS_PRODUCTION,
			httpOnly: true,
			maxAge: 24 * 60 * 60 * 1000, // 1 day
		},
	}),
);

app.use("/auth", authRouter);

async function seedForges() {
	for (const forgeType of config.FORGE_TYPES) {
		const forgeId = FORGE_IDS[forgeType];
		if (forgeId === undefined) {
			console.warn(`Skipping unknown forge type: ${forgeType}`);
			continue;
		}

		let baseUrl: string;
		switch (forgeType) {
			case "gitea":
				baseUrl = config.GITEA_URL;
				break;
			default:
				console.warn(`Forge type ${forgeType} not supported`);
				continue;
		}

		try {
			await pool.query(
				`INSERT INTO forges (forge_id, display_name, base_url)
					VALUES ($1, $2, $3)
					ON CONFLICT (forge_id)
					DO UPDATE SET base_url = EXCLUDED.base_url`,
				[forgeId, forgeType, baseUrl],
			);
			console.log(`Forge seeded: ${forgeType} (${baseUrl})`);
		} catch (err) {
			console.error(`Failed to seed forge ${forgeType}:`, err);
			throw err;
		}
	}
}

// OpenAPI backend
const api = new OpenAPIBackend({
	definition: "./openapi.yaml",
	validate: true,
});

api.register({
	listAvailableRepos: async (_c, req: ExpressRequest, res: ExpressResponse) => {
		try {
			const userId = req.session?.userId;
			const forgeType = req.session?.forgeType;

			if (!userId || !forgeType) {
				return res.status(401).json({ error: "Not authenticated" });
			}

			const accessToken = await getAccessToken(userId);
			if (!accessToken) {
				return res
					.status(401)
					.json({ error: "Missing or expired access token" });
			}

			const forge = createForge(forgeType);
			const repos = await forge.listRepositories(accessToken);

			return res.json(repos);
		} catch (err) {
			console.error("Failed to fetch repos:", err);
			return res.status(500).json({ error: "Failed to list repositories" });
		}
	},

	notFound: (_c, _req, res) => res.status(404).json({ err: "not found" }),
	validationFail: (c, _req, res) =>
		res.status(400).json({ err: c.validation.errors }),
});

api.init();
app.use((req, res) => api.handleRequest(req as Request, req, res));

async function startServer() {
	await connectDB();
	await seedForges();

	const PORT = config.APP_PORT;
	app.listen(PORT, () => {
		console.log(
			`Server running in ${isProduction ? "production" : "development"} mode on port ${PORT}`,
		);
	});
}

startServer().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});
