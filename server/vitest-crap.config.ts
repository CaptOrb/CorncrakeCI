/**
 * Invoke with `vitest -c vitest-crap.config.ts` to calculate the CRAP metrics for functions.
 *
 * Higher CRAP means that a function is more complex and/or less covered.
 */

import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

export default withCrapTypescriptVitest(
	{
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
	},
	{
		format: "text",
		// This threshold is suggested at
		// The Code C.R.A.P. Metric Hits the Fan - Introducing the crap4j Plug-in
		// Alberto Savoia (2007)
		// https://www.artima.com/weblogs/viewpost.jsp?thread=215899
		threshold: 30,
	},
);
