import { parse as parseKDL } from "@bgotink/kdl";
import { assert } from "vitest";
import type { PlannedWorkflow } from "../../src/execution/plan";
import { gatherForPlanning, planAll } from "../../src/execution/planner";
import type {
	PushTriggerEvent,
	TriggerEvent,
} from "../../src/execution/trigger_event";
import type { V0File } from "../../src/pipeline/v0/ast";
import { FatalParseError } from "../../src/pipeline/v0/error";
import { V0Parser } from "../../src/pipeline/v0/parser";

/**
 * Helper for parsing a fragment of pipeline (V0) configuration.
 *
 * @param _func - The parsing function to invoke. Currently only "parseFile" is accepted
 * @param text - The text representing KDL nodes to parse
 */
export function parseV0(_func: "parseFile", text: string): V0File {
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

/**
 * Parse a V0 file and plan it, returning the workflow.
 */
export async function parseAndPlanV0(
	event: TriggerEvent,
	text: string,
): Promise<PlannedWorkflow> {
	const file = parseV0("parseFile", text);
	const files = new Map([["main", file]]);
	const gathered = await gatherForPlanning(files);

	const pipeline = planAll(gathered, event);
	const workflow = pipeline[0];
	assert(workflow !== undefined);
	return workflow;
}

export const PUSH_EVENT: PushTriggerEvent = {
	eventType: "push",
	commitHash: "0000",
	ref: "refs/heads/main",
};
