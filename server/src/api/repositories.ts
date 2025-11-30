import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import type { Context } from "openapi-backend";
import { createForge } from "../services/forges";
import { getAccessToken } from "../services/user";
import { txn } from "../db/stores";

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

export async function configureRepo(
	c: Context,
	req: ExpressRequest,
	res: ExpressResponse,
): Promise<ExpressResponse> {
		try {
		const userId = req.session?.userId;

		if (!userId) {
			return res.status(401).json({ error: "Not authenticated" });
		}

		const accessToken = await getAccessToken(userId);
		if (!accessToken) {
			return res.status(401).json({ error: "Missing or expired access token" });
		}

		const repoId = c.request.params.id;

		//const forge = createForge(forgeId);
		/*const repoDetails = await forge.getRepository(repoId, accessToken);
		await txn(async (tx) => {
			await tx.repositories.createOrUpdateRepository(
				forgeId,
				repoId,
				userId,
				repoDetails.name,
				repoDetails.description,
				repoDetails.clone_url,
				repoDetails.ssh_url,
				repoDetails.html_url,
				repoDetails.private
			);
		});*/


		// Basic implementation for testing
		return res.status(200);
	} catch (err) {
				console.error("Failed to configure repo:", err);
				return res.status(500).json({ error: "Failed to configure repository" });
			}

}



export async function reconfigureRepo(
	c: Context,
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

		const repoId = c.request.params.id;

		const forge = createForge(forgeId);
		const repoDetails = await forge.getRepository(repoId, accessToken);
		await txn(async (tx) => {
			await tx.repositories.createOrUpdateRepository(
				forgeId,
				repoId,
				userId,
				repoDetails.name,
				repoDetails.description,
				repoDetails.clone_url,
				repoDetails.ssh_url,
				repoDetails.html_url,
				repoDetails.private
			);
		});


		// Basic implementation for testing
		return res.status(200);
	} catch (err) {
				console.error("Failed to configure repo:", err);
				return res.status(500).json({ error: "Failed to configure repository" });
			}

}
