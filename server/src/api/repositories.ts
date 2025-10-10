import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import type { Context } from "openapi-backend";
import { createForge } from "../services/forges";
import { getAccessToken } from "../services/user";

export async function listAvailableRepos(
	_c: Context,
	req: ExpressRequest,
	res: ExpressResponse,
): Promise<ExpressResponse> {
	try {
		const userId = req.session?.userId;
		const forgeId = req.session?.forgeId;

		if (!userId || forgeId === undefined) {
			return res.status(401).json({ error: "Not authenticated" });
		}

		const accessToken = await getAccessToken(userId);
		if (!accessToken) {
			return res.status(401).json({ error: "Missing or expired access token" });
		}

		const forge = createForge(forgeId);
		const repos = await forge.listRepositories(accessToken);

		return res.json(repos);
	} catch (err) {
		console.error("Failed to fetch repos:", err);
		return res.status(500).json({ error: "Failed to list repositories" });
	}
}
