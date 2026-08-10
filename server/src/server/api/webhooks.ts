import type { Response } from "express";
import * as v from "valibot";
import { config } from "../../config";
import type { RepoId } from "../../db/schema/public/Repositories";
import { transaction } from "../../db/stores";
import { launchPipelineExecution } from "../../execution";
import { globalScheduler } from "../../execution/scheduler";
import type { TriggerEvent } from "../../execution/trigger_event";
import type { t_PipelineCheckResult } from "../../generated/server/models";
import { parseKdlConfigs } from "../../pipeline";
import { getForgeWithUser } from "../../services/forges";
import type { ForgeWithUser } from "../../services/forges/forge";
import { verifyWebhookSignature } from "../../util/crypto";
import { createLogger } from "../../util/logging";
import type { RawBodyRequest } from "..";

const log = createLogger(import.meta.url);

export const handleWebhook = async (req: RawBodyRequest, res: Response) => {
	const { repoId: repoIdStr } = req.params;
	const repoId = Number(repoIdStr) as RepoId;
	const repo = await transaction(async (txn) => {
		return await txn.repositories.getRepositoryById(repoId);
	});

	if (!repo) {
		return res.status(404).json({ error: "Repository not found" });
	}

	if (!req.rawBody) {
		// We need the raw body bytes. This error shouldn't happen.
		return res.status(400).json({ error: "Missing raw request body" });
	}

	// These are not headers that have a list of duplicates,
	// so cast to string
	// X-GitHub-Delivery (GitHub, Gitea): unique ID of the webhook delivery
	// Should be useful for diagnostics/logging.
	const deliveryHeader = req.headers?.["x-github-delivery"] as
		| string
		| undefined;
	// X-Hub-Signature-256 (GitHub, Gitea): `sha256=<HMAC>` to verify the webhook came from the forge
	const signatureHeader = req.headers?.["x-hub-signature-256"] as
		| string
		| undefined;
	// X-GitHub-Event-Type (GitHub, Gitea): identifies what sort of event this is
	const eventTypeHeader = req.headers?.["x-github-event-type"] as
		| string
		| undefined;

	if (!signatureHeader) {
		return res.status(400).json({ error: "Missing signature header" });
	}
	if (!eventTypeHeader) {
		return res.status(400).json({ error: "Missing event type header" });
	}
	if (!deliveryHeader) {
		return res.status(400).json({ error: "Missing delivery ID header" });
	}

	if (!repo.webhook_secret) {
		return res.status(404).json({ error: "Webhook not configured" });
	}

	// Verify signature using raw body
	// Before processing the webhook, we should verify that it came from the forge
	// To do this, we calculate an HMAC of the request body bytes and
	// compare it against the HMAC provided in the request header

	if (
		!verifyWebhookSignature(req.rawBody, repo.webhook_secret, signatureHeader)
	) {
		return res.status(400).json({ error: "Invalid signature" });
	}

	// At this point, the signature has been verified and we can process the body
	log.info(
		{
			repoId,
			eventTypeHeader,
			deliveryHeader,
		},
		`Received webhook`,
	);
	log.trace({
		rawWebhookPayload: req.body,
	});

	const forge = await getForgeWithUser(repo.owner_id);
	const decode = decodeWebhookEvent(eventTypeHeader, req.body);

	if (decode === undefined) {
		return res.status(204).end();
	}

	if (!decode.ok) {
		return res.status(400).json({
			error: decode.error,
		});
	}

	const { triggerEvent } = decode;

	const commitHash =
		triggerEvent.eventType === "pull_request"
			? triggerEvent.prCommitHash
			: triggerEvent.commitHash;

	// Calculate a description of the event
	let shortDescription: string;
	switch (triggerEvent.eventType) {
		case "push": {
			shortDescription = `push to ${triggerEvent.ref}`;
			break;
		}
		case "pull_request": {
			shortDescription = `PR ${triggerEvent.prShortHumanId}`;
			break;
		}
	}

	forge
		.createCommitStatus(
			repo.forge_repo_id,
			commitHash,
			"pending",
			"pipeline queued",
			"corncrake/ci",
			`${config.app.baseurl}/repos/${repoId}/pipelines`,
		)
		.catch((err) => log.warn({ err }, "failed to set pending commit status"));

	const corncrakeciConfig = await forge.getCorncrakeciConfig(
		repo.forge_repo_id,
		// TODO For PRs, we want to load the CI config that is the merge result, not just the PR.
		// For now, getting the workflow from the PR is fine.
		commitHash,
	);

	const { configs, results } = parseKdlConfigs(corncrakeciConfig.configFiles);
	await reportPipelineErrors(
		forge,
		repo.forge_repo_id,
		// Report errors on the current commit itself
		commitHash,
		repo.repo_id,
		results,
		shortDescription,
	);

	await launchPipelineExecution(
		repoId,
		configs,
		triggerEvent,
		globalScheduler(),
	);

	// TODO Report the pipeline ID in the output?
	return res.status(200).end();
};

type DecodeWebhookEventResult =
	| {
			ok: true;
			triggerEvent: TriggerEvent;
	  }
	| {
			ok: false;
			error: string;
	  };

/**
 * Attempt to decode the webhook body into a `TriggerEvent`.
 *
 * @returns Struct including the decoded trigger event, or an error, or undefined if no particular error
 *   is intended but no event was parsed.
 */
function decodeWebhookEvent(
	eventTypeHeader: string | undefined,
	body: unknown,
): DecodeWebhookEventResult | undefined {
	switch (eventTypeHeader) {
		case "pull_request_sync":
		case "pull_request": {
			const parsed = v.safeParse(s_PullRequestWebHook, body);
			if (!parsed.success) {
				log.warn(
					{
						issues: parsed.issues,
					},
					"Failed to parse pull request webhook",
				);
				return {
					ok: false,
					error: "Could not parse webhook body",
				};
			}

			return {
				ok: true,
				triggerEvent: {
					// TODO This event type is probably too vague
					eventType: "pull_request",

					// The webhook calls this a ref, but that's misleading!
					// It's actually the branch name, `me/feature123` NOT `refs/heads/me/feature123`
					prBranch: parsed.output.pull_request.head.ref,
					prCommitHash: parsed.output.pull_request.head.sha,
					prShortHumanId: `${parsed.output.pull_request.number}`,
					commitMessage: parsed.output.pull_request.title,

					// The webhook calls this a ref, but that's misleading!
					// It's actually the branch name, `main` NOT `refs/heads/main`
					targetBranch: parsed.output.pull_request.base.ref,
					targetCommitHash: parsed.output.pull_request.base.sha,
				},
			};
		}
		case "push": {
			const parsed = v.safeParse(s_PushWebHook, body);
			if (!parsed.success) {
				log.warn(
					{
						issues: parsed.issues,
					},
					"Failed to parse push webhook",
				);
				return {
					ok: false,
					error: "Could not parse webhook body",
				};
			}

			const commitMessage = parsed.output.commits[0]?.message;

			return {
				ok: true,
				triggerEvent: {
					eventType: "push",
					ref: parsed.output.ref,
					commitHash: parsed.output.after,
					...(commitMessage !== undefined && { commitMessage }),
				},
			};
		}
		default: {
			log.info({ eventTypeHeader }, `Unknown webhook event type, ignoring.`);
			return undefined;
		}
	}
}

async function reportPipelineErrors(
	forge: ForgeWithUser,
	repoForgeId: string,
	sha: string,
	repoId: RepoId,
	results: t_PipelineCheckResult[],
	_context: string,
) {
	const hasErrors = results.some(
		(result) => result.errors && result.errors.length > 0,
	);

	if (hasErrors) {
		const errorPageUrl = `${config.app.baseurl}/repos/${repoId}/pipeline-check?ref=${sha}`;

		try {
			await forge.createCommitStatus(
				repoForgeId,
				sha,
				"failure",
				"pipeline failed:",
				"corncrake/pipeline-validation",
				errorPageUrl,
			);
		} catch (error) {
			log.error({ error }, "Failed to create commit status");
		}
	}
}

const s_User = v.object({
	id: v.pipe(v.number(), v.integer()),
	// login: v.string()
});

const s_Ref = v.object({
	// do we use label or ref?
	ref: v.string(),
	sha: v.string(),

	repo: v.object({
		id: v.pipe(v.number(), v.integer()),
		full_name: v.string(),
		clone_url: v.string(),
	}),
});

const s_PullRequest = v.object({
	number: v.pipe(v.number(), v.integer()),

	title: v.string(),
	// TODO not sure if this is the right type
	labels: v.array(v.string()),

	user: s_User,

	base: s_Ref,
	head: s_Ref,

	// commit hash, might be the same as 'base.sha', so not sure we need this
	merge_base: v.string(),
});

const s_PullRequestWebHook = v.object({
	action: v.picklist(["synchronized", "opened"]),
	sender: s_User,
	pull_request: s_PullRequest,
});

const s_PushWebHook = v.object({
	ref: v.string(),
	before: v.string(),
	after: v.string(),
	commits: v.array(
		v.object({
			id: v.string(),
			message: v.string(),
			url: v.string(),
		}),
	),
	repository: v.object({
		id: v.number(),
		full_name: v.string(),
		clone_url: v.string(),
	}),
	pusher: s_User,
});
