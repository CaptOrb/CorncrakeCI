import { resolve } from "node:path";
import { ExpressRuntimeError } from "@nahkies/typescript-express-runtime/errors";
import pgSimple from "connect-pg-simple";
import type { ErrorRequestHandler } from "express";
import express, { type Application } from "express";
import session from "express-session";
import { Pool } from "pg";
import { migrate } from "postgres-migrations";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import { config } from "../config";
import { connectDB } from "../config/db";
import apiOpenapi from "../generated/api/@typespec/openapi3/openapi.json";
import { createRouter } from "../generated/server/generated";
import { runJobs } from "../jobs/graphile-worker";
import authRouter from "../routes/auth";
import {
	configureRepo,
	getRepo,
	listAvailableRepos,
	listConfiguredRepos,
	reconfigureRepo,
} from "../server/api/repositories";
import { createForgesFromConfig } from "../services/forges";
import { seedForges } from "../util/seedforges";

export async function createWebServer({
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

	app.use(errorHandler);

	return app;
}

/**
 * Handles errors that occur whilst processing a request.
 *
 * Current rules:
 * - Request validation errors (`ExpressRuntimeError` with cause of `ZodError` and phase of `request_validation`)
 *   are converted to 400 Bad Request responses with clean details.
 *   These are logged without stack trace.
 * - Other errors give generic 500 responses (so as not to reveal potentially sensitive information)
 *   but log the full error as normal.
 */
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
	let statusCode = 500;
	let errorBody: {
		error: string;
		details?: Record<string, unknown> | unknown;
	} = {
		error: "Internal Server Error",
	};
	let toLog: (Error | string)[] = [err];
	if (err instanceof ExpressRuntimeError) {
		if (err.phase === "request_validation") {
			const cause = err.cause;
			if (cause instanceof ZodError) {
				statusCode = 400;
				// Clean up the error a bit so we don't return stringified JSON
				errorBody = {
					// the message will include which parser failed
					error: `Invalid request (${err.message})`,
					details: { issues: cause.issues },
				};

				// Also don't log the error itself, we don't want a stack trace,
				// just a summary will do
				const firstIssue = cause.issues[0]!;
				const firstIssuePath = firstIssue.path.join(".");
				const more =
					cause.issues.length > 1 ? ` (& ${cause.issues.length - 1} more)` : "";
				toLog = [`${firstIssue.message} (@${firstIssuePath})${more}`];
			} else {
				errorBody = {
					// If we hit this point, we should add handling code to report a proper error
					error: `Invalid request (unknown)`,
				};
				// Also make it clear that it's not properly handled
				toLog = ["(unexpected kind)", ...toLog];
			}
		}
	}
	const user = req.session?.userId ?? "-";
	console.error(
		`Error ${statusCode} on ${req.method} ${req.path} for user ${user}:`,
		...toLog,
	);
	res.status(statusCode).json(errorBody);
};

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

	// Intentionally don't await
	void runJobs(pool);

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

export async function main(): Promise<void> {
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
