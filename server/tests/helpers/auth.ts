import type { Application } from "express";
import supertest from "supertest";
import type { User } from "../../src/db/models/user";

export interface UserWithSessionId extends User {
	session_id: string;
}

export interface CreateTestUserOptions {
	forgeId?: number;
	authCode?: string; // different auth codes for different users
}

export async function createTestUser(
	app: Application,
	options: CreateTestUserOptions = {},
): Promise<UserWithSessionId> {
	const { forgeId = 1, authCode = "testCode" } = options;
	const request = supertest(app);

	const loginResponse = await request.get(`/auth/login/${forgeId}`);
	if (loginResponse.status !== 200) {
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

	if (callbackResponse.status !== 200) {
		console.error(callbackResponse.error);
		throw new Error(`Callback failed`);
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
	const sessionIdMatch = sessionCookie.match(/sessionID=([^;]+)/);
	if (!sessionIdMatch) {
		throw new Error("Failed to parse session ID from callback");
	}

	const user = callbackResponse.body.user;

	return {
		user_id: user.user_id,
		forge_id: forgeId,
		forge_user_id: user.forgeUserId.toString(),
		session_id: sessionIdMatch[1]!,
	};
}
