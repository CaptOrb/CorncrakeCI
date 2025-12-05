import { Client, Pool, type PoolClient } from 'pg';
import crypto from 'crypto';
import { Transaction } from '../src/db/stores/transaction';

interface DbConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	template: string;
}

/**
 * Result of setupDb containing the pool and cleanup function
 */
export interface SetupDbResult {
	pool: Pool;
	cleanup: () => Promise<void>;
}

/**
 * Sets up an isolated test database for a test.
 * Creates a new database from a template (which should have migrations already applied).
 *
 *  Prerequisites:
 * - Docker container must be running: `docker compose up -d molci-db`
 * - Template database must exist (created by jest.setup.ts)
 *
 * @returns An object with the PostgreSQL Pool and a cleanup functi
 * */

export async function setupDb(): Promise<SetupDbResult> {
	// Generate a unique DB name
	const dbName = `molci_test_${crypto.randomBytes(6).toString('hex')}`;

	const config: DbConfig = {
		host: process.env['PG_HOST'] || 'localhost',
		port: Number(process.env['PG_PORT'] || 5432),
		user: process.env['MOLCI_DB_USER'] || process.env['PG_USER'] || 'postgres',
		password: process.env['MOLCI_DB_PASSWORD'] || process.env['PG_PASSWORD'] || 'postgres',
		template: process.env['PG_TEMPLATE_DB'] || 'molci_test_template', // migrated template DB
	};

	let adminClient: Client | null = null;
	let pool: Pool | null = null;

	try {
		// Connect to Postgres (template DB) to create the new DB
		adminClient = new Client({ ...config, database: config.template });
		
		try {
			await adminClient.connect();
		} catch (connectError) {
			const error = connectError as Error;
			if (
				error.message.includes('ECONNREFUSED') ||
				error.message.includes('connect') ||
				error.message.includes('timeout')
			) {
				throw new Error(
					`Cannot connect to PostgreSQL at ${config.host}:${config.port}. ` +
					`Make sure your Docker container is running: ` +
					`\`docker compose up -d molci-db\` or ` +
					`\`docker compose up -d\`\n` +
					`Original error: ${error.message}`,
				);
			}
			throw error;
		}

		// Create new DB from template (fast - just copies the template)
		await adminClient.query(`CREATE DATABASE "${dbName}" WITH TEMPLATE "${config.template}"`);
		await adminClient.end();
		adminClient = null;

		// Create a Pool for the test database (matches production pattern)
		pool = new Pool({
			host: config.host,
			port: config.port,
			user: config.user,
			password: config.password,
			database: dbName,

			max: 2,
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

				// Connect to template DB to drop the test DB
				const dropClient = new Client({ ...config, database: config.template });
				await dropClient.connect();

				try {
					// Terminate any remaining connections to allow dropping
					await dropClient.query(
						`
						SELECT pg_terminate_backend(pid)
						FROM pg_stat_activity
						WHERE datname = $1 AND pid <> pg_backend_pid()
					`,
						[dbName],
					);

					await dropClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
				} finally {
					await dropClient.end();
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
				await adminClient.end();
			} catch {
				// Ignore cleanup errors
			}
		}

		// Try to drop the database if it was created
		if (dbName) {
			try {
				const dropClient = new Client({ ...config, database: config.template });
				await dropClient.connect();
				await dropClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
				await dropClient.end();
			} catch {
				// Ignore cleanup errors
			}
		}

		const errorMessage = error instanceof Error ? error.message : String(error);
		
		// Provide helpful hints for common errors
		if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
			throw new Error(
				`Failed to setup test database: ${errorMessage}\n` +
				`\n💡 Tip: Make sure your Docker container is running:\n` +
				`   docker compose up -d molci-db\n` +
				`   Or start all services: docker compose up -d`,
			);
		}
		
		if (errorMessage.includes('password authentication failed')) {
			throw new Error(
				`Failed to setup test database: ${errorMessage}\n` +
				`\n💡 Tip: Check your database credentials in .env file or environment variables.`,
			);
		}
		
		if (errorMessage.includes('does not exist')) {
			throw new Error(
				`Failed to setup test database: ${errorMessage}\n` +
				`\n💡 Tip: The template database "${config.template}" may not exist. ` +
				`Make sure jest.setup.ts has run successfully to create it.`,
			);
		}
		
		throw new Error(`Failed to setup test database: ${errorMessage}`);
	}
}

/**
 * Creates a transaction function that uses the provided test pool.
 * This allows you to use the existing transaction pattern with a test database.
 *
 * Note: Since each test gets its own isolated database (via setupDb),
 * you can commit transactions normally - the database will be dropped after the test.
 *
 * @param pool - The test database pool from setupDb()
 * @returns A transaction function compatible with the existing transaction pattern
 *
 * @example
 * ```ts
 * import { setupDb, createTestTransaction } from './jest-db-helper';
 *
 * describe('my tests', () => {
 *   let pool: Pool;
 *   let transaction: ReturnType<typeof createTestTransaction>;
 *
 *   beforeAll(async () => {
 *     pool = await setupDb();
 *     transaction = createTestTransaction(pool);
 *   });
 *
 *   afterAll(async () => {
 *     await pool.end();
 *   });
 *
 *   it('should test', async () => {
 *     // Each test has its own database, so commits work normally
 *     await transaction(async (txn) => {
 *       const user = await txn.users.insertUser(1, 'user123');
 *       const repo = await txn.repositories.createOrUpdateRepository(...);
 *       // Transaction commits normally - database is dropped after test anyway
 *     });
 *   });
 * });
 * ```
 */
export function createTestTransaction(pool: Pool) {
	return async function transaction<T>(
		fn: (txn: Transaction) => Promise<T>,
	): Promise<T> {
		const client: PoolClient = await pool.connect();

		try {
			await client.query('BEGIN');

			const txn = new Transaction(client);
			const result = await fn(txn);

			await client.query('COMMIT');

			return result;
		} catch (e) {
			await client.query('ROLLBACK');
			throw e;
		} finally {
			client.release();
		}
	};
}

