import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		globalSetup: "./tests/setup.ts",
		// Hide logs from passing tests
		silent: "passed-only",
	},
});
