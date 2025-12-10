import { expect, test } from "vitest";

test("adds 1 + 2 to equal 3", (): void => {
	const one: number = 1;
	const two: number = 2;
	expect(one + two).toBe(3);
});
