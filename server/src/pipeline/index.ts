import * as KDL from "@bgotink/kdl";
import type {
	t_PipelineCheckResult,
	t_PipelineError,
} from "../generated/server/models";
import { createLogger } from "../util/logging";
import type { V0File } from "./v0/ast";
import { FatalParseError, type V0ParseError } from "./v0/error";
import { V0Parser } from "./v0/parser";

const log = createLogger(import.meta.url);

function mapParserErrors(errors: V0ParseError[]): t_PipelineError[] {
	return errors.map((e) => {
		let startLine: number | undefined;
		let endLine: number | undefined;

		let startColumn: number | undefined;
		let endColumn: number | undefined;

		if (e.elements?.[0]) {
			const loc = KDL.getLocation(e.elements[0]);
			startLine = loc?.start.line;
			endLine = loc?.end.line;
			startColumn = loc?.start.column;
			endColumn = loc?.end.column;
		}

		return {
			message: e.message,
			startLine,
			endLine,
			startColumn,
			endColumn,
			docRef: e.docRef,
		};
	});
}

export function parseKdlConfigs(configFiles: Map<string, string>): {
	configs: Map<string, V0File>;
	results: t_PipelineCheckResult[];
} {
	const configs = new Map<string, V0File>();
	const results: t_PipelineCheckResult[] = [];

	for (const [filename, content] of configFiles) {
		try {
			const kdlDoc = KDL.parse(content, {
				storeLocations: true,
			});

			const parser = new V0Parser();
			try {
				const parsedFile = parser.parseFile(kdlDoc.nodes);

				if (parser.errors.length > 0) {
					log.warn({ filename, errors: parser.errors }, "Parse errors");
					results.push({
						path: filename,
						content,
						errors: mapParserErrors(parser.errors),
					});
				} else {
					log.debug({ filename }, "Successfully parsed file");
					// Only emit files that are correct.
					// In the future, when we support warnings, they won't prevent files being emitted.
					configs.set(filename, parsedFile);
					results.push({
						path: filename,
						content,
					});
				}
			} catch (error) {
				if (error instanceof FatalParseError) {
					log.warn({ filename, errors: parser.errors }, "Fatal parse error");
					results.push({
						path: filename,
						content,
						errors: mapParserErrors(parser.errors),
					});
				} else {
					throw error;
				}
			}
		} catch (error) {
			log.warn({ filename, err: error }, "Failed to parse KDL file");
			results.push({
				path: filename,
				content,
				errors: [
					{
						message: `Failed to parse KDL: ${error}`,
					},
				],
			});
		}
	}

	return { configs, results };
}
