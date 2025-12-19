import * as v from "valibot";

const ALL_FORGE_TYPES = ["gitea", "github", "gitlab"] as const;

type AllForgeTypes = (typeof ALL_FORGE_TYPES)[number];

const DEFAULT_FORGE_NAMES: Record<AllForgeTypes, string> = {
	gitea: "Gitea",
	github: "GitHub",
	gitlab: "GitLab",
};

const ForgeInstanceSchema = v.pipe(
	v.object({
		type: v.picklist(ALL_FORGE_TYPES),
		name: v.optional(v.string()),
		url: v.string(),
		clientid: v.string(),
		clientsecret: v.string(),
		redirecturi: v.string(),
	}),
	v.transform((input) => ({
		...input,
		// If no name is supplied, default to the type's default name
		name: input.name ?? DEFAULT_FORGE_NAMES[input.type],
	})),
);

// Convert `{"1": {...}, "2": {...}}` to a `Map<number, { ... }>`
const ForgesSchema = v.pipe(
	v.record(v.pipe(v.string(), v.digits()), ForgeInstanceSchema),
	v.transform(
		(obj) => new Map(Object.entries(obj).map(([k, v]) => [Number(k), v])),
	),
);

// All these database configuration fields are optional;
// the Postgres client driver has defaults.
const DatabaseConfigSchema = v.object({
	uri: v.string(),
});

const AppConfigSchema = v.object({
	port: v.pipe(
		v.optional(v.string(), "3000"),
		v.transform(Number),
		v.integer(),
	),
	baseurl: v.pipe(
		v.string(),
		v.nonEmpty(),
		v.url(),
		v.check((s) => !s.endsWith("/"), "Must not end with /"),
	),
});

const SessionConfigSchema = v.object({
	secret: v.pipe(
		v.string(),
		v.minLength(32, "Session secret must be at least 32 characters long"),
	),
});

export const ConfigSchema = v.object({
	app: optionalObject(AppConfigSchema),
	db: optionalObject(DatabaseConfigSchema),
	forges: v.optional(ForgesSchema, {}),
	session: SessionConfigSchema,
	node: v.object({
		env: v.picklist(["production", "development", "test"]),
	}),
});

// Keys included in the config that should be parsed
// from environment variables.
export const CONFIG_SCHEMA_KEYS = [
	"app",
	"db",
	"forges",
	"session",
	"node",
] satisfies (keyof Config)[];

export type Config = v.InferOutput<typeof ConfigSchema>;
export type DatabaseConfig = v.InferOutput<typeof DatabaseConfigSchema>;
export type ForgesConfig = v.InferOutput<typeof ForgesSchema>;
export type ForgeInstanceConfig = v.InferOutput<typeof ForgeInstanceSchema>;

// Wrap a `v.object` schema so that if the object isn't supplied,
// it gets filled in with defaults.
function optionalObject<
	TEntries extends v.ObjectEntries,
	TMessage extends v.ErrorMessage<v.ObjectIssue> | undefined,
>(sch: v.ObjectSchema<TEntries, TMessage>) {
	const defaultObject = v.getDefaults(sch);
	return v.optional(sch, defaultObject!);
}
