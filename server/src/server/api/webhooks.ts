import * as v from "valibot";
import { transaction } from "../../db/stores";
import type { HandleWebhook } from "../../generated/server/generated";
import { verifyWebhookSignature } from "../../util/crypto";
import type { RawBodyRequest } from "..";

export const handleWebhook: HandleWebhook = async (
	{ params, body },
	respond,
	req: RawBodyRequest,
	_res,
	_next,
) => {
	const { repoId } = params;

	const repo = await transaction(async (txn) => {
		return await txn.repositories.getRepositoryById(repoId);
	});

	if (!repo) {
		return respond.with404().body({ error: "Repository not found" });
	}

	// Before processing the webhook, we should verify that is came from the forge
	// To do this, we calculate an HMAC of the request body bytes and
	// compare it against the HMAC provided in the request header
	if (!req.rawBody) {
		// We need the raw body bytes. This error shouldn't happen.
		return respond.with400().body({ error: "Missing raw request body" });
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
		return respond.with400().body({ error: "Missing signature header" });
	}
	if (!eventTypeHeader) {
		return respond.with400().body({ error: "Missing event type header" });
	}
	if (!deliveryHeader) {
		return respond.with400().body({ error: "Missing delivery ID header" });
	}

	// Verify signature using raw body
	if (
		!verifyWebhookSignature(req.rawBody, repo.webhook_secret, signatureHeader)
	) {
		return respond.with400().body({ error: "Invalid signature" });
	}

	// At this point, the signature has been verified and we can process the body
	console.log(
		`Received ${eventTypeHeader} webhook ${deliveryHeader} for repo ${repoId}`,
	);
	console.debug("Raw webhook payload:", body);

	switch (eventTypeHeader) {
		case "pull_request_sync": {
			const parsed = v.safeParse(s_PullRequestWebHook, body);
			if (parsed.success) {
				console.debug("pull request:", parsed.output);
				// TODO do something
			} else {
				console.warn(
					`Failed to parse ${eventTypeHeader} webhook body:`,
					parsed.issues,
				);
				return respond
					.with400()
					.body({ error: "Could not parse webhook body" });
			}
			break;
		}
		default: {
			console.info(`Unknown webhook event type ${eventTypeHeader}, ignoring.`);
			break;
		}
	}

	return respond.with200();
};

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
