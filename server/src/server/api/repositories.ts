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
	const userId = req.session?.userId;
	const forgeId = req.session?.forgeId;

	if (!userId || forgeId === undefined) {
		return respond.with401().body({ error: "Not authenticated" });
	}

	const accessToken = await getAccessToken(userId);
	if (!accessToken) {
		return respond.with401().body({ error: "Missing or expired access token" });
	}

	const forge = mustGetForge(forgeId).withUser(accessToken);
	const repos = await forge.listRepositories();

	return respond.with200().body(repos);
};

export const configureRepo: ConfigureRepo = async (_params, respond, req) => {
	const userId = req.session?.userId;

	if (!userId) {
		return respond.with401().body({ error: "Not authenticated" });
	}

	const accessToken = await getAccessToken(userId);
	if (!accessToken) {
		return respond.with401().body({ error: "Missing or expired access token" });
	}

	const { forge, forge_repo_id } = req.body as t_ConfigureRepoRequestBodySchema;

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
};

export const listConfiguredRepos: ListConfiguredRepos = async (
	_params,
	respond,
	req,
) => {
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
};

export const reconfigureRepo: ReconfigureRepo = async (
	{ params },
	respond,
	req,
) => {
	const userId = req.session?.userId;

	if (!userId) {
		return respond.with401().body({ error: "Not authenticated" });
	}

	const repoId = params.id;

	// Fetch repo details from DB so we can get associated forge
	const dbRepo = await transaction(async (txn) =>
		txn.repositories.getRepositoryById(repoId, userId),
	);

	if (!dbRepo) {
		return respond.with404().body({ error: "Repository not found" });
	}

	const accessToken = await getAccessToken(userId);
	if (!accessToken) {
		return respond.with401().body({ error: "Missing or expired access token" });
	}

	const forge = mustGetForge(dbRepo.forge_id).withUser(accessToken);
	const forgeRepo = await forge.getRepository(dbRepo.forge_repo_id);

	// Update DB for the reconfiguredRepo
	await transaction(async (txn) => {
		await txn.repositories.createOrUpdateRepository(
			dbRepo.forge_id,
			dbRepo.forge_repo_id,
			userId,
			forgeRepo.full_name,
		);
	});

	return respond.with200();
};

export const getRepo: GetRepo = async (
	{ params },
	respond,
	req,
	_res,
	_next,
) => {
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
};
