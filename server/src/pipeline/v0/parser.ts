import type { Entry, Node as KDLNode } from "@bgotink/kdl";
import * as v from "valibot";
import type { V0File } from "./ast";
import { DocRef, FatalParseError, type V0ParseError } from "./error";

export class V0Parser {
	// we want to accumulate errors rather than throwing, allowing multiple issues to be reported at once.
	errors: V0ParseError[] = [];

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
			// Enhance the error that was already added
			const version = versionHeader.getProperty("version");
			if (version !== "v0") {
				versionNodeParse.error.message = `Expected version=v0, got version=${version}`;
			}
			versionNodeParse.error.docRef = DocRef.MOLCI_VERSION;
			throw new FatalParseError();
		}

		if (this.errors.length > 0) throw new FatalParseError();

		return {
			uses: [],
			workflows: [],
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
	 * If parsing fails, adds an error to this parser.
	 * The error is also returned so it can be customised.
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
		| { ok: false; attrs: Record<string, unknown>; error: V0ParseError } {
		const attrs: Record<string, unknown> = {};
		const attrEntries: Record<string, Entry> = {};
		let hasError = false;

		const argEntries = node.getArgumentEntries();

		if (argEntries.length > argNames.length) {
			hasError = true;

			const extraArgValues = argEntries.slice(argNames.length);
			this.errors.push({
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
				hasError = true;

				this.errors.push({
					message: `Unexpected property '${key}' on node '${node.getName()}'`,
					elements: [propEntry],
				});
				continue;
			}

			// Check if this property overwrites an argument
			if (key! in attrEntries) {
				hasError = true;
				this.errors.push({
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
			const error: V0ParseError = {
				elements: [node],
				issues: result.issues,
			};
			this.errors.push(error);
			return {
				ok: false,
				attrs,
				error,
			};
		}

		// check for earlier errors
		if (hasError) {
			const error: V0ParseError = {
				elements: [node],
				message: `Invalid attributes on node '${node.getName()}'`,
			};
			return {
				ok: false,
				attrs,
				error,
			};
		}
		return {
			ok: true,
			attrs: result.output,
		};
	}
}
