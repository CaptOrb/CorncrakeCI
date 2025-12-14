import type { Application } from "express";
import supertest from "supertest";
import type { User } from "../../src/db/models/user";

export interface UserWithSessionId extends User {
	session_id: string;
}

export async function createTestUser(
	app: Application,
	forgeId = 1,
): Promise<UserWithSessionId> {
	const request = supertest(app);

	const loginResponse = await request.get(`/auth/login/${forgeId}`);
	if (loginResponse.status !== 200) {
		throw new Error(`Login unsuccessful: ${loginResponse.status}`);
	}

	const loginCookies = loginResponse.headers["set-cookie"];
	if (!loginCookies) {
		throw new Error("No cookies set");
	}

	const cookieArray = Array.isArray(loginCookies)
		? loginCookies
		: [loginCookies];
	const cookieHeader = cookieArray
		.map((c: string) => c.split(";")[0])
		.join("; ");

	const callbackResponse = await request
		.get("/auth/callback")
		.query({ code: "testCode", state: "STATE" })
		.set("Cookie", cookieHeader);

	if (callbackResponse.status !== 200) {
		throw new Error(`Callback failed`);
	}

	const sessionCookie = cookieArray.find((c: string) =>
		c.startsWith("sessionID="),
	);
	if (!sessionCookie) {
		throw new Error("No session cookie found");
	}

	const sessionIdMatch = sessionCookie.match(/sessionID=([^;]+)/);
	if (!sessionIdMatch) {
		throw new Error("Failed to parse session ID");
	}

	const user = callbackResponse.body.user;

	return {
		user_id: user.user_id,
		forge_id: forgeId,
		forge_user_id: user.forgeUserId.toString(),
		access_token: "testAccessToken",
		token_expires_at: new Date("2100-01-01T01:01:01"),
		session_id: sessionIdMatch[1],
	};
}
