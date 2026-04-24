import type { Application } from "express";
import supertest from "supertest";
import type { ForgeId } from "../../src/db/schema/public/Forges";
import type { UserId } from "../../src/db/schema/public/Users";

export interface TestUser {
	user_id: UserId;
	forge_id: ForgeId;
	session_id: string;
}

export interface CreateTestUserOptions {
	forgeId?: ForgeId;
	authCode?: string; // different auth codes for different users
}

export async function createTestUser(
	app: Application,
	options: CreateTestUserOptions = {},
): Promise<TestUser> {
	const { forgeId = 1 as ForgeId, authCode = "testCode" } = options;
	const request = supertest(app);

	const loginResponse = await request.get(`/auth/login/${forgeId}`);
	if (loginResponse.status !== 302) {
		throw new Error(`Login unsuccessful: ${loginResponse.status}`);
	}

	const loginCookies = loginResponse.get("Set-Cookie"); // the types are broken, this is actually string[]
	if (!loginCookies) {
		throw new Error("No cookies set");
	}

	const callbackResponse = await request
		.get("/auth/callback")
		.query({ code: authCode, state: "STATE" })
		.set("Cookie", loginCookies);

	if (callbackResponse.status !== 302) {
		console.error(callbackResponse.error);
		throw new Error(`Callback failed with status ${callbackResponse.status}`);
	}

	const callbackCookies = callbackResponse.get("Set-Cookie");

	if (!callbackCookies) {
		throw new Error("No callback cookies set");
	}
	const callbackCookieArray = Array.isArray(callbackCookies)
		? callbackCookies
		: [callbackCookies];

	// Get session ID from callback response as we want to guard against session fixation
	const sessionCookie = callbackCookieArray.find((c: string) =>
		c.startsWith("sessionID="),
	);

	if (!sessionCookie) {
		throw new Error("No session cookie found");
	}
	const sessionId = sessionCookie.match(/sessionID=([^;]+)/)?.[1];
	if (!sessionId) {
		throw new Error("Failed to parse session ID from callback");
	}

	const whoamiResponse = await request
		.get(`/v0/whoami`)
		.set("Cookie", `sessionID=${sessionId}`);
	if (whoamiResponse.status !== 200) {
		throw new Error(`/whoami unsuccessful: ${whoamiResponse.status}`);
	}
	const whoami = whoamiResponse.body;

	return {
		user_id: whoami.user.id as UserId,
		forge_id: whoami.forge.id as ForgeId,
		session_id: sessionId,
	};
}
