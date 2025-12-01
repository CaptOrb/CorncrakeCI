import express from "express";
import session from "express-session";
import pgSimple from "connect-pg-simple";
import { createOpenAPIBackend, createOpenAPIMiddleware } from "./api/openapi";
import { config } from "./config";
import { connectDB } from "./config/db";
import { runJobs } from "./jobs/graphile-worker";
import authRouter from "./routes/auth";
import { seedForges } from "./util/seedforges";

async function startServer() {
	await connectDB();
	await seedForges();

	const app = express();
	app.use(express.json());

	const isProduction = config.node.env === "production";
	const sessionCookieName = isProduction ? "__Host-SessionID" : "sessionID";

	const PgSession = pgSimple(session);
	app.use(
		session({
			name: sessionCookieName,
			secret: config.session.secret,
			resave: false,
			saveUninitialized: false,
			store: new PgSession({
				conString: config.db.uri,
			}),
			cookie: {
				secure: isProduction, // false in dev
				httpOnly: true,
				sameSite: "lax",
				maxAge: 24 * 60 * 60 * 1000,
				path: "/",
			},
		}),
	);
	app.use("/auth", authRouter);

	const openapi = createOpenAPIBackend();
	app.use(createOpenAPIMiddleware(openapi));

	runJobs();

	const PORT = config.app.port;
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
