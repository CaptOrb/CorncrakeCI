import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";
import { config } from "../config";

interface LogContext {
	name: string;
}

export const logContextTaskLocal = new AsyncLocalStorage<LogContext>();

const baseLogger = pino({
	// Default to info in production, debug in development
	level:
		config.log.level || (config.node.env === "production" ? "info" : "debug"),
	// Default to pretty output, but also support JSON
	transport: config.log.json
		? {
				target: "pino/file",
			}
		: {
				target: "pino-pretty",
				options: {
					// stderr
					destination: 2,
				},
			},
	hooks: {
		logMethod(args, method, _level) {
			const logContext = logContextTaskLocal.getStore();

			// If there's no active log context, just pass through to Pino natively
			if (logContext === undefined) {
				return method.apply(this, args);
			}

			// TODO Experimental approach
			// Pino signatures:
			// 1. info(obj, msg, ...sprintfArgs)
			// 2. info(msg, ...sprintfArgs) -> obj is implicitly undefined
			const arg0 = args[0];

			if (typeof arg0 === "object" && arg0 !== null) {
				// Signature 1: Merge span context into the existing object
				args[0] = { ...logContext, ...arg0 };
			} else {
				// Signature 2: Inject span context as the new first argument
				args.unshift(logContext);
			}

			// Delegate back to Pino with the modified arguments
			return method.apply(this, args);
		},
	},
});

export function withLogContext<T>(
	contextName: string,
	fn: () => Promise<T>,
): Promise<T> {
	const parentContext = logContextTaskLocal.getStore() || {};
	const childContext: LogContext = { ...parentContext, name: contextName };

	return logContextTaskLocal.run(childContext, fn);
}

export function createLogger(moduleUrl: string): Logger {
	const moduleName = moduleUrl.replace(/.+src\/(.*)\.ts$/, "$1");
	return baseLogger.child({ module: moduleName });
}
