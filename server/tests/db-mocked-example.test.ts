import type { PoolClient, QueryResult } from 'pg';
import { UserStore } from '../src/db/stores/user';

/**
 * Example of mocking PostgreSQL for simpler unit tests.
 * 
 * Pros:
 * - No Docker required
 * - Faster execution
 * - Easy to test edge cases
 * 
 * Cons:
 * - Doesn't catch SQL syntax errors
 * - Doesn't test database constraints
 * - Mocks can drift from reality
 */
describe('Database tests with mocked PostgreSQL', () => {
	let mockClient: PoolClient;
	let mockQuery: jest.Mock;
	let userStore: UserStore;

	beforeEach(() => {
		mockQuery = jest.fn();
		
		mockClient = {
			query: mockQuery,
		} as unknown as PoolClient;

		userStore = new UserStore(mockClient);
	});

	it('should find user by ID', async () => {
		const mockUser = {
			user_id: 1,
			forge_id: 1,
			forge_user_id: 'user123',
			access_token: 'token123',
		};

		const mockResult: QueryResult<typeof mockUser> = {
			rows: [mockUser],
			rowCount: 1,
			command: 'SELECT',
			oid: 0,
			fields: [],
		};

		mockQuery.mockResolvedValueOnce(mockResult);

		const result = await userStore.findUserById(1);

		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining('SELECT * FROM users WHERE user_id'),
			[1],
		);
		expect(result).toEqual(mockUser);
	});

	it('should return null when user not found', async () => {
		const mockResult: QueryResult<never> = {
			rows: [],
			rowCount: 0,
			command: 'SELECT',
			oid: 0,
			fields: [],
		};

		mockQuery.mockResolvedValueOnce(mockResult);

		const result = await userStore.findUserById(999);

		expect(result).toBeNull();
	});

	it('should insert user', async () => {
		const mockInsertedUser = {
			user_id: 1,
			forge_id: 1,
			forge_user_id: 'newuser',
		};

		const mockResult: QueryResult<typeof mockInsertedUser> = {
			rows: [mockInsertedUser],
			rowCount: 1,
			command: 'INSERT',
			oid: 0,
			fields: [],
		};

		mockQuery.mockResolvedValueOnce(mockResult);

		const result = await userStore.insertUser(1, 'newuser', 'token123');

		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO users'),
			[1, 'newuser', 'token123', undefined],
		);
		expect(result).toEqual(mockInsertedUser);
	});

	it('should handle getOrCreateUser with conflict', async () => {
		const mockUser = {
			user_id: 1,
			forge_id: 1,
			forge_user_id: 'existing',
			access_token: 'newtoken',
			token_expires_at: null,
		};

		const mockResult: QueryResult<typeof mockUser> = {
			rows: [mockUser],
			rowCount: 1,
			command: 'INSERT',
			oid: 0,
			fields: [],
		};

		mockQuery.mockResolvedValueOnce(mockResult);

		const result = await userStore.getOrCreateUser(1, 'existing', 'newtoken');

		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining('ON CONFLICT'),
			[1, 'existing', 'newtoken', undefined],
		);
		expect(result.access_token).toBe('newtoken');
	});
});

