import type {
	Entry,
	Identifier,
	Node as KDLNode,
	Tag,
	Value,
} from "@bgotink/kdl";

/**
 * Identifiers for parts of the documentation, so we can point users to the manual
 * to help with their problems.
 */
export enum DocRef {
	MOLCI_VERSION = "molci-version",
}

export interface V0ParseError {
	node?: KDLNode;
	elements?: readonly Element[];
	message: string;
	docRef?: DocRef;
}

type Element = Identifier | Tag | Value | Entry | KDLNode | Document;
/**
 * Raised when we stop parsing early because the errors don't seem
 * survivable for still producing good-quality diagnostic output.
 */
export class FatalParseError extends Error {
	constructor() {
		super("abandoned parsing because of severe or too many errors");
	}
}
