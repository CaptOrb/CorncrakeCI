import * as KDL from "@bgotink/kdl";
import type {
	t_PipelineCheckResult,
	t_PipelineError,
} from "../generated/server/models";
import { FatalParseError, type V0ParseError } from "./v0/error";
import { V0Parser } from "./v0/parser";

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
	configs: Map<string, KDL.Document>;
	results: t_PipelineCheckResult[];
} {
	const configs = new Map<string, KDL.Document>();
	const results: t_PipelineCheckResult[] = [];

	for (const [filename, content] of configFiles) {
		try {
			const kdlDoc = KDL.parse(content, {
				storeLocations: true,
			});
			configs.set(filename, kdlDoc);

			const parser = new V0Parser();
			try {
				parser.parseFile(kdlDoc.nodes);

				if (parser.errors.length > 0) {
					console.warn(`Parse errors in ${filename}:`, parser.errors);
					results.push({
						path: filename,
						content,
						errors: mapParserErrors(parser.errors),
					});
				} else {
					console.log(`Successfully parsed ${filename} with version header`);
					results.push({
						path: filename,
						content,
					});
				}
			} catch (error) {
				if (error instanceof FatalParseError) {
					console.error(`Fatal parse error in ${filename}:`, parser.errors);
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
			console.warn(`Failed to parse KDL file ${filename}:`, error);
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
