import { transaction } from "../../db/stores";
import type {
	ConfigureRepo,
	GetRepo,
	ListAvailableRepos,
	ListConfiguredRepos,
	ReconfigureRepo,
} from "../../generated/server/generated";
import type { t_ConfigureRepoRequestBodySchema } from "../../generated/server/models";
import {
	AuthError,
	getForgeWithUser,
	NotFoundError,
} from "../../services/forges";

export const listAvailableRepos: ListAvailableRepos = async (
	_params,
	respond,
	req,
) => {
	const userId = req.session?.userId;

	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const forge = await getForgeWithUser(userId);
	const repos = await forge.listRepositories();

	return respond.with200().body(repos);
};

export const configureRepo: ConfigureRepo = async (_params, respond, req) => {
	const userId = req.session?.userId;

	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const { forge, forge_repo_id } = req.body as t_ConfigureRepoRequestBodySchema;

	try {
		const forgeClient = await getForgeWithUser(userId);
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
	} catch (error) {
		if (error instanceof NotFoundError) {
			return respond.with400().body({ error: error.message });
		}
		throw error;
	}
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
		throw new AuthError("Not authenticated");
	}

	const repoId = params.id;

	// Fetch repo details from DB so we can get associated forge
	const dbRepo = await transaction(async (txn) =>
		txn.repositories.getRepositoryById(repoId, userId),
	);

	if (!dbRepo) {
		throw new NotFoundError("Repository not found");
	}

	const forge = await getForgeWithUser(userId);
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
		throw new AuthError("Not authenticated");
	}

	const molciRepoId = params.id;

	const repository = await transaction(async (txn) => {
		return txn.repositories.getRepositoryById(molciRepoId, userId);
	});

	if (!repository) {
		throw new NotFoundError("Repository not found");
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
