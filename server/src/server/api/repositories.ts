import { transaction } from "../../db/stores";
import type {
	CheckPipelines,
	ConfigureRepo,
	GetRepo,
	ListAvailableRepos,
	ListConfiguredRepos,
	ListForges,
	ReconfigureRepo,
} from "../../generated/server/generated";
import type { t_ConfigureRepoRequestBodySchema } from "../../generated/server/models";
import { parseKdlConfigs } from "../../pipeline";
import {
	AuthError,
	getForgeWithUser,
	listAvailableForges,
	NotFoundError,
} from "../../services/forges";

export const listForges: ListForges = async (
	_params,
	respond,
	_req,
	_res,
	_next,
) => {
	return respond.with200().body(
		listAvailableForges().map(({ id, forge }) => ({
			id,
			name: forge.name,
			logo_url: forge.logoUrl,
		})),
	);
};

export const checkPipelines: CheckPipelines = async (
	{ params },
	respond,
	req,
) => {
	const userId = req.session?.userId;
	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const molciRepoId = params.id;
	const { ref } = req.body;

	const repository = await transaction(async (txn) => {
		return txn.repositories.getRepositoryById(molciRepoId, userId);
	});

	if (!repository) {
		throw new NotFoundError("Repository not found");
	}

	const forge = await getForgeWithUser(userId);
	const molciConfig = await forge.getMolciConfig(repository.forge_repo_id, ref);

	const { results } = parseKdlConfigs(molciConfig.configFiles);

	return respond.with200().body({
		pipelines: results,
	});
};
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
		throw new AuthError("Not authenticated");
	}

	const configuredRepos = await transaction(async (txn) => {
		return await txn.repositories.listConfiguredRepositories(userId);
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
	// Echo the changed copy
	const repository = await transaction(async (txn) => {
		// Clear webhook_secret so the setup job will recreate the webhook
		// (this allows reconfigureRepo to refresh webhooks)
		await txn.repositories.clearWebhookSecret(repoId);

		await txn.repositories.createOrUpdateRepository(
			dbRepo.forge_id,
			dbRepo.forge_repo_id,
			userId,
			forgeRepo.full_name,
		);

		return (await txn.repositories.getRepositoryById(repoId, userId))!;
	});

	return respond.with200().body({
		repo: {
			repo_id: repository.repo_id,
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
			repo_id: repository.repo_id,
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
