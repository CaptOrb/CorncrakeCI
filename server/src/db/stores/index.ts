import { pool } from "../../config/db";
import { Transaction } from "./transaction";

/**
 * Executes a function within a database transaction.
 *
 * Automatically handles transaction: begins the transaction, executes the
 * provided function, commits on success, and rolls back on error.
 *
 * Must be called after the database pool has been set.
 */
export async function transaction<T>(
	fn: (txn: Transaction) => Promise<T>,
): Promise<T> {
	if (pool === null) throw new Error("database not connected");

	// This `execute` wrapper will automatically commit on success
	// or rollback on exception
	return pool.transaction().execute(async (kyselyTransaction) => {
		const txn = new Transaction(kyselyTransaction);
		return fn(txn);
	});
}
