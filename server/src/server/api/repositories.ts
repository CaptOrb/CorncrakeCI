import { transaction } from "../../db/stores";
import type {
	ConfigureRepo,
	GetRepo,
	ListAvailableRepos,
	ListConfiguredRepos,
	ReconfigureRepo,
} from "../../generated/server/generated";
import type { t_ConfigureRepoRequestBodySchema } from "../../generated/server/models";
import { mustGetForge } from "../../services/forges";
import { getAccessToken } from "../../services/user";

export const listAvailableRepos: ListAvailableRepos = async (
	_params,
	respond,
	req,
) => {
	try {
		const userId = req.session?.userId;
		const forgeId = req.session?.forgeId;

		if (!userId || forgeId === undefined) {
			return respond.with401().body({ error: "Not authenticated" });
		}

		const accessToken = await getAccessToken(userId);
		if (!accessToken) {
			return respond
				.with401()
				.body({ error: "Missing or expired access token" });
		}

		const forge = mustGetForge(forgeId).withUser(accessToken);
		const repos = await forge.listRepositories();

		return respond.with200().body(repos);
	} catch (err) {
		console.error("Failed to fetch repos:", err);
		return respond.with500().body({ error: "Failed to list repositories" });
	}
};

export const configureRepo: ConfigureRepo = async (_params, respond, req) => {
	try {
		const userId = req.session?.userId;

		if (!userId) {
			return respond.with401().body({ error: "Not authenticated" });
		}

		const accessToken = await getAccessToken(userId);
		if (!accessToken) {
			return respond
				.with401()
				.body({ error: "Missing or expired access token" });
		}

		const { forge, forge_repo_id } =
			req.body as t_ConfigureRepoRequestBodySchema;

		const forgeClient = mustGetForge(forge).withUser(accessToken);
		const repoDetails = await forgeClient.getRepository(forge_repo_id);

		const repository = await transaction(async (txn) => {
			return await txn.repositories.createOrUpdateRepository(
				forge,
				forge_repo_id,
				userId,
				repoDetails.full_name,
			);
		});

		return respond.with200().body({ repo_id: repository.repo_id });
	} catch (err) {
		console.error("Failed to configure repo:", err);
		return respond.with500().body({ error: "Failed to configure repository" });
	}
};

export const listConfiguredRepos: ListConfiguredRepos = async (
	_params,
	respond,
	req,
) => {
	try {
		const userId = req.session?.userId;

		if (!userId) {
			return respond.with401().body({ error: "Not authenticated" });
		}

		const configuredRepos = await transaction(async (txn) => {
			const repos = await txn.repositories.listConfiguredRepositories(userId);

			return repos.map((r) => ({
				repo: r.repo,
				configured_at: r.configured_at,
			}));
		});

		return respond.with200().body(configuredRepos);
	} catch (err) {
		console.error("Failed to list configured repos:", err);
		return respond.with500().body({
			error: "Failed to list configured repositories",
		});
	}
};

export const reconfigureRepo: ReconfigureRepo = async (
	{ params: _params },
	_respond,
	_req,
) => {
	throw new Error("TODO BROKEN");
	/*try {
		const userId = req.session?.userId;
		const forgeId = req.session?.forgeId;

		if (!userId || forgeId === undefined) {
			return respond.with401().body({ error: "Not authenticated" });
		}

		const accessToken = await getAccessToken(userId);
		if (!accessToken) {
			return respond
				.with401()
				.body({ error: "Missing or expired access token" });
		}
		const repoId = _params.id;

		const forge = mustGetForge(forgeId);
		const repoDetails = await forge.getRepository(repoId, accessToken);
		await transaction(async (txn) => {
			await txn.repositories.createOrUpdateRepository(
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

		return respond.with200();
	} catch (err) {
		console.error("Failed to configure repo:", err);
		return respond.with500().body({ error: "Failed to configure repository" });
	}*/
};

export const getRepo: GetRepo = async (
	{ params },
	respond,
	req,
	_res,
	_next,
) => {
	try {
		const userId = req.session?.userId;

		if (!userId) {
			return respond.with401().body({ error: "Not authenticated" });
		}

		const molciRepoId = params.id;

		const repository = await transaction(async (txn) => {
			return txn.repositories.getRepositoryById(molciRepoId, userId);
		});

		if (!repository) {
			return respond.with404().body({ error: "Repository not found" });
		}

		return respond.with200().body({
			repo: {
				forge_repo_id: repository.forge_repo_id,
				full_name: repository.repo_name,
				forge: {
					id: repository.forge_id,
					name: repository.forge_display_name,
				},
			},
			configured_at: repository.created_at.toISOString(),
		});
	} catch (err) {
		console.error("Failed to get repo:", err);
		return respond.with500().body({ error: "Failed to get repository" });
	}
};
