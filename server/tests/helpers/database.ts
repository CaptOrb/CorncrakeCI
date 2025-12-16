import crypto from "node:crypto";
import { runMigrations } from "graphile-worker";
import { Client, type ClientBase, type ClientConfig, Pool } from "pg";
import { parseIntoClientConfig } from "pg-connection-string";
import { migrate } from "postgres-migrations";
import { afterEach, beforeEach } from "vitest";
import { _setPool } from "../../src/config/db";

const TEMPLATE_DB_NAME = "molci_test_template";

/**
 * Result of setupDb containing the pool and cleanup function
 */
export interface SetupDbResult {
	pool: Pool;
	cleanup: () => Promise<void>;
}

/**
 * Get the base database config, upon which new databases will be created.
 */
export function getBaseDbConfig(): ClientConfig {
	// if (Object.hasOwn(process.env, "TEST_DB_URI")) {
	//   return parseIntoClientConfig(process.env["TEST_DB_URI"]!);
	// }

	if (!Object.hasOwn(process.env, "DB_URI")) {
		throw new Error("DB_URI env var must be set for database tests");
	}
	// biome-ignore lint/complexity/useLiteralKeys: needed for env
	return parseIntoClientConfig(process.env["DB_URI"]!);
}

/**
 * Sets up an isolated test database for a test.
 *
 * Creates a new database from a template (which should have migrations already applied).
 *
 *  Prerequisites:
 * - Database server must be running, with a connection URL available on `DB_URI`
 * - Template database must have been setup (this is done in globalSetup).
 * - Database user must have the rights to create new databases.
 *
 * @returns An object with the PostgreSQL Pool and a cleanup function.
 */
export async function setupDb(): Promise<SetupDbResult> {
	const baseConfig = getBaseDbConfig();
	const adminClient = new Client(baseConfig);
	await adminClient.connect();

	// By this point, the template database must have already been setup.

	// Generate a unique DB name
	// ideally we'd base it off the test name, but those are quite verbose...
	// console.log("test name", expect.getState().currentTestName);
	const dbName = `molci_test_${crypto.randomBytes(6).toString("hex")}`;

	let pool: Pool | null = null;

	try {
		// Create new DB from template (fast - just copies the template)
		await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
		await adminClient.query(
			`CREATE DATABASE "${dbName}" WITH TEMPLATE "${TEMPLATE_DB_NAME}"`,
		);

		// Create a Pool for the test database
		pool = new Pool({
			...baseConfig,
			database: dbName,

			// TODO is 1 enough?
			max: 1,
		});

		// Test the connection
		const testClient = await pool.connect();
		testClient.release();

		// Create cleanup function (caller must register it in afterAll)
		const cleanup = async () => {
			try {
				if (pool) {
					await pool.end();
					pool = null;
				}

				try {
					const res = await adminClient.query(
						`
					SELECT
						pid,
						state,
						query,
						query_start,
						backend_start
					FROM pg_stat_activity
					WHERE datname = $1
					AND pid <> pg_backend_pid()
					`,
						[dbName],
					);

					console.log("Connections to terminate:", res.rows);

					// Terminate any remaining connections to allow dropping
					// TODO This might not work...
					await adminClient.query(
						`
						SELECT pg_terminate_backend(pid)
						FROM pg_stat_activity
						WHERE datname = $1 AND pid <> pg_backend_pid()
					`,
						[dbName],
					);

					await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
				} finally {
					await adminClient.end();
				}
			} catch (error) {
				// Log but don't throw - cleanup errors shouldn't fail tests
				console.error(`Failed to cleanup test database ${dbName}:`, error);
			}
		};

		return { pool, cleanup };
	} catch (error) {
		// Cleanup on error
		if (pool) {
			try {
				await pool.end();
			} catch {
				// Ignore cleanup errors
			}
		}
		if (adminClient) {
			try {
				// Try to drop the database if it was created
				try {
					await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
				} catch {
					// Ignore cleanup errors
				}

				await adminClient.end();
			} catch {
				// Ignore cleanup errors
			}
		}

		const errorMessage = error instanceof Error ? error.message : String(error);

		// Provide helpful hints for common errors
		if (
			errorMessage.includes("ECONNREFUSED") ||
			errorMessage.includes("connect")
		) {
			throw new Error(
				`Failed to setup test database: ${errorMessage}\n` +
					`\n Tip: Make sure your Docker container is running:\n` +
					`   docker compose up -d molci-db\n` +
					`   Or start all services: docker compose up -d`,
			);
		}

		throw new Error(`Failed to setup test database: ${errorMessage}`);
	}
}

///// One-time setup of the template database

let templateSetupComplete: boolean = false;

export async function setupTemplate(adminClient: ClientBase) {
	if (templateSetupComplete) {
		return;
	}

	const baseConfig = getBaseDbConfig();

	// TODO We should get an advisory lock for the test setup.

	// First (re)create the template database from scratch.
	// TODO: we could try to avoid recreating if it already is setup with the right migrations
	await adminClient.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB_NAME}`);
	await adminClient.query(`CREATE DATABASE ${TEMPLATE_DB_NAME}`);

	// Then run the migrations on the template database
	try {
		const templatePool = new Pool({
			...baseConfig,
			database: TEMPLATE_DB_NAME,
		});

		try {
			await migrate({ client: templatePool }, "./migrations", {
				// logger: (msg) => console.log(`[Test Setup Migration] ${msg}`),
			});

			await runMigrations({
				pgPool: templatePool,
				schema: "graphile_worker",
				noPreparedStatements: false,
			});

			console.log(
				`Template database ${TEMPLATE_DB_NAME} is ready with migrations`,
			);
		} finally {
			await templatePool.end();
		}
	} catch (error) {
		console.error("Failed to setup template database:", error);
		throw error;
	}

	templateSetupComplete = true;
}

///// All-in-one helper for database tests

/**
 * All-in-one helper for database test suites.
 *
 * Sets up a fresh database and registers it, for every test.
 *
 * Cleans up the database after the test.
 */
export function databaseHelper(
	onPoolCreated?: (pool: Pool) => void | Promise<void>,
) {
	let cleanup: () => Promise<void>;
	beforeEach(async () => {
		const result = await setupDb();
		cleanup = result.cleanup;

		_setPool(result.pool);

		if (onPoolCreated) {
			await onPoolCreated(result.pool);
		}
	});

	afterEach(async () => {
		// Clean up: drops the database and closes the pool
		await cleanup();
	});
}
