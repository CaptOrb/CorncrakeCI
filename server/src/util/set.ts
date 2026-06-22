/**
 * Returns whether `subset` is indeed a subset of (or equal to) the `superset`.
 */
export function isSubsetOrEqual<T>(subset: Set<T>, superset: Set<T>): boolean {
	for (const ele of subset) {
		if (!superset.has(ele)) {
			return false;
		}
	}
	return true;
}
