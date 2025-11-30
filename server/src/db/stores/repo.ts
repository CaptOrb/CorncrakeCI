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
       RETURNING *`,
			[
				forgeId,
				forgeRepoId,
				ownerId,
				repoName,
				description,
				cloneUrl,
				sshUrl,
				htmlUrl,
				isPrivate,
				"main",
			], // or default branch
		);

		const repository = result.rows[0];
		const newlyCreated =
			repository.created_at.getTime() === repository.updated_at.getTime();

		if (newlyCreated) {
			await this.client.query(
				`SELECT graphile_worker.add_job(
           'setup_webhooks',
           json_build_object(
             'repoId', $1,
             'ownerId', $2
           )
         )`,
				[repository.repo_id.toString(), repository.owner_id.toString()],
			);
		}

		return repository;
	}
}
