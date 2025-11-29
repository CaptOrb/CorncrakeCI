import { pool } from "../../config/db";
import { Transaction } from "./transaction";

export async function txn<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
	const client = await pool.connect();

	try {
		await client.query("BEGIN");

		const tx = new Transaction(client);
		const result = await fn(tx);

		await client.query("COMMIT");

		return result;
	} catch (e) {
		await client.query("ROLLBACK");
		throw e;
	} finally {
		client.release();
	}
}
