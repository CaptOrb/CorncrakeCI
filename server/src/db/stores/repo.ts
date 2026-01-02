import type { PoolClient } from "pg";
import type { t_RepositoryConfig } from "../../generated/server/models";
import type { SetupWebhooksJobPayload } from "../../jobs/setup-webhooks";

type RepositoryCreateResponse = {
	repo_id: number;
};

export class RepositoryStore {
	constructor(private client: PoolClient) {}

	async createOrUpdateRepository(
		forgeId: number,
		forgeRepoId: string,
		ownerId: number,
		repoName: string,
	): Promise<RepositoryCreateResponse> {
		const result = await this.client.query(
			`INSERT INTO repositories
       (forge_id, forge_repo_id, owner_id, repo_name)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (forge_id, forge_repo_id)
       DO UPDATE SET
         repo_name = EXCLUDED.repo_name,
         updated_at = NOW()
		RETURNING repo_id`,
			[forgeId, forgeRepoId, ownerId, repoName],
		);

		const repository: {
			repo_id: number;
		} = result.rows[0];

		// schedule webhook setup job (for both configureRepo and reconfigureRepo)
		// The job_key ensures only one job exists per repo
		await this.client.query(
			`SELECT graphile_worker.add_job(
			'setup_webhooks', $1,
			job_key := $2
		 )`,
			[
				{
					repoId: repository.repo_id,
				} satisfies SetupWebhooksJobPayload,
				`setup_webhooks:${repository.repo_id}`,
			],
		);

		return { repo_id: repository.repo_id };
	}

	async listConfiguredRepositories(
		ownerId: number,
	): Promise<t_RepositoryConfig[]> {
		const result = await this.client.query(
			`
	    SELECT
	      r.forge_repo_id,
	      r.repo_name,
	      r.created_at,
		  r.repo_id,
	      f.forge_id,
	      f.display_name,

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
				repo_id: row.repo_id,

				forge: {
					id: row.forge_id,
					name: row.display_name,
				},

				owner: {
					id: row.forge_user_id,
					login: row.forge_user_id,
					avatar_url: undefined,
				},
			},

			configured_at: row.created_at.toISOString(),
		}));
	}

	async getRepositoryById(
		repoId: number,
		ownerId?: number,
	): Promise<{
		webhook_secret: string;
		repo_id: number;
		forge_id: number;
		forge_repo_id: string;
		owner_id: number;
		repo_name: string;
		created_at: Date;
		updated_at: Date;
		forge_display_name: string;
	} | null> {
		const result = await this.client.query(
			`SELECT r.repo_id, r.forge_id, r.forge_repo_id, r.owner_id, r.repo_name, webhook_secret,
			 r.created_at, r.updated_at,
			 f.display_name as forge_display_name
			 FROM repositories r
			 JOIN forges f USING (forge_id)
			 WHERE r.repo_id = $1 ${ownerId !== undefined ? "AND r.owner_id = $2" : ""}`,
			ownerId !== undefined ? [repoId, ownerId] : [repoId],
		);
		if (result.rows.length === 0) {
			return null;
		}
		return result.rows[0];
	}

	async clearWebhookSecret(repoId: number): Promise<void> {
		await this.client.query(
			`UPDATE repositories
				SET webhook_secret = NULL
			WHERE repo_id = $1`,
			[repoId],
		);
	}
}
