import { resolve } from "node:path";
import pgSimple from "connect-pg-simple";
import express, { type Application } from "express";
import session from "express-session";
import { Pool } from "pg";
import { migrate } from "postgres-migrations";
import swaggerUi from "swagger-ui-express";
import {
	configureRepo,
	getRepo,
	listAvailableRepos,
	listConfiguredRepos,
	reconfigureRepo,
} from "./api/repositories";
import { config } from "./config";
import { connectDB } from "./config/db";
import apiOpenapi from "./generated/api/@typespec/openapi3/openapi.json";
import { createRouter } from "./generated/server/generated";
import { runJobs } from "./jobs/graphile-worker";
import authRouter from "./routes/auth";
import { createForgesFromConfig } from "./services/forges";
import { seedForges } from "./util/seedforges";

async function createWebServer({
	isProduction,
	pool,
}: {
	isProduction: boolean;
	pool: Pool;
}): Promise<Application> {
	const app = express();
	app.use(express.json());

	const sessionCookieName = isProduction ? "__Host-SessionID" : "sessionID";

	const PgSession = pgSimple(session);
	app.use(
		session({
			name: sessionCookieName,
			secret: config.session.secret,
			resave: false,
			saveUninitialized: false,
			store: new PgSession({
				pool,
				createTableIfMissing: true,
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

	app.use(
		"/",
		createRouter({
			listAvailableRepos,
			listConfiguredRepos,
			getRepo,
			configureRepo,
			reconfigureRepo,
		}),
	);

	app.use("/auth", authRouter);

	return app;
}

async function startServer(): Promise<void> {
	const pool = new Pool({ connectionString: config.db.uri });
	await connectDB(pool);
	await runMigrations(pool);
	createForgesFromConfig();
	await seedForges();

	const isProduction = config.node.env === "production";
	const app = await createWebServer({
		isProduction,
		pool,
	});

	// We don't care about Swagger in tests so mount it here
	app.use("/swagger", swaggerUi.serve, swaggerUi.setup(apiOpenapi));

	runJobs();

	const PORT = config.app.port;
	app.listen(PORT, () => {
		console.log(
			`Server running in ${isProduction ? "production" : "development"} mode on port ${PORT}`,
		);
	});
}

async function runMigrations(pool: Pool): Promise<void> {
	const client = await pool.connect();
	try {
		await migrate({ client }, resolve(__dirname, "../migrations"), {
			// Enable logging to see which migrations are being applied
			logger: (msg) => console.log(`[Migration] ${msg}`),
		});
	} catch (err) {
		console.error("Migration failed:", err);
		throw err;
	} finally {
		client.release();
	}
}

async function main(): Promise<void> {
	// Only run migrations if `migrate` command used.
	if (process.argv[2] === "migrate") {
		const pool = new Pool({ connectionString: config.db.uri });
		await connectDB(pool);
		try {
			await runMigrations(pool);
		} catch (error) {
			console.error("Failed to run migrations", error);
			process.exit(1);
		}
		process.exit(0);
	}

	try {
		await startServer();
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
