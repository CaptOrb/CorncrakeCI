//! Configuration file for Kanel (schema introspection tool)
//! to produce types for Kysely

const { defaultGenerateIdentifierType } = require("kanel");
const { makeKyselyHook } = require("kanel-kysely");
const { resolve } = require("node:path");
const { loadEnvFile } = require("node:process");

function findAndLoadEnvFiles() {
	const envPaths = [
		resolve(__dirname, ".env"),
		resolve(__dirname, "..", ".env"),
	];

	for (const envPath of envPaths) {
		try {
			loadEnvFile(envPath);
		} catch {
			// Ignore missing env files.
		}
	}
}

findAndLoadEnvFiles();

/**
 * Map from column name to a shared branded ID type name.
 * Any column matching a key here will use the shared type
 * instead of kanel's default per-table branded type.
 */
const SHARED_ID_BRANDS = {
	forge_id: "ForgeId",
	user_id: "UserId",
	repo_id: "RepoId",
	owner_id: "UserId",
};

if (!Object.hasOwn(process.env, "DB_URI")) {
	throw new Error("DB_URI env var must be set for kanel generation");
}

/** @type {import("kanel").Config} */
const config = {
	customTypeMap: {
		// our database driver uses `Buffer` to represent Postgres BYTEA (byte arrays)
		"pg_catalog.bytea": "Buffer",
	},

	// Table session is created by connect-pg-simple at runtime (not by our migrations).
	// Excluding it to keep generated types stable.
	typeFilter: (pgType) => {
		if (
			pgType.kind === "table" &&
			pgType.schemaName === "public" &&
			pgType.name === "session"
		) {
			return false;
		}

		return true;
	},

	generateIdentifierType: (column, details, config) => {
		const sharedName = SHARED_ID_BRANDS[column.name];

		if (!sharedName) {
			// Fall back to kanel's default
			return defaultGenerateIdentifierType(column, details, config);
		}

		// This is a column that should use a shared branded ID, for cross-table type enforcement
		return {
			declarationType: "typeDeclaration",
			name: sharedName,
			exportAs: "named",
			// This is the TypeScript 'branded type' pattern; by constraining the type to additionally
			// have a (pretend) `__brand` field with a given literal value, we can have the compiler
			// check that it doesn't overlap with any other branded types
			typeDefinition: [`number & { __brand: '${sharedName}' }`],
			typeImports: [],
			comment: [`Branded type for ${column.name} columns.`],
		};
	},

	connection: {
		connectionString: process.env.DB_URI,
	},

	preDeleteOutputFolder: true,
	outputPath: "./src/db/schema",

	preRenderHooks: [makeKyselyHook()],

	// Only generate types for the public schema, ignore graphile_worker etc.
	schemas: ["public"],
};

module.exports = config;
