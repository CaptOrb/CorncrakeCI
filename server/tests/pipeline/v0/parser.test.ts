import { parse as parseKDL } from "@bgotink/kdl";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import type { UserStepDeclaration, V0File } from "../../../src/pipeline/v0/ast";
import { FatalParseError } from "../../../src/pipeline/v0/error";
import { V0Parser } from "../../../src/pipeline/v0/parser";

//just a sugary wrapper around the one we want to test
function parse(_file: "parseFile", text: string): V0File {
	const doc = parseKDL(text, { storeLocations: true });

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
		const out = parse("parseFile", `corncrake version=v0`);
		expect(out).toEqual({
			uses: [],
			workflows: [],
		});
	});

	it("parses an empty file - but corncrake version is invalid", () => {
		expect(() => parse("parseFile", `corncrake version=v1`)).toThrow(
			'Invalid type: Expected "v0" but received "v1"',
		);
	});

	it("fails when the corncrake header has an extra unused property", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0 somenonsensehere=othernonsensehere`,
			),
		).toThrow("Unexpected property 'somenonsensehere' on node 'corncrake'");
	});

	it("fails when the corncrake header is missing", () => {
		expect(() => parse("parseFile", ``)).toThrow("Missing version header");
	});

	it("fails when the first node is not 'corncrake'", () => {
		expect(() => parse("parseFile", `notcorncrakeci version=v0`)).toThrow(
			"Expected first node to be 'corncrake', got 'notcorncrakeci'",
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

	describe("Stage and Job parsing", () => {
		it("parses a single top-level job (implicit stage)", () => {
			const out = parse(
				"parseFile",
				`corncrake version=v0

			job "build" {
				step "pnpm install"
			}`,
			);

			expect(out.workflows).toMatchInlineSnapshot(`
				[
				  {
				    "name": null,
				    "span": {
				      "end": {
				        "column": 5,
				        "line": 5,
				        "offset": 67,
				      },
				      "start": {
				        "column": 4,
				        "line": 3,
				        "offset": 25,
				      },
				    },
				    "stages": [
				      {
				        "jobs": [
				          {
				            "name": "build",
				            "needs": [],
				            "span": {
				              "end": {
				                "column": 5,
				                "line": 5,
				                "offset": 67,
				              },
				              "start": {
				                "column": 4,
				                "line": 3,
				                "offset": 25,
				              },
				            },
				            "steps": [
				              {
				                "command": "pnpm install",
				                "image": undefined,
				                "span": {
				                  "end": {
				                    "column": 24,
				                    "line": 4,
				                    "offset": 62,
				                  },
				                  "start": {
				                    "column": 5,
				                    "line": 4,
				                    "offset": 43,
				                  },
				                },
				              },
				            ],
				          },
				        ],
				        "name": "build",
				        "span": {
				          "end": {
				            "column": 5,
				            "line": 5,
				            "offset": 67,
				          },
				          "start": {
				            "column": 4,
				            "line": 3,
				            "offset": 25,
				          },
				        },
				      },
				    ],
				  },
				]
			`);

			//expect(out.workflows[0]?.stages).toHaveLength(1);
			//expect(out.workflows[0]?.stages[0]?.name).toBe("build"); // stage name matches job
			//expect(out.workflows[0]?.stages[0]?.jobs).toHaveLength(1);
			//expect(out.workflows[0]?.stages[0]?.jobs[0]?.name).toBe("build");
		});

		it("parses an explicit stage with multiple jobs", () => {
			const out = parse(
				"parseFile",
				`corncrake version=v0

			stage "test" {
				job "run tests" {
					step "pnpm test"
				}
				job "lint" {
					step "npm run lint"
				}
			}`,
			);
			// Should create one stage named "test" with two jobs
			expect(out.workflows).toMatchInlineSnapshot(`
				[
				  {
				    "name": null,
				    "span": {
				      "end": {
				        "column": 5,
				        "line": 10,
				        "offset": 142,
				      },
				      "start": {
				        "column": 4,
				        "line": 3,
				        "offset": 25,
				      },
				    },
				    "stages": [
				      {
				        "jobs": [
				          {
				            "name": "run tests",
				            "needs": [],
				            "span": {
				              "end": {
				                "column": 6,
				                "line": 6,
				                "offset": 89,
				              },
				              "start": {
				                "column": 5,
				                "line": 4,
				                "offset": 44,
				              },
				            },
				            "steps": [
				              {
				                "command": "pnpm test",
				                "image": undefined,
				                "span": {
				                  "end": {
				                    "column": 22,
				                    "line": 5,
				                    "offset": 83,
				                  },
				                  "start": {
				                    "column": 6,
				                    "line": 5,
				                    "offset": 67,
				                  },
				                },
				              },
				            ],
				          },
				          {
				            "name": "lint",
				            "needs": [],
				            "span": {
				              "end": {
				                "column": 6,
				                "line": 9,
				                "offset": 137,
				              },
				              "start": {
				                "column": 5,
				                "line": 7,
				                "offset": 94,
				              },
				            },
				            "steps": [
				              {
				                "command": "npm run lint",
				                "image": undefined,
				                "span": {
				                  "end": {
				                    "column": 25,
				                    "line": 8,
				                    "offset": 131,
				                  },
				                  "start": {
				                    "column": 6,
				                    "line": 8,
				                    "offset": 112,
				                  },
				                },
				              },
				            ],
				          },
				        ],
				        "name": "test",
				        "span": {
				          "end": {
				            "column": 5,
				            "line": 10,
				            "offset": 142,
				          },
				          "start": {
				            "column": 4,
				            "line": 3,
				            "offset": 25,
				          },
				        },
				      },
				    ],
				  },
				]
			`);
		});

		it("parses step with optional image", () => {
			const out = parse(
				"parseFile",
				`corncrake version=v0

			job "test" {
				step "echo hello"
				step image="node:18" "npm test"
			}`,
			);

			const job = out.workflows[0]?.stages[0]?.jobs[0];
			expect(job?.steps).toHaveLength(2);
			const step1 = job?.steps[0] as UserStepDeclaration;
			const step2 = job?.steps[1] as UserStepDeclaration;
			expect(step1.image).toBeUndefined();
			expect(step1.command).toBe("echo hello");
			expect(step2.image).toBe("node:18");
			expect(step2.command).toBe("npm test");
		});
	});

	it("parses job with needs declarations", () => {
		const out = parse(
			"parseFile",
			`corncrake version=v0

		job "build" {
			step "pnpm run build"
		}

		job "deploy" {
			needs "build"
			needs "test" allow_failed=#true
			step "deploy.sh"
		}`,
		);

		const deployJob = out.workflows[0]?.stages[1]?.jobs[0];
		expect(deployJob?.needs).toHaveLength(2);
		expect(deployJob?.needs[0]?.job).toBe("build");
		expect(deployJob?.needs[0]?.allowFailed).toBe(false);
		expect(deployJob?.needs[1]?.job).toBe("test");
		expect(deployJob?.needs[1]?.allowFailed).toBe(true);
	});

	it("fails when stage has invalid name", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0

				stage {
					job "invalid" {
						step "echo hi"
					}
				}`,
			),
		).toThrow();
	});

	it("fails when job name not provided", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0

				job {
					step "echo hi"
				}`,
			),
		).toThrow();
	});

	it("fails when job contains unexpected children", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0

			job "test" {
				invalid "something"
			}`,
			),
		).toThrow("Unexpected node 'invalid' in job");
	});

	it("fails when two top-level jobs have the same name", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0
				job a {
				}

				job a {
				}`,
			),
		).toThrow("Duplicate name 'a'");
	});

	it("fails when two top-level stages have the same name", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0
				stage a {
				}

				stage a {
				}`,
			),
		).toThrow("Duplicate name 'a'");
	});

	it("fails when two jobs within the same stage have the same name", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0
				stage b {
					job a {
					}
					job a {
					}
				}
			`,
			),
		).toThrow("Duplicate job name 'a' in stage");
	});

	it("fails when a toplevel job and stage have the same name", () => {
		expect(() =>
			parse(
				"parseFile",
				`corncrake version=v0
				job a {
				}

				stage a {
				}`,
			),
		).toThrow("Duplicate name 'a'");
	});

	it("allows jobs with the same name in different stages", () => {
		const out = parse(
			"parseFile",
			`corncrake version=v0
			stage a {
				job jobName {
				}
			}
			stage b {
				job jobName {
				}
			}`,
		);

		expect(out.workflows[0])?.toMatchInlineSnapshot(`
			{
			  "name": null,
			  "span": {
			    "end": {
			      "column": 5,
			      "line": 5,
			      "offset": 62,
			    },
			    "start": {
			      "column": 4,
			      "line": 2,
			      "offset": 24,
			    },
			  },
			  "stages": [
			    {
			      "jobs": [
			        {
			          "name": "jobName",
			          "needs": [],
			          "span": {
			            "end": {
			              "column": 6,
			              "line": 4,
			              "offset": 57,
			            },
			            "start": {
			              "column": 5,
			              "line": 3,
			              "offset": 38,
			            },
			          },
			          "steps": [],
			        },
			      ],
			      "name": "a",
			      "span": {
			        "end": {
			          "column": 5,
			          "line": 5,
			          "offset": 62,
			        },
			        "start": {
			          "column": 4,
			          "line": 2,
			          "offset": 24,
			        },
			      },
			    },
			    {
			      "jobs": [
			        {
			          "name": "jobName",
			          "needs": [],
			          "span": {
			            "end": {
			              "column": 6,
			              "line": 8,
			              "offset": 99,
			            },
			            "start": {
			              "column": 5,
			              "line": 7,
			              "offset": 80,
			            },
			          },
			          "steps": [],
			        },
			      ],
			      "name": "b",
			      "span": {
			        "end": {
			          "column": 5,
			          "line": 9,
			          "offset": 104,
			        },
			        "start": {
			          "column": 4,
			          "line": 6,
			          "offset": 66,
			        },
			      },
			    },
			  ],
			}
		`);
	});

	it("accumulates errors - reports both undefined job name and undefined step", () => {
		const doc = parseKDL(`corncrake version=v0

		job {
			step
		}`);
		const parser = new V0Parser();

		try {
			parser.parseFile(doc.nodes);
		} catch (_e) {
			// Should have accumulated multiple errors
			expect(parser.errors.length).toBe(2);
		}
	});

	it("parses use block with resources", () => {
		const out = parse(
			"parseFile",
			`corncrake version=v0

		use {
			image rust "rust:1.59"
			library rust "builtin:rust@1.83"
			executor default "containers"
		}`,
		);

		expect(out.uses).toHaveLength(3);
		expect(out.uses[0]).toMatchObject({
			resourceKind: "image",
			name: "rust",
			specifier: "rust:1.59",
		});
		expect(out.uses[1]).toMatchObject({
			resourceKind: "library",
			name: "rust",
			specifier: "builtin:rust@1.83",
		});
		expect(out.uses[2]).toMatchObject({
			resourceKind: "executor",
			name: "default",
			specifier: "containers",
		});
	});
});
