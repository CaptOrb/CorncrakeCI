import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import { OpenAPIBackend, type Request } from "openapi-backend";
import { listAvailableRepos, configureRepo, reconfigureRepo } from "./repositories";

export function createOpenAPIBackend(): OpenAPIBackend {
	const api = new OpenAPIBackend({
		definition: "./openapi.yaml",
		validate: true,
	});
	api.register({
		listAvailableRepos,
		configureRepo,
		reconfigureRepo,
		notFound: (_c, _req, res) => res.status(404).json({ err: "not found" }),
		validationFail: (c, _req, res) =>
			res.status(400).json({ err: c.validation.errors }),
	});

	api.init();

	return api;
}

export function createOpenAPIMiddleware(api: OpenAPIBackend) {
	return (req: ExpressRequest, res: ExpressResponse): void => {
		api.handleRequest(req as Request, req, res);
	};
}
