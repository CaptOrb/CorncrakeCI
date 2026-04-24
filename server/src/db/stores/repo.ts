import { sql, type Transaction } from "kysely";
import type { t_RepositoryConfig } from "../../generated/server/models";
import type { SetupWebhooksJobPayload } from "../../jobs/setup-webhooks";
import type Database from "../schema/Database";
import type { ForgeId } from "../schema/public/Forges";
import type { RepoId } from "../schema/public/Repositories";
import type { UserId } from "../schema/public/Users";

type RepositoryCreateResponse = {
	repo_id: RepoId;
};

export class RepositoryStore {
	constructor(private kysely: Transaction<Database>) {}

	async createOrUpdateRepository(
		forgeId: ForgeId,
		forgeRepoId: string,
		ownerId: UserId,
		repoName: string,
	): Promise<RepositoryCreateResponse> {
		const result = await this.kysely
			.insertInto("repositories")
			.values({
				forge_id: forgeId,
				forge_repo_id: forgeRepoId,
				owner_id: ownerId,
				repo_name: repoName,
			})
			.onConflict((oc) =>
				oc.columns(["forge_id", "forge_repo_id"]).doUpdateSet({
					repo_name: repoName,
					updated_at: sql`NOW()`,
				}),
			)
			.returning("repo_id")
			.executeTakeFirstOrThrow();

		// schedule webhook setup job (for both configureRepo and reconfigureRepo)
		// The job_key ensures only one job exists per repo
		await sql`SELECT graphile_worker.add_job(
			'setup_webhooks',
			${JSON.stringify({ repoId: result.repo_id } satisfies SetupWebhooksJobPayload)}::json,
			job_key := ${`setup_webhooks:${result.repo_id}`}
		)`.execute(this.kysely);

		return { repo_id: result.repo_id };
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
		forge_id: ForgeId,
		forge_repo_ids: string[],
	): Promise<t_RepositoryConfig[]> {
		if (forge_repo_ids.length === 0) return [];

		const rows = await this.kysely
			.selectFrom("repositories as r")
			.innerJoin("forges as f", "r.forge_id", "f.forge_id")
			.select([
				"r.repo_id",
				"r.forge_id",
				"r.forge_repo_id",
				"r.repo_name",
				"r.created_at",
				"f.display_name",
			])
			.where("r.webhook_secret", "is not", null)
			.where("r.forge_id", "=", forge_id)
			.where("r.forge_repo_id", "in", forge_repo_ids)
			.execute();

		return rows.map(
			(row) =>
				({
					repo: {
						forge_repo_id: row.forge_repo_id,
						full_name: row.repo_name,
						repo_id: row.repo_id,
						forge: {
							id: row.forge_id,
							name: row.display_name,
						},
					},
					configured_at: row.created_at.toISOString(),
				}) satisfies t_RepositoryConfig,
		);
	}

	async getRepositoryById(
		repoId: RepoId,
		ownerId?: UserId,
	): Promise<{
		repo_id: RepoId;
		forge_id: ForgeId;
		forge_repo_id: string;
		owner_id: UserId;
		repo_name: string;
		webhook_secret: string | null;
		created_at: Date;
		updated_at: Date;
		forge_display_name: string;
	} | null> {
		let query = this.kysely
			.selectFrom("repositories as r")
			.innerJoin("forges as f", "r.forge_id", "f.forge_id")
			.select([
				"r.repo_id",
				"r.forge_id",
				"r.forge_repo_id",
				"r.owner_id",
				"r.repo_name",
				"r.webhook_secret",
				"r.created_at",
				"r.updated_at",
				"f.display_name as forge_display_name",
			])
			.where("r.repo_id", "=", repoId);

		if (ownerId !== undefined) {
			query = query.where("r.owner_id", "=", ownerId);
		}

		const result = await query.executeTakeFirst();
		return result ?? null;
	}

	/**
	 * Returns the subset of forgeRepoIds that are configured (have a webhook_secret)
	 * for a given forgeId.
	 */
	async getConfiguredRepoIds(
		forgeId: ForgeId,
		forgeRepoIds: string[],
	): Promise<Set<string>> {
		if (forgeRepoIds.length === 0) return new Set();

		const rows = await this.kysely
			.selectFrom("repositories")
			.select("forge_repo_id")
			.where("webhook_secret", "is not", null)
			.where("forge_id", "=", forgeId)
			.where("forge_repo_id", "in", forgeRepoIds)
			.execute();

		return new Set(rows.map((r) => r.forge_repo_id));
	}

	async getRepositoryForWebhookSetup(repoId: RepoId): Promise<{
		forge_id: ForgeId;
		forge_repo_id: string;
		forge_user_id: string;
		access_token: Buffer | null;
		webhook_secret: string | null;
	} | null> {
		const result = await this.kysely
			.selectFrom("repositories as r")
			.innerJoin("users as u", "r.owner_id", "u.user_id")
			.leftJoin("forge_access_tokens as tokens", "u.user_id", "tokens.user_id")
			.select([
				"r.forge_id",
				"r.forge_repo_id",
				"u.forge_user_id",
				"tokens.access_token",
				"r.webhook_secret",
			])
			.where("r.repo_id", "=", repoId)
			.executeTakeFirst();

		return result ?? null;
	}

	async updateWebhookSecret(
		repoId: RepoId,
		secret: string | null,
	): Promise<void> {
		await this.kysely
			.updateTable("repositories")
			.set({
				webhook_secret: secret,
				updated_at: sql`NOW()`,
			})
			.where("repo_id", "=", repoId)
			.execute();
	}
}
