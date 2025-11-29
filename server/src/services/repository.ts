import { pool } from "../config/db";
import { makeWorkerUtils } from "graphile-worker";

export interface Repository {
	repo_id: number;
	forge_id: number;
	forge_repo_id: string;
	owner_id: number;
	repo_name: string;
	description?: string;
	clone_url: string;
	ssh_url?: string;
	html_url?: string;
	is_private: boolean;
	default_branch: string;
	webhook_setup?: boolean;
	created_at: Date;
	updated_at: Date;
}

class RepositoryService {

	async getOrCreateRepository(
		forgeId: number,
		forgeRepoId: string,
		ownerId: number,
		repoName: string,
		description: string | undefined,
		cloneUrl: string,
		sshUrl: string | undefined,
		htmlUrl: string | undefined,
		isPrivate: boolean,
	): Promise<Repository> {
		const result = await pool.query(
			`INSERT INTO repositories
			(forge_id, forge_repo_id, owner_id, repo_name, description, clone_url, ssh_url, html_url, is_private, default_branch)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
			],
		);

		const repository = result.rows[0];

		// Only queue webhook job for newly created repositories
		if (repository.created_at.getTime() === repository.updated_at.getTime()) {
			try {
				const workerUtils = await makeWorkerUtils({
					connectionString: process.env["DATABASE_URL"]!,
				});

				await workerUtils.addJob("setup_webhooks", {
					repoId: repository.repo_id.toString(),
					ownerId: repository.owner_id.toString(),
				});

				await workerUtils.release();
			} catch (error) {
				console.error("Failed to queue webhook setup job:", error);
			}
		}

		return repository;
	}
}

export const repositoryService = new RepositoryService();
