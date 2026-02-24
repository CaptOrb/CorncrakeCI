import type * as KDL from "@bgotink/kdl";

/**
 * Identifiers for parts of the documentation, so we can point users to the manual
 * to help with their problems.
 */
export enum DocRef {
	CORNCRAKECI_VERSION = "corncrakeci-version",
}

export interface V0ParseError {
	node?: KDL.Node;
	elements?: readonly Element[];
	message: string;
	docRef?: DocRef;
}

type Element =
	| KDL.Identifier
	| KDL.Tag
	| KDL.Value
	| KDL.Entry
	| KDL.Node
	| KDL.Document;

/**
 * Raised when we stop parsing early because the errors don't seem
 * survivable for still producing good-quality diagnostic output.
 */
export class FatalParseError extends Error {
	constructor() {
		super("abandoned parsing because of severe or too many errors");
	}
}
