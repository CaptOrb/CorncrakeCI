import { pool } from "../../config/db";
import { Transaction } from "./transaction";

export async function transaction<T>(
	fn: (txn: Transaction) => Promise<T>,
): Promise<T> {
	const client = await pool.connect();

	try {
		await client.query("BEGIN");

		const txn = new Transaction(client);
		const result = await fn(txn);

		await client.query("COMMIT");

		return result;
	} catch (e) {
		await client.query("ROLLBACK");
		throw e;
	} finally {
		client.release();
	}
}
