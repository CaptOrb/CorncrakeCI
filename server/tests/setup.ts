import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

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

export default function globalSetup() {
	findAndLoadEnvFiles();
}
