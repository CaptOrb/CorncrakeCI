import { describe, expect, it, test } from "vitest";

import { getForge } from "../src/services/forges";
import { testForgeHelper } from "./helpers/forge";

test("adds 1 + 2 to equal 3", (): void => {
	const one: number = 1;
	const two: number = 2;
	expect(one + two).toBe(3);
});

describe("Temporary test for test forge", () => {
	testForgeHelper();

	it("should give us forge ID 1", async () => {
		expect(getForge(1)).not.toBeNull();
		expect(getForge(2)).toBeNull();
	});
});
