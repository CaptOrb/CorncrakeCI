import express, {
	type Request as ExpressRequest,
	type Response as ExpressResponse,
} from "express";
import session from "express-session";
import { OpenAPIBackend, type Request } from "openapi-backend";
import { connectDB } from "./config/db";
import { config, isProduction } from "./config/env";
import authRouter from "./routes/auth";
import { createForge } from "./services/forges";
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

connectDB();

const PORT = config.APP_PORT;
app.listen(PORT, () => {
	console.log(
		`Server running in ${isProduction ? "production" : "development"} mode on port ${PORT}`,
	);
});
