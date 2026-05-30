import { types } from "pg";

/**
 * Set up Postgres client type conversions.
 *
 * Must be called before connecting to the database.
 *
 * - BIGINT will now be `bigint` instead of `string` (node-pg default)
 *   - including arrays of BIGINT
 */
export function setupPostgresTypeParsers() {
	// https://github.com/brianc/node-pg-types/issues/78#issuecomment-538632724

	// Type ID 20 = BIGINT | BIGSERIAL
	// The enum doesn't seem to exist at runtime so we have to do this weird typeof hack.
	const BIGINT: typeof types.TypeId.INT8 = 20;
	types.setTypeParser(BIGINT, BigInt);

	// 1016 = Type ID for arrays of BigInt values
	// Cast needed to bypass it not being present in the `TypeId` enum...
	// A bit hacky :/
	const BIGINT_ARRAY: typeof types.TypeId.INT8 =
		1016 as unknown as typeof types.TypeId.INT8;
	const parseBigIntArray = types.getTypeParser(BIGINT_ARRAY);
	types.setTypeParser(BIGINT_ARRAY, (bigintArray) =>
		parseBigIntArray(bigintArray).map(BigInt),
	);
}
