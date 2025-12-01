import type { PoolClient } from "pg";
import type { ForgeRepository } from "../../types/openapi";

export class RepositoryStore {
	constructor(private client: PoolClient) {}

	async createOrUpdateRepository(
		forgeId: number,
		forgeRepoId: string,
		ownerId: number,
		repoName: string,
		description: string | undefined,
		cloneUrl: string,
		sshUrl: string | undefined,
		htmlUrl: string | undefined,
		isPrivate: boolean,
		defaultBranch: string,
	): Promise<ForgeRepository> {
		const result = await this.client.query(
			`INSERT INTO repositories
       (forge_id, forge_repo_id, owner_id, repo_name, description, clone_url, ssh_url, html_url, is_private, default_branch)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (forge_id, forge_repo_id)
       DO UPDATE SET
         repo_name = EXCLUDED.repo_name,
         description = EXCLUDED.description,
         clone_url = EXCLUDED.clone_url,
         ssh_url = EXCLUDED.ssh_url,
         html_url = EXCLUDED.html_url,
         is_private = EXCLUDED.is_private,
         default_branch = EXCLUDED.default_branch,
         updated_at = NOW()
        RETURNING repo_id, created_at, updated_at`,
			[
				forgeId,
				forgeRepoId,
				ownerId,
				repoName,
				description ?? null, // gitea doesn't mandate it?
				cloneUrl,
				sshUrl,
				htmlUrl,
				isPrivate,
				defaultBranch,
			],
		);

		const repository = result.rows[0];
		const newlyCreated =
			repository.created_at.getTime() === repository.updated_at.getTime();

		if (newlyCreated) {
			await this.client.query(
				`SELECT graphile_worker.add_job(
           'setup_webhooks',
           json_build_object(
             'repoId', $1::Integer,
             'ownerId', $2::Integer
           )
         )`,
				[repository.repo_id, repository.owner_id],
			);
		}

		return repository;
	}

	async listConfiguredRepositories(
		ownerId: number,
	): Promise<
		{ repo: { forge_repo_id: string; name: string; forge: string } }[]
	> {
		const result = await this.client.query(
			`SELECT forge_repo_id, repo_name, forge_id, description 
			 FROM repositories
			 WHERE owner_id = $1 AND webhook_secret IS NOT NULL`,
			[ownerId],
		);
		return result.rows.map((row) => ({
			repo: {
				forge_repo_id: row.forge_repo_id,
				name: row.repo_name,
				forge: row.forge_name,
			},
		}));
	}
}
