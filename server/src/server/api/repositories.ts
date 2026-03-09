import { transaction } from "../../db/stores";
import type {
	CheckPipelines,
	ConfigureRepo,
	GetRepo,
	ListAvailableRepos,
	ListBranches,
	ListConfiguredRepos,
	ListForges,
	ReconfigureRepo,
} from "../../generated/server/generated";
import type { t_ConfigureRepoRequestBodySchema } from "../../generated/server/models";
import { parseKdlConfigs } from "../../pipeline";
import {
	AccessLevel,
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

export const listBranches: ListBranches = async ({ params }, respond, req) => {
	const userId = req.session?.userId;
	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const repository = await transaction(async (txn) => {
		return txn.repositories.getRepositoryById(params.id);
	});

	if (!repository) {
		throw new NotFoundError("Repository not found");
	}

	const forge = await getForgeWithUser(userId);
	await forge.checkAccess(repository.forge_repo_id, AccessLevel.Read);
	const branches = await forge.listBranches(repository.forge_repo_id);

	return respond.with200().body(branches);
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

	const corncrakeciRepoId = params.id;
	const { ref } = req.body;

	const repository = await transaction(async (txn) => {
		return txn.repositories.getRepositoryById(corncrakeciRepoId);
	});

	if (!repository) {
		throw new NotFoundError("Repository not found");
	}

	const forge = await getForgeWithUser(userId);
	await forge.checkAccess(repository.forge_repo_id, AccessLevel.Read);
	const corncrakeciConfig = await forge.getCorncrakeciConfig(
		repository.forge_repo_id,
		ref,
	);

	const { results } = parseKdlConfigs(corncrakeciConfig.configFiles);

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
	const forgeRepoIds = repos.map((r) => r.forge_repo_id);

	const configuredRepoIds = await transaction(async (txn) => {
		return txn.repositories.getConfiguredRepoIds(
			forge.getForgeId(),
			forgeRepoIds,
		);
	});

	const availableRepos = repos.filter(
		(repo) => !configuredRepoIds.has(repo.forge_repo_id),
	);
	return respond.with200().body(availableRepos);
};

export const configureRepo: ConfigureRepo = async (_params, respond, req) => {
	const userId = req.session?.userId;

	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const { forge_repo_id } = req.body as t_ConfigureRepoRequestBodySchema;

	const forgeClient = await getForgeWithUser(userId);
	await forgeClient.checkAccess(forge_repo_id, AccessLevel.Admin);
	const repoDetails = await forgeClient.getRepository(forge_repo_id);

	const repository = await transaction(async (txn) => {
		return await txn.repositories.createOrUpdateRepository(
			repoDetails.forge.id,
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
		throw new AuthError("Not authenticated");
	}

	const forge = await getForgeWithUser(userId);
	const forge_id = forge.getForgeId();
	const accessibleRepos = await forge.listRepositories();
	const forge_repo_ids = accessibleRepos.map((r) => r.forge_repo_id);

	const configuredRepos = await transaction((txn) =>
		txn.repositories.listConfiguredRepositories(forge_id, forge_repo_ids),
	);

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
		txn.repositories.getRepositoryById(repoId),
	);

	if (!dbRepo) {
		throw new NotFoundError("Repository not found");
	}

	const forge = await getForgeWithUser(userId);
	await forge.checkAccess(dbRepo.forge_repo_id, AccessLevel.Admin);
	const forgeRepo = await forge.getRepository(dbRepo.forge_repo_id);

	// Update DB for the reconfiguredRepo
	// Echo the changed copy
	const repository = await transaction(async (txn) => {
		await txn.repositories.createOrUpdateRepository(
			dbRepo.forge_id,
			dbRepo.forge_repo_id,
			userId,
			forgeRepo.full_name,
		);

		return (await txn.repositories.getRepositoryById(repoId))!;
	});

	return respond.with200().body({
		repo: {
			repo_id: repository.repo_id,
			forge_repo_id: repository.forge_repo_id,
			full_name: repository.repo_name,
			html_url: forgeRepo.html_url,
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

	const corncrakeciRepoId = params.id;

	const repository = await transaction(async (txn) => {
		return txn.repositories.getRepositoryById(corncrakeciRepoId);
	});

	if (!repository) {
		throw new NotFoundError("Repository not found");
	}

	const forge = await getForgeWithUser(userId);
	await forge.checkAccess(repository.forge_repo_id, AccessLevel.Read);
	const forgeRepo = await forge.getRepository(repository.forge_repo_id);

	return respond.with200().body({
		repo: {
			repo_id: repository.repo_id,
			forge_repo_id: repository.forge_repo_id,
			full_name: repository.repo_name,
			html_url: forgeRepo.html_url,
			forge: {
				id: repository.forge_id,
				name: repository.forge_display_name,
			},
		},
		configured_at: repository.created_at.toISOString(),
	});
};
