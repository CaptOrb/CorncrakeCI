import { Client } from "pg";
import { migrate } from "postgres-migrations";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile() {
	const possiblePaths = [
		resolve(process.cwd(), ".env"), // Server directory (when running from server/)
		resolve(process.cwd(), "..", ".env"), // Project root (when running from server/)
		resolve(__dirname, "..", ".env"), // Relative to this file
	];

	let envFile: string | null = null;
	for (const envPath of possiblePaths) {
		try {
			envFile = readFileSync(envPath, "utf-8");
			break;
		} catch {
			// Try next path
		}
	}

	if (!envFile) {
		console.warn(
			"Could not find .env file, using environment variables or defaults",
		);
		return;
	}

	for (const line of envFile.split("\n")) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith("#")) continue;

		const [key, ...valueParts] = trimmed.split("=");
		if (key && valueParts.length > 0) {
			const value = valueParts.join("=").trim();
			// Remove quotes if present
			const cleanValue = value.replace(/^["']|["']$/g, "");
			// Only set if not already in process.env (env vars take precedence)
			if (!process.env[key.trim()]) {
				process.env[key.trim()] = cleanValue;
			}
		}
	}
}

/**
 * Jest global setup: Creates and migrates a template database.
 * Individual tests will clone this template to create isolated test databases.
 *
 *  Prerequisites:
 * - Docker container must be running: `docker compose up -d molci-db`
 * - Database credentials must be configured (via .env or environment variables)
 *
 * This approach:
 * - Creates a template database once with migrations applied
 * - Each test gets its own database cloned from the template (fast!)
 * - Perfect isolation - each test has a completely fresh database
 * - No need for transaction rollbacks - just drop the test DB after each test
 */
async function globalSetup() {
	loadEnvFile();
	const templateDbName = process.env["PG_TEMPLATE_DB"] || "molci_test_template";
	const config = {
		host: process.env["PG_HOST"] || "localhost",
		port: Number(process.env["PG_PORT"] || 5432),
		user: process.env["MOLCI_DB_USER"] || process.env["PG_USER"] || "postgres",
		password:
			process.env["MOLCI_DB_PASSWORD"] ||
			process.env["PG_PASSWORD"] ||
			"postgres",
		database: "postgres", // Connect to default postgres DB to create template
	};

	const client = new Client(config);

	try {
		try {
			await client.connect();
		} catch (connectError) {
			const error = connectError as Error;

			throw error;
		}

		const dbCheck = await client.query(
			`SELECT 1 FROM pg_database WHERE datname = $1`,
			[templateDbName],
		);

		if (dbCheck.rows.length === 0) {
			// Create template database if it doesn't exist
			await client.query(`CREATE DATABASE "${templateDbName}"`);
			console.log(`Created template database: ${templateDbName}`);
		}

		await client.end();

		const templateClient = new Client({ ...config, database: templateDbName });
		await templateClient.connect();

		try {
			await migrate({ client: templateClient }, "./migrations", {
				logger: (msg) => console.log(`[Test Setup Migration] ${msg}`),
			});
			console.log(
				`Template database ${templateDbName} is ready with migrations`,
			);
		} finally {
			await templateClient.end();
		}
	} catch (error) {
		console.error("Failed to setup template database:", error);
		throw error;
	}
}

export default globalSetup;
