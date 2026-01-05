import { type Document, parse } from "@bgotink/kdl";
import type { Response } from "express";
import * as v from "valibot";
import { transaction } from "../../db/stores";
import { getForgeWithUser } from "../../services/forges";
import { verifyWebhookSignature } from "../../util/crypto";
import type { RawBodyRequest } from "..";

export const handleWebhook = async (req: RawBodyRequest, res: Response) => {
	const { repoId: repoIdStr } = req.params;
	const repoId = Number(repoIdStr);
	const repo = await transaction(async (txn) => {
		return await txn.repositories.getRepositoryById(repoId);
	});

	if (!repo) {
		return res.status(404).json({ error: "Repository not found" });
	}

	// Before processing the webhook, we should verify that is came from the forge
	// To do this, we calculate an HMAC of the request body bytes and
	// compare it against the HMAC provided in the request header
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

	// Verify signature using raw body
	if (
		!verifyWebhookSignature(req.rawBody, repo.webhook_secret, signatureHeader)
	) {
		return res.status(400).json({ error: "Invalid signature" });
	}

	// At this point, the signature has been verified and we can process the body
	console.log(
		`Received ${eventTypeHeader} webhook ${deliveryHeader} for repo ${repoId}`,
	);
	console.debug("Raw webhook payload:", req.body);

	const forge = await getForgeWithUser(repo.owner_id);
	switch (eventTypeHeader) {
		case "pull_request_sync":
		case "pull_request": {
			const parsed = v.safeParse(s_PullRequestWebHook, req.body);
			if (parsed.success) {
				console.debug("pull request:", parsed.output);

				const molciConfig = await forge.getMolciConfig(
					repo.forge_repo_id,
					parsed.output.pull_request.head.sha,
				);

				const configs = parseKdlConfigs(molciConfig.configFiles);

				console.log(
					`Pull Request Event: found files: ${[...configs.keys()].join(", ")} in ${molciConfig.path}`,
				);

				// TODO do something
			} else {
				console.warn(
					`Failed to parse ${eventTypeHeader} webhook body:`,
					parsed.issues,
				);
				return res.status(400).json({ error: "Could not parse webhook body" });
			}
			break;
		}
		case "push": {
			const parsed = v.safeParse(s_PushWebHook, req.body);
			if (parsed.success) {
				console.log("push:", parsed.output);

				const molciConfig = await forge.getMolciConfig(
					repo.forge_repo_id,
					parsed.output.after, // only the latest commit on a branch matters
				);

				const configs = parseKdlConfigs(molciConfig.configFiles);

				console.log(
					`push Event: (${parsed.output.ref}): found files: ${[...configs.keys()].join(", ")} in ${molciConfig.path}`,
				);
			}
			break;
		}
		default: {
			console.info(`Unknown webhook event type ${eventTypeHeader}, ignoring.`);
			break;
		}
	}

	return res.status(200).end();
};

/**
 * Parses KDL config files from a map of filename to content.
 */
function parseKdlConfigs(
	configFiles: Map<string, string>,
): Map<string, Document> {
	const configs = new Map<string, Document>();
	for (const [filename, content] of configFiles) {
		try {
			configs.set(filename, parse(content));
		} catch (error) {
			console.warn(`Failed to parse KDL file ${filename}:`, error);
		}
	}
	return configs;
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
