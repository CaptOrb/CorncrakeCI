/**
 * Checks at runtime that something isn't null or undefined.
 * Intended to be used when we don't think something can be null/undefined
 * but want to make sure.
 */
export function unwrap<T>(val: T | undefined | null, message?: string): T {
	if (val === undefined) {
		throw new Error(message ?? "unwrap() called on undefined");
	}
	if (val === null) {
		throw new Error(message ?? "unwrap() called on null");
	}
	return val;
}
