/**
 * A somewhat end-to-end test suite
 * that covers a pipeline run from the webhook to the execution of the tasks.
 */

import crypto from "node:crypto";
import type { Application } from "express";
import { runOnce } from "graphile-worker";
import type { Pool } from "pg";
import supertest from "supertest";
import type TestAgent from "supertest/lib/agent";
import { beforeEach, describe, expect, test } from "vitest";
import {
	globalScheduler,
	type SchedulingJob,
} from "../../src/execution/scheduler";
import { setup_webhooks } from "../../src/jobs/setup-webhooks";
import { createApiServer } from "../../src/server";
import { createTestUser } from "../helpers/auth";
import { databaseHelper } from "../helpers/database";
import { testForgeHelper } from "../helpers/forge";
import { schedulerHelper } from "../helpers/scheduler";

// Creates a webhook signature that should satisfy `verifyWebhookSignature`
function createWebhookSignature(
	rawBody: string | Buffer,
	secret: string,
): string {
	const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest();
	return `sha256=${hmac.toString("hex")}`;
}

/**
 * Exposition of private fields on `Scheduler`
 */
interface TestSchedulerAccess {
	readyJobs: Set<SchedulingJob>;
}

describe("from webhook to executed", () => {
	let pool: Pool;
	let app: Application;
	let request: TestAgent;

	databaseHelper((newPool) => {
		pool = newPool;
	});

	schedulerHelper();

	const forge = testForgeHelper();

	beforeEach(async () => {
		app = await createApiServer({
			isProduction: false,
			pool,
		});

		request = supertest(app);
	});

	test("simple pipeline", async () => {
		// SETUP
		// Configure a repo, run the background jobs to set up webhooks
		// and set a pipeline definition in the repo
		const testData = await createTestUser(app);

		const createResponse = await request
			.post("/v0/repo")
			.set("Cookie", `sessionID=${testData.session_id}`)
			.send({
				forge_repo_id: "repo0001",
			})
			.expect(200);

		expect(createResponse.body).toHaveProperty("repo_id");

		await runOnce(
			{
				pgPool: pool,
			},
			{ setup_webhooks },
		);

		const simplePipeline = `
corncrake version=v0
job "test" {
    step "echo hello"
}
        `;

		forge.controller!.setRepoConfigs(
			"repo0001",
			new Map([[".corncrake/ci.kdl", simplePipeline]]),
		);

		const scheduler = globalScheduler();
		const internals = scheduler as unknown as TestSchedulerAccess;

		// Check there's no jobs in the scheduler before the test
		expect(internals.readyJobs.size).toStrictEqual(0);

		// Now our repo should be set up.
		// Simulate a webhook arriving.

		const webhook = forge.controller!.repositories.get("repo0001")!.webhook!;

		const webhookBody = {
			ref: "refs/heads/main",
			before: "aaaaaaa",
			after: "bbbbbbb",
			commits: [{ id: "bbbbbbb", message: "CI test!", url: "about:blank" }],
			repository: {
				id: 1,
				full_name: "test/repo0001",
				clone_url: "https://example.invalid",
			},
			pusher: {
				id: 42,
			},
		};
		const jsonWebhookBody = JSON.stringify(webhookBody);
		const webhookUrlPath = webhook.url.replace(/http:\/\/[^/]+\/api/, "");
		console.log("posting webhook to", webhookUrlPath);
		await request
			.post(webhookUrlPath)
			.set(
				"x-hub-signature-256",
				createWebhookSignature(
					Buffer.from(jsonWebhookBody, "utf-8"),
					webhook.secret,
				),
			)
			.set("x-github-delivery", "123456")
			.set("x-github-event-type", "push")
			.set("content-type", "application/json")
			.send(jsonWebhookBody)
			.expect(200);

		// Our scheduler should have a job now
		expect(internals.readyJobs.size).toStrictEqual(1);

		// TODO We should expand this test to the end of the execution
		// once that part is implemented
	});
});
