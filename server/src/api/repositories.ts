import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import type { Context } from "openapi-backend";
import { txn } from "../db/stores";
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

export async function configureRepo(
	_c: Context,
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

		const { forge, forge_repo_id } = req.body;

		const forgeClient = createForge(forge);
		const repoDetails = await forgeClient.getRepository(
			forge_repo_id,
			accessToken,
		);

		await txn(async (tx) => {
			await tx.repositories.createOrUpdateRepository(
				forge,
				forge_repo_id,
				userId,
				repoDetails.name,
				repoDetails.description,
				repoDetails.clone_url,
				repoDetails.ssh_url,
				repoDetails.html_url,
				repoDetails.private,
				req.body.settings?.branch || "main",
			);
		});

		return res.status(200).json({
			repo: {
				id: repoDetails.id,
				name: repoDetails.name,
				full_name: repoDetails.full_name,
				description: repoDetails.description,
				private: repoDetails.private,
				html_url: repoDetails.html_url,
				clone_url: repoDetails.clone_url,
				ssh_url: repoDetails.ssh_url,
				default_branch: req.body.settings?.branch,
			},
			configured_at: new Date().toISOString(),
		});
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
				repoDetails.private,
				"main", // for now
			);
		});

		return res.status(200);
	} catch (err) {
		console.error("Failed to configure repo:", err);
		return res.status(500).json({ error: "Failed to configure repository" });
	}
}
