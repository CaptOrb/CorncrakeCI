type EnvMode = "development" | "production" | "test";

interface ProcessEnv {
	NODE_ENV?: EnvMode;
	APP_PORT?: string;
	DB_USER: string;
	DB_PASSWORD: string;
	DB_HOST?: string;
	DB_NAME: string;
	DB_PORT?: string;

	GITEA_URL?: string;
	GITEA_CLIENT_ID?: string;
	GITEA_CLIENT_SECRET?: string;
	GITEA_REDIRECT_URI?: string;

	FORGE_TYPES?: string; // comma-separated list of enabled forges
	SESSION_SECRET: string;
}

const env = process.env as unknown as ProcessEnv;

function requiredEnv(key: keyof ProcessEnv): string {
	const value = env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

export const config = {
	NODE_ENV: env.NODE_ENV ?? "development",
	APP_PORT: env.APP_PORT ? Number(env.APP_PORT) : 3000,
	DB_HOST: env.DB_HOST ?? "localhost",
	DB_NAME: requiredEnv("DB_NAME"),
	DB_USER: requiredEnv("DB_USER"),
	DB_PASSWORD: requiredEnv("DB_PASSWORD"),
	DB_PORT: env.DB_PORT ? Number(env.DB_PORT) : 5432,

	GITEA_URL: env.GITEA_URL ?? "http://localhost:3001",
	GITEA_CLIENT_ID: env.GITEA_CLIENT_ID,
	GITEA_CLIENT_SECRET: env.GITEA_CLIENT_SECRET,
	GITEA_REDIRECT_URI:
		env.GITEA_REDIRECT_URI ?? "http://localhost:3000/auth/callback",

	FORGE_TYPES: (env.FORGE_TYPES ?? "gitea")
		.split(",")
		.map((f) => f.trim().toLowerCase()),

	SESSION_SECRET: requiredEnv("SESSION_SECRET"),

	IS_PRODUCTION: env.NODE_ENV === "production",
};

export const isProduction = config.NODE_ENV === "production";
