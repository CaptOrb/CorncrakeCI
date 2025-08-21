type EnvMode = "development" | "production" | "test";

interface ProcessEnv {
	NODE_ENV?: EnvMode;
	APP_PORT?: string;
	DB_USER: string;
	DB_PASSWORD: string;
	DB_HOST?: string;
	DB_NAME: string;
	DB_PORT?: string;
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
};

export const isProduction = config.NODE_ENV === "production";
