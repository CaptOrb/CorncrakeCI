import { parse as parseKDL } from "@bgotink/kdl";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import type { V0File } from "../../../src/pipeline/v0/ast";
import { FatalParseError } from "../../../src/pipeline/v0/error";
import { V0Parser } from "../../../src/pipeline/v0/parser";

//just a sugary wrapper around the one we want to test
function parse(_file: "parseFile", text: string): V0File {
	const doc = parseKDL(text);

	const parser = new V0Parser();

	try {
		const parsedFile = parser.parseFile(doc.nodes);
		if (parser.errors.length > 0) {
			throw new Error(parser.errors[0]?.message || "Unknown parsing error");
		}
		return parsedFile;
	} catch (e) {
		if (e instanceof FatalParseError && parser.errors.length > 0) {
			// rethrow the error so we can check for it in tests
			throw new Error(parser.errors[0]?.message || "Unknown parsing error");
		}
		throw e;
	}
}

describe("V0Parser tests", () => {
	it("parses an empty file", () => {
		const out = parse("parseFile", `molci version=v0`);
		expect(out).toEqual({
			uses: [],
			workflows: [],
		});
	});

	it("parses an empty file - but molci version is invalid", () => {
		expect(() => parse("parseFile", `molci version=v1`)).toThrow(
			"Expected version=v0, got version=v1",
		);
	});

	it("fails when the molci header has an extra unused property", () => {
		expect(() =>
			parse("parseFile", `molci version=v0 somenonsensehere=othernonsensehere`),
		).toThrow("Unexpected property 'somenonsensehere' on node 'molci'");
	});

	it("fails when the molci header is missing", () => {
		expect(() => parse("parseFile", ``)).toThrow("Missing version header");
	});

	it("fails when the first node is not 'molci'", () => {
		expect(() => parse("parseFile", `notmolci version=v0`)).toThrow(
			"Expected first node to be 'molci', got 'notmolci'",
		);
	});

	describe("parseNodeAttributes tests", () => {
		it("parses properties by name", () => {
			const doc = parseKDL(`node name="test" count=42`);
			const parser = new V0Parser();
			const schema = v.object({
				name: v.string(),
				count: v.number(),
			});

			const result = parser.parseNodeAttributes(
				doc.nodes[0]!,
				[],
				["name", "count"],
				schema,
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.attrs).toEqual({
					name: "test",
					count: 42,
				});
			}
		});
	});
});
