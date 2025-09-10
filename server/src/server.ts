import express from "express";
import session from "express-session";
import { createOpenAPIBackend, createOpenAPIMiddleware } from "./api/openapi";
import { connectDB } from "./config/db";
import { config, isProduction } from "./config/env";
import authRouter from "./routes/auth";
import { seedForges } from "./util/seedforges";

async function startServer() {
	await connectDB();
	await seedForges();

	const app = express();
	app.use(express.json());

	const sessionCookieName = config.IS_PRODUCTION
		? "__Host-SessionID"
		: "sessionID";

	app.use(
		session({
			name: sessionCookieName,
			secret: config.SESSION_SECRET,
			resave: false,
			saveUninitialized: false,
			cookie: {
				secure: config.IS_PRODUCTION, // false in dev
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
