import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// enables describe, it, expect without imports
		globals: true,
		environment: "node",
		globalSetup: "./tests/setup.ts",
	},
});
