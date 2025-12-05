import { Pool } from 'pg';
import { setupDb, createTestTransaction } from './jest-db-helper';

/**
 * Example test demonstrating the per-test database pattern.
 * 
 * This pattern:
 * - Creates a unique database for each test suite (via setupDb)
 * - Clones from a template database (fast - migrations already applied)
 * - Provides perfect isolation - each test suite has its own database
 * - Database is automatically dropped after tests complete
 * 
 *  Prerequisites: Docker container must be running (`docker compose up -d molci-db`)
 */
describe('Database tests with per-test database', () => {
	let pool: Pool;
	let transaction: ReturnType<typeof createTestTransaction>;
	let cleanup: () => Promise<void>;

	beforeAll(async () => {
		// Create a unique test database from template
		const result = await setupDb();
		pool = result.pool;
		cleanup = result.cleanup;

		transaction = createTestTransaction(pool);
	});

	afterAll(async () => {
		// Clean up: drops the database and closes the pool
		await cleanup();
	});

	it('should test database connection', async () => {
		// Simple connection test
		await transaction(async (txn) => {
			const { rows } = await txn.client.query('SELECT 1 AS "result"');
			expect(rows[0].result).toBe(1);
		});
	});

	it('should persist data within the test suite', async () => {
		// First, create a forge (required foreign key)
		await transaction(async (txn) => {
			await txn.client.query(
				`INSERT INTO forges (forge_id, display_name, base_url)
				VALUES ($1, $2, $3)
				ON CONFLICT (forge_id) DO NOTHING`,
				[1, 'gitea', 'http://localhost:3001'],
			);
		});

		// Insert a test user (access_token is required by schema)
		await transaction(async (txn) => {
			const user = await txn.users.insertUser(1, 'test_user_123', 'test_token_123');
			expect(user.forge_user_id).toBe('test_user_123');
			expect(user.forge_id).toBe(1);

			// Verify we can read it back
			const found = await txn.users.findUserById(user.user_id);
			expect(found).not.toBeNull();
			expect(found?.forge_user_id).toBe('test_user_123');
		});

		// Data persists across transactions in the same test suite
		await transaction(async (txn) => {
			const found = await txn.users.findUserByForge(1, 'test_user_123');
			expect(found).not.toBeNull();
			expect(found?.forge_user_id).toBe('test_user_123');
		});
	});

	it('should handle errors and rollback transaction', async () => {
		// Ensure forge exists first
		await transaction(async (txn) => {
			await txn.client.query(
				`INSERT INTO forges (forge_id, display_name, base_url)
				VALUES ($1, $2, $3)
				ON CONFLICT (forge_id) DO NOTHING`,
				[1, 'gitea', 'http://localhost:3001'],
			);
		});

		await expect(
			transaction(async (txn) => {
				// Insert a user (access_token required)
				await txn.users.insertUser(1, 'error_test_user', 'test_token');
				// Simulate an error
				throw new Error('Test error');
			}),
		).rejects.toThrow('Test error');

		// Verify rollback happened - data not persisted
		await transaction(async (txn) => {
			const found = await txn.users.findUserByForge(1, 'error_test_user');
			expect(found).toBeNull();
		});
	});
});

