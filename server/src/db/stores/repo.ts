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

	/**
	 * Lists repositories that are configured for the given forge and repository IDs.
	 *
	 * Only returns repositories that:
	 *   - belong to the provided `forge_id`
	 * 	 - match one of the provided `forge_repo_ids`
	 *   - have a non-null `webhook_secret` (as the repo is configured)
	 * @param forge_id
	 * @param forge_repo_ids
	 * @returns Array of configured repositories with owner and forge info
	 */
	async listConfiguredRepositories(
		forge_id: number,
		forge_repo_ids: string[],
	): Promise<t_RepositoryConfig[]> {
		if (forge_repo_ids.length === 0) return [];

		const result = await this.client.query(
			`
			SELECT
			r.repo_id,
			r.forge_id,
			r.forge_repo_id,
			r.repo_name,
			r.created_at,

			f.display_name
			FROM repositories r
			JOIN forges f ON r.forge_id = f.forge_id
			WHERE r.webhook_secret IS NOT NULL
			AND r.forge_id = $1
			AND r.forge_repo_id = ANY($2::text[]);
    `,
			[forge_id, forge_repo_ids],
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
					name: row.forge_username,
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

	/**
	 * Returns the subset of forgeRepoIds that are configured (have a webhook_secret)
	 * for a given forgeId.
	 */

	async getConfiguredRepoIds(
		forgeId: number,
		forgeRepoIds: string[],
	): Promise<Set<string>> {
		if (forgeRepoIds.length === 0) return new Set();

		const result = await this.client.query(
			`
			SELECT forge_repo_id
			FROM repositories
			WHERE webhook_secret IS NOT NULL
			AND forge_id = $1
			AND forge_repo_id = ANY($2::text[])
			`,
			[forgeId, forgeRepoIds],
		);

		const configuredRepoIds = new Set<string>();
		for (const row of result.rows) {
			configuredRepoIds.add(row.forge_repo_id);
		}
		return configuredRepoIds;
	}

	async getRepositoryForWebhookSetup(repoId: number): Promise<{
		forge_id: number;
		forge_repo_id: string;
		forge_user_id: string;
		access_token: Buffer | null;
		webhook_secret: string | null;
	} | null> {
		const result = await this.client.query(
			`SELECT r.forge_id, r.forge_repo_id, u.forge_user_id, tokens.access_token, r.webhook_secret
			FROM repositories r
			JOIN users u ON r.owner_id = u.user_id
			LEFT JOIN forge_access_tokens tokens ON u.user_id = tokens.user_id
			WHERE r.repo_id = $1`,
			[repoId],
		);
		return result.rows[0] ?? null;
	}

	async updateWebhookSecret(
		repoId: number,
		secret: string | null,
	): Promise<void> {
		await this.client.query(
			`
			UPDATE repositories
			SET
				webhook_secret = $1,
				updated_at    = NOW()
			WHERE repo_id = $2
			`,
			[secret, repoId],
		);
	}
}
