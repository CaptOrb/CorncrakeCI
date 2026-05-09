import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			exclude: ["**/generated/**", "**/tests/helpers"],
		},
		globals: false,
		environment: "node",
		globalSetup: "./tests/setup.ts",
		// Hide logs from passing tests
		silent: "passed-only",
	},
});
