import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ExpressRuntimeError } from "@nahkies/typescript-express-runtime/errors";
import pgSimple from "connect-pg-simple";
import type { ErrorRequestHandler } from "express";
import express, { type Application, type Request } from "express";
import session from "express-session";
import { Pool } from "pg";
import { migrate } from "postgres-migrations";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import { config } from "../config";
import { connectDB } from "../config/db";
import v0OpenApi from "../generated/api/@typespec/openapi3/openapi.json";
import {
	createRouter,
	type Implementation,
} from "../generated/server/generated";
import { runJobs } from "../jobs/graphile-worker";
import authRouter from "../server/routes/auth";
import { createForgesFromConfig } from "../services/forges";
import { getTokenInfo } from "../services/user";
import { IdGenerator } from "../util/counter";
import { createLogger, withLogContext } from "../util/logging";
import { seedForges } from "../util/seedforges";
import type { Brand } from "../util/typing";
import {
	checkPipelines,
	configureRepo,
	getRepo,
	listAvailableRepos,
	listBranches,
	listConfiguredRepos,
	listForges,
	reconfigureRepo,
} from "./api/repositories";
import { whoAmI } from "./api/users";
import { handleWebhook } from "./api/webhooks";
import { BaseError, NotImplementedError } from "./errors";

const log = createLogger(import.meta.url);

const OPENAPI_DEFINITIONS = {
	v0: v0OpenApi,
};

const LATEST_API_VERSION: keyof typeof OPENAPI_DEFINITIONS = "v0";

export interface RawBodyRequest extends Request {
	rawBody?: Buffer;
}

export async function createApiServer({
	isProduction,
	pool,
	enableSwagger = false,
}: {
	isProduction: boolean;
	pool: Pool;
	enableSwagger?: boolean;
}): Promise<Application> {
	const app = express();

	const webhookJsonParser = express.json({
		verify: (req: RawBodyRequest, _res, buf) => {
			// Store the raw body bytes for later, as we need them to do a
			// HMAC verification when processing webhook requests
			req.rawBody = buf;
		},
	});
	// the underscore denotes that this is not a public interface
	app.post("/_webhooks/:repoId", webhookJsonParser, handleWebhook);

	app.use(express.json());

	const sessionCookieName = isProduction ? "__Host-SessionID" : "sessionID";

	const PgSession = pgSimple(session);
	app.set("trust proxy", config.app.trustproxy);
	app.use(
		session({
			name: sessionCookieName,
			secret: config.session.secret,
			resave: false,
			saveUninitialized: false,
			rolling: true, // session identifier cookie will expire in maxAge since the last response was sent instead of in maxAge since the session was last modified by the server
			store: new PgSession({
				pool,
				createTableIfMissing: true,
				pruneSessionInterval: 60 * 15, // removes old sessions from db
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

	// Middleware to invalidate session if access token is missing/invalid
	app.use(async (req, res, next) => {
		try {
			if (req.session?.userId !== undefined) {
				const tokenInfo = await getTokenInfo(req.session.userId);
				if (!tokenInfo) {
					log.debug("No tokens found - invalidating session");

					await promisify(req.session.regenerate).apply(req.session);

					res.clearCookie(sessionCookieName, { path: "/" });
				}
			}

			return next();
		} catch (err) {
			return next(err);
		}
	});

	// the v0 signals that this is currently unversioned and we will change the API.
	// In the future, we will have a more stable v1 API.
	const notImplemented = () => {
		throw new NotImplementedError();
	};

	app.use(
		"/v0",
		createRouter({
			listForges,
			listAvailableRepos,
			listBranches,
			listConfiguredRepos,
			getRepo,
			checkPipelines,
			configureRepo,
			reconfigureRepo,
			whoAmI,
			listPipelines: notImplemented,
			getPipeline: notImplemented,
			cancelPipeline: notImplemented,
			retryPipeline: notImplemented,
			dispatchPipeline: notImplemented,
			getJob: notImplemented,
			retryJob: notImplemented,
			getJobLogs: notImplemented,
			getStepLogs: notImplemented,
			listJobArtifacts: notImplemented,
			downloadArtifact: notImplemented,
			listRunners: notImplemented,
		} satisfies Implementation),
	);

	// the Forge login endpoints are kept externally from the OpenAPI-defined API
	// and are intentionally unversioned right now
	app.use("/auth", authRouter);

	if (enableSwagger) {
		for (const [apiVersion, apiOpenapi] of Object.entries(
			OPENAPI_DEFINITIONS,
		)) {
			const apiOpenapiWithBase = {
				...apiOpenapi,
				servers: [{ url: `/api/${apiVersion}` }],
			};
			app.use(
				`/${apiVersion}/swagger`,
				swaggerUi.serve,
				swaggerUi.setup(apiOpenapiWithBase, {
					customSiteTitle: `CORNCRAKECI API ${apiVersion}`,
				}),
			);
		}

		app.get("/", (_req, res) => {
			return res.redirect(`./${LATEST_API_VERSION}/swagger`);
		});
	}

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

	// Helper function to handle our custom errors
	const handleCustomError = (customErr: BaseError) => {
		statusCode = customErr.statusCode;
		errorBody = {
			error: customErr.message,
		};
		toLog = [`${customErr.name}: ${customErr.message}`];
	};

	// Check for custom errors
	const errorToCheck = err instanceof ExpressRuntimeError ? err.cause : err;
	if (errorToCheck instanceof BaseError) {
		handleCustomError(errorToCheck);
	} else if (err instanceof ExpressRuntimeError) {
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
	log.error(
		{ statusCode, method: req.method, path: req.path, user, details: toLog },
		"Request error",
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
	const app = express();

	app.use(
		"/api",
		await createApiServer({
			isProduction,
			pool,
			enableSwagger: true,
		}),
	);

	// Install a middleware to attach log contexts to requests
	const requestIdGenerator = new IdGenerator(1 as Brand<number, "requestID">);
	app.use((req, resp, next) => {
		void withLogContext(
			`${req.method}-${requestIdGenerator.next()}`,
			async () => {
				const reqInfo = {
					method: req.method,
					path: req.path,
				};
				log.debug(reqInfo, "Received request");

				// Unlike `finish`, `close` is always fired
				resp.on("close", () => {
					// Log once the request is processed
					log.info(
						{ responseCode: resp.statusCode, ...reqInfo },
						"Processed request",
					);
				});

				next();
			},
		);
	});

	// Intentionally don't await
	void runJobs(pool);

	const PORT = config.app.port;
	app.listen(PORT, config.app.bindaddress, () => {
		log.info(
			{
				port: PORT,
				bindAddress: config.app.bindaddress,
				mode: isProduction ? "production" : "development",
			},
			"Server running",
		);
	});
}

async function runMigrations(pool: Pool): Promise<void> {
	const client = await pool.connect();
	try {
		// Get current directory in a ESM-friendly way
		const currentFilename = fileURLToPath(import.meta.url);
		const currentDirname = path.dirname(currentFilename);
		const migrationsDir = path.join(currentDirname, "../../migrations");

		await migrate({ client }, migrationsDir, {
			// Enable logging to see which migrations are being applied
			logger: (msg) => log.info({ msg }, "Migration"),
		});
	} catch (err) {
		log.error({ err }, "Migration failed");
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
			log.error({ err: error }, "Failed to run migrations");
			process.exit(1);
		}
		process.exit(0);
	}

	try {
		await startServer();
	} catch (error) {
		log.error({ err: error }, "Failed to start server");
		process.exit(1);
	}
}
