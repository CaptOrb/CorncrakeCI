import assert from "node:assert";
import { type Entry, getLocation, type Node as KDLNode } from "@bgotink/kdl";
import * as v from "valibot";
import type {
	AnyStepDeclaration,
	JobDeclaration,
	NeedsDeclaration,
	StageDeclaration,
	UseDeclaration,
	V0File,
	WorkflowDeclaration,
} from "./ast";
import { DocRef, FatalParseError, type V0ParseError } from "./error";

export class V0Parser {
	// we want to accumulate errors rather than throwing, allowing multiple issues to be reported at once.
	errors: V0ParseError[] = [];

	/**
	 * Parse a complete KDL file into a V0File AST.
	 *
	 * Expects the first node to be a version header.
	 * Remaining top-level nodes are parsed as resource declarations (use blocks), jobs and stages.
	 *
	 * Throws FatalParseError if the version header is missing or invalid, or if
	 * any errors were accumulated during version header validation.
	 *
	 * @param nodes - Array of top-level KDL nodes from the parsed file
	 * @returns The parsed V0File containing uses and workflows
	 * @throws {FatalParseError} If version header is invalid or missing
	 */
	public parseFile(nodes: KDLNode[]): V0File {
		const versionHeader = nodes[0];

		if (!versionHeader) {
			this.errors.push({
				message: "Missing version header",
			});
			throw new FatalParseError();
		}

		if (versionHeader.getName() !== "molci") {
			this.errors.push({
				message: `Expected first node to be 'molci', got '${versionHeader.getName()}'`,
				elements: [versionHeader],
			});
		}
		const versionNodeParse = this.parseNodeAttributes(
			versionHeader,
			[],
			["version"],
			v.object({
				version: v.picklist(["v0"]),
			}),
		);

		if (!versionNodeParse.ok) {
			// Enhance the errors that were added
			versionNodeParse.errors.setDocRef(DocRef.MOLCI_VERSION);
		}

		if (this.errors.length > 0) throw new FatalParseError();

		const uses = [];
		const workflows: WorkflowDeclaration[] = [];
		const implicitWorkflowStages: StageDeclaration[] = [];

		// Track job and stage names to detect conflicts
		const reservedNames = new Map<string, KDLNode>();
		// Parse remaining nodes
		for (const node of nodes.slice(1)) {
			const nodeName = node.getName();

			if (nodeName === "use") {
				const useDecls = this.parseUseBlock(node);
				uses.push(...useDecls);
			} else if (nodeName === "stage") {
				const stage = this.parseStage(node);
				if (stage) {
					// Check for duplicate stage name
					if (reservedNames.has(stage.name!)) {
						this.errors.push({
							message: `Duplicate name '${stage.name}'`,
							elements: [node, reservedNames.get(stage.name!)!],
						});
					} else {
						reservedNames.set(stage.name!, node);
					}
					implicitWorkflowStages.push(stage);
				}
			} else if (nodeName === "job") {
				// Implicit stage: single job
				const job = this.parseJob(node);
				if (job) {
					// Check for duplicate job name
					if (reservedNames.has(job.name)) {
						this.errors.push({
							message: `Duplicate name '${job.name}'`,
							elements: [node, reservedNames.get(job.name)!],
						});
					} else {
						reservedNames.set(job.name, node);
					}

					implicitWorkflowStages.push({
						name: job.name, // stage gets same name as job
						span: job.span,
						jobs: [job],
					});
				}
			} else {
				this.errors.push({
					message: `Unexpected node '${nodeName}'`,
					elements: [node],
				});
			}
		}

		if (implicitWorkflowStages.length > 0) {
			workflows.push({
				name: null, // implicit workflow
				span: implicitWorkflowStages[0]!.span, // first stage/job location
				stages: implicitWorkflowStages,
			});
		}

		return {
			uses: uses,
			workflows: workflows,
		};
	}

	/**
	 * Parses the attributes from a KDL node.
	 *
	 * KDL node attributes come in two flavours:
	 * - arguments, which don't have a named key
	 * - properties, which DO have a named key
	 *
	 * The KDL spec says the order of arguments DOES matter,
	 * but the order of properties doesn't.
	 *
	 * This function assigns orders to arguments in the given order
	 * and also accepts properties with the given names.
	 *
	 * Arguments and properties can have the same name, in that case
	 * the argument form is treated as a 'shorthand' and
	 * one out of the two can be specified.
	 *
	 * If parsing fails, adds errors to this parser.
	 * The errors are returned as an ErrorSet, which is just a convenience for grouping
	 * together multiple errors and making it easy to enhance them all with documentation
	 * references.
	 *
	 * @param node - The node to read attributes from
	 * @param argNames - The names of arguments to accept, in the order they are expected
	 * @param propertyNames - The names of properties to accept. In no particular order.
	 * @param schema - A valibot schema to apply to the result.
	 */
	parseNodeAttributes<
		S extends v.ObjectSchema<
			v.ObjectEntries,
			v.ErrorMessage<v.ObjectIssue> | undefined
		>,
	>(
		node: KDLNode,
		argNames: readonly string[],
		propertyNames: readonly string[],
		schema: S,
	):
		| { ok: true; attrs: v.InferOutput<S> }
		| { ok: false; attrs: Record<string, unknown>; errors: ErrorSet } {
		const errors: V0ParseError[] = [];
		const attrs: Record<string, unknown> = {};
		const attrEntries: Record<string, Entry> = {};

		const argEntries = node.getArgumentEntries();

		if (argEntries.length > argNames.length) {
			const extraArgValues = argEntries.slice(argNames.length);
			errors.push({
				message: `Too many arguments for node '${node.getName()}': expected at most ${argNames.length}, got ${argEntries.length}`,
				elements: extraArgValues,
			});
		}

		for (let i = 0; i < Math.min(argEntries.length, argNames.length); i++) {
			attrEntries[argNames[i]!] = argEntries[i]!;
		}

		const allowedProperties = new Set(propertyNames);

		for (const propEntry of node.getPropertyEntries()) {
			const key = propEntry.getName();
			if (!allowedProperties.has(key!)) {
				errors.push({
					message: `Unexpected property '${key}' on node '${node.getName()}'`,
					elements: [propEntry],
				});
				continue;
			}

			// Check if this property overwrites an argument
			if (key! in attrEntries) {
				errors.push({
					message: `Property '${key}' cannot overwrite argument on node '${node.getName()}'`,
					elements: [propEntry],
				});
				continue;
			}

			attrEntries[key!] = propEntry;
		}
		//  Second pass: extract values from entries
		for (const [key, entry] of Object.entries(attrEntries)) {
			attrs[key] = entry.getValue();
		}

		// Validate with schema
		const result = v.safeParse(schema, attrs);
		if (!result.success) {
			assert(result.issues.length > 0);
			for (const issue of result.issues) {
				let faultyElement: KDLNode | Entry = node;
				const whatAttr = issue.path?.[0];
				if (whatAttr?.type === "object") {
					const faultyKeyEntry = attrEntries?.[whatAttr.key];
					if (faultyKeyEntry !== undefined) {
						faultyElement = faultyKeyEntry;
					}
				}

				errors.push({
					message: issue.message,
					elements: [faultyElement],
				});
			}
		}

		// Return errors
		// !result.success is to satisfy TypeScript; it's technically redundant.
		if (errors.length > 0 || !result.success) {
			errors.forEach((e) => {
				this.errors.push(e);
			});
			return {
				ok: false,
				attrs,
				errors: new ErrorSet(errors),
			};
		}
		return {
			ok: true,
			attrs: result.output,
		};
	}

	/**
	 * Parse a use block containing resource declarations
	 */
	private parseUseBlock(node: KDLNode): UseDeclaration[] {
		const declarations: UseDeclaration[] = [];
		const children = node.children;

		if (children === null) {
			this.errors.push({
				message: "this should be a block",
				elements: [node],
			});
			return [];
		}

		for (const child of children.nodes) {
			const decl = this.parseUseDeclaration(child);
			if (decl) {
				declarations.push(decl);
			}
		}

		return declarations;
	}

	/**
	 * Parse a single use declaration (image, library, or executor)
	 */
	private parseUseDeclaration(node: KDLNode): UseDeclaration | null {
		this.ensureNoChildren(node);
		const nodeName = node.getName();

		switch (nodeName) {
			case "image": {
				const result = this.parseNodeAttributes(
					node,
					["name", "specifier"],
					[],
					v.object({
						name: v.string(),
						specifier: v.string(),
					}),
				);
				if (result.ok) {
					return {
						resourceKind: "image",
						name: result.attrs.name,
						specifier: result.attrs.specifier,
						location: getLocation(node) ?? null,
					};
				}
				break;
			}

			case "library": {
				const result = this.parseNodeAttributes(
					node,
					["name", "specifier"],
					[],
					v.object({
						name: v.string(),
						specifier: v.string(),
					}),
				);
				if (result.ok) {
					return {
						resourceKind: "library",
						name: result.attrs.name,
						specifier: result.attrs.specifier,
						location: getLocation(node) ?? null,
					};
				}
				break;
			}

			case "executor": {
				const result = this.parseNodeAttributes(
					node,
					["name", "type"],
					[],
					v.object({
						name: v.string(),
						type: v.string(),
					}),
				);
				if (result.ok) {
					return {
						resourceKind: "executor",
						name: result.attrs.name,
						specifier: result.attrs.type,
						location: getLocation(node) ?? null,
					};
				}
				break;
			}

			default:
				this.errors.push({
					message: `Unexpected declaration '${nodeName}' in use block`,
					elements: [node],
				});
		}

		return null;
	}

	/**
	 * Parse a stage declaration containing one or more jobs.
	 *
	 * Jobs within a stage run in parallel by default.
	 * Continues parsing all child jobs even if the stage name is invalid,
	 * to accumulate all possible errors for better error reporting.
	 */
	private parseStage(node: KDLNode): StageDeclaration | null {
		const children = node.children;

		if (children === null) {
			this.errors.push({
				message: "this should be a block",
				elements: [node],
			});
			return null;
		}

		const jobs: JobDeclaration[] = [];

		const jobNames = new Map<string, KDLNode>();

		const stageNameResult = this.parseNodeAttributes(
			node,
			["name"],
			[],
			v.object({
				name: v.string(),
			}),
		);

		// Continue parsing all children even if stage name failed
		for (const child of children.nodes) {
			const childName = child.getName();

			if (childName === "job") {
				const job = this.parseJob(child);
				if (job) {
					if (jobNames.has(job.name)) {
						this.errors.push({
							message: `Duplicate job name '${job.name}' in stage`,
							elements: [child, jobNames.get(job.name)!],
						});
					} else {
						jobNames.set(job.name, child);
					}
					jobs.push(job);
				}
			} else {
				this.errors.push({
					message: `Unexpected node '${childName}' in stage`,
					elements: [child],
				});
			}
		}

		if (!stageNameResult.ok) {
			return null;
		}

		return {
			name: stageNameResult.attrs.name,
			span: getLocation(node)!,
			jobs,
		};
	}

	/**
	 * Parse a job declaration from a KDL node.
	 *
	 * Continues parsing all child nodes even if the job name is invalid,
	 * to accumulate all possible errors for better error reporting.
	 */
	private parseJob(node: KDLNode): JobDeclaration | null {
		const children = node.children;

		if (children === null) {
			this.errors.push({
				message: "this should be a block",
				elements: [node],
			});
			return null;
		}

		const needs: NeedsDeclaration[] = [];
		const steps: AnyStepDeclaration[] = [];

		const jobNameResult = this.parseNodeAttributes(
			node,
			["name"],
			[],
			v.object({
				name: v.string(),
			}),
		);

		for (const child of children.nodes) {
			const childName = child.getName();

			switch (childName) {
				case "needs": {
					const needsDecl = this.parseNeeds(child);
					if (needsDecl) needs.push(needsDecl);
					break;
				}
				case "step": {
					const stepDecl = this.parseStep(child);
					if (stepDecl) steps.push(stepDecl);
					break;
				}
				default:
					this.errors.push({
						message: `Unexpected node '${childName}' in job`,
						elements: [child],
					});
			}
		}
		if (!jobNameResult.ok) {
			return null;
		}

		return {
			name: jobNameResult.attrs.name,
			span: getLocation(node)!,
			needs,
			steps,
		};
	}

	/**
	 * Parse a needs declaration specifying a job dependency.
	 */
	private parseNeeds(node: KDLNode): NeedsDeclaration | null {
		this.ensureNoChildren(node);
		const result = this.parseNodeAttributes(
			node,
			["job"],
			["allow_failed"],
			v.object({
				job: v.string(),
				allow_failed: v.optional(v.boolean(), false),
			}),
		);

		if (!result.ok) {
			return null;
		}

		return {
			job: result.attrs.job,
			allowFailed: result.attrs.allow_failed,
			span: getLocation(node)!,
		};
	}

	/**
	 * Parse a step declaration within a job.
	 *
	 * A step defines a command to execute, with an optional container image.
	 * @param node - The KDL node to parse
	 * @returns The parsed step declaration, or null if parsing failed
	 */
	private parseStep(node: KDLNode): AnyStepDeclaration | null {
		this.ensureNoChildren(node);
		const result = this.parseNodeAttributes(
			node,
			["command"],
			["image"],
			v.object({
				command: v.string(),
				image: v.optional(v.string()),
			}),
		);

		if (!result.ok) {
			return null;
		}

		return {
			span: getLocation(node)!,
			image: result.attrs.image,
			command: result.attrs.command,
		};
	}

	/**
	 * Ensure a node has no children block.
	 * Adds an error if the node has children
	 * This helps catch user mistakes and prevents future breaking changes.
	 * @param node - The node to check
	 */
	private ensureNoChildren(node: KDLNode): void {
		if (node.children !== null) {
			this.errors.push({
				message: `Node '${node.getName()}' does not accept a children block`,
				elements: [node],
			});
		}
	}
}

/**
 * Wrapper for a bundle of errors returned from a parser function.
 */
class ErrorSet {
	constructor(public errors: readonly V0ParseError[]) {}

	/**
	 * Enhance all errors in the set with a documentation reference.
	 */
	setDocRef(docRef: DocRef): void {
		for (const error of this.errors) {
			error.docRef = docRef;
		}
	}
}
