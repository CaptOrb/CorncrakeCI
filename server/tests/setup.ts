import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { getBaseDbConfig, setupTemplate } from "./helpers/database";

function findAndLoadEnvFiles() {
	// Note: Earlier env files win
	const envPaths = [
		resolve(__dirname, "..", ".env.test"), // In server/
		resolve(__dirname, "..", ".env"), // In server/
		resolve(__dirname, "..", "..", ".env"), // In repo root
	];

	for (const envPath of envPaths) {
		try {
			loadEnvFile(envPath);
		} catch {
			// Ignore errors
		}
	}
}

export default async function globalSetup() {
	findAndLoadEnvFiles();

	// Setup the template database just once, before any test files run
	//
	// Caveat of doing this here: we'll always setup the template DB,
	// even if no database tests are going to be running.
	//
	// But it's hard to co-ordinate between test processes to make sure
	// only one test process runs it, so hard to do it on-demand.
	const baseConfig = getBaseDbConfig();
	const adminClient = new Client(baseConfig);
	await adminClient.connect();
	try {
		const startTime = Date.now();
		await setupTemplate(adminClient);
		const endTime = Date.now();
		console.log(`Template setup took ${endTime - startTime}ms`);
	} finally {
		await adminClient.end();
	}
}
