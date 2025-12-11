import type { PoolClient } from "pg";
import type { t_RepositoryConfig } from "../../generated/server/models";

type RepositoryCreateResponse = {
	repository_id: number;
};

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
	): Promise<RepositoryCreateResponse> {
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
        RETURNING repo_id, owner_id, created_at, updated_at`,
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

		return { repository_id: repository.repo_id };
	}

	async listConfiguredRepositories(
		ownerId: number,
	): Promise<t_RepositoryConfig[]> {
		const result = await this.client.query(
			`
    SELECT
      r.forge_repo_id,
      r.repo_name,
      r.description,
      r.is_private,
      r.html_url,
      r.created_at,

      f.forge_id,
      f.display_name,
      f.base_url,

      u.forge_user_id
    FROM repositories r
    JOIN forges f ON r.forge_id = f.forge_id
    JOIN users u ON r.owner_id = u.user_id
    WHERE r.owner_id = $1
      AND r.webhook_secret IS NOT NULL;
    `,
			[ownerId],
		);

		return result.rows.map((row) => ({
			repo: {
				forge_repo_id: row.forge_repo_id,
				full_name: row.repo_name,
				description: row.description,
				private: row.is_private,
				url: row.html_url,

				forge: {
					id: row.forge_id,
					name: row.display_name,
					domain: row.base_url,
				},

				owner: {
					id: row.forge_user_id,
					login: row.forge_user_id,
					avatar_url: undefined,
				},
			},

			configured_at: row.created_at?.toISOString(),
		}));
	}

	async getRepositoryById(
		repoId: number,
		ownerId: number,
	): Promise<{
		repo_id: number;
		forge_id: number;
		forge_repo_id: string;
		owner_id: number;
		repo_name: string;
		description: string | null;
		clone_url: string;
		ssh_url: string | null;
		html_url: string | null;
		is_private: boolean;
		default_branch: string;
		created_at: Date;
		updated_at: Date;
		forge_display_name: string;
	} | null> {
		const result = await this.client.query(
			`SELECT r.repo_id, r.forge_id, r.forge_repo_id, r.owner_id, r.repo_name, r.description, 
			 r.clone_url, r.ssh_url, r.html_url, r.is_private, r.default_branch, r.created_at, r.updated_at,
			 f.display_name as forge_display_name
			 FROM repositories r
			 JOIN forges f ON r.forge_id = f.forge_id
			 WHERE r.repo_id = $1 AND r.owner_id = $2`,
			[repoId, ownerId],
		);
		if (result.rows.length === 0) {
			return null;
		}
		return result.rows[0];
	}
}
