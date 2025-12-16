// biome-ignore-all lint/complexity/useLiteralKeys: without adding types,
//   we can't remove literal keys from a few areas in this file
import { type Request, type Response, Router } from "express";
import { config } from "../config";
import { listAvailableForgeIds, mustGetForge } from "../services/forges";
import { getOrCreateUser } from "../services/user";

const authRouter = Router();

authRouter.get("/providers", (_req, res) => {
	res.json({ providers: listAvailableForgeIds() });
});

authRouter.get("/login/:forgeId", (req: Request, res: Response) => {
	const forgeIdParam = req.params["forgeId"];
	if (!forgeIdParam) {
		res.status(400).json({ error: "Missing forgeId" });
		return;
	}

	const forgeId = parseInt(forgeIdParam, 10);
	if (Number.isNaN(forgeId)) {
		res.status(400).json({ error: "Invalid forgeId" });
		return;
	}

	const isProduction = config.node.env === "production";

	try {
		const forge = mustGetForge(forgeId);
		const authData = forge.getAuthorizationUrl();

		req.session.codeVerifier = authData.codeVerifier;
		req.session.forgeId = forgeId;

		const cookieName = isProduction ? "__Host-oauth_state" : "oauth_state";

		// Store OAuth state in a cookie
		res.cookie(cookieName, authData.state, {
			secure: isProduction,
			path: "/",
			httpOnly: true,
			maxAge: 10 * 60 * 1000, // 10 minutes
			sameSite: "lax",
		});

		res.json({ authUrl: `${authData.url}&state=${authData.state}` });
	} catch (err) {
		console.error("Failed to generate auth URL:", err);
		res.status(400).json({ error: (err as Error).message });
	}
});

authRouter.get("/callback", async (req: Request, res: Response) => {
	const forgeId = req.session.forgeId;
	const codeVerifier = req.session.codeVerifier;
	const state = req.query["state"] as string;
	const code = req.query["code"] as string;

	const isProduction = config.node.env === "production";
	const cookies = parseCookies(req);
	const cookieName = isProduction ? "__Host-oauth_state" : "oauth_state";
	const stateFromCookie = cookies[cookieName];

	if (forgeId === undefined || !state || !code || !codeVerifier) {
		res.status(400).json({ error: "Missing OAuth callback parameters" });
		return;
	}

	if (state !== stateFromCookie) {
		res.status(400).json({ error: "Invalid OAuth state parameter" });
		return;
	}

	try {
		const forge = mustGetForge(forgeId);
		const { accessToken, accessTokenExpiresAt } =
			await forge.exchangeCodeForToken(code, codeVerifier);
		const forgeWithUser = forge.withUser(accessToken);
		const forgeUser = await forgeWithUser.getUserInfo();

		const internalUser = await getOrCreateUser(
			forgeId,
			forgeUser.id.toString(),
			accessToken,
			accessTokenExpiresAt,
		);

		req.session.userId = internalUser.user_id;
		req.session.forgeId = forgeId;

		// Clear OAuth session data
		delete req.session.codeVerifier;
		res.clearCookie(cookieName, { path: "/" });

		res.json({
			success: true,
			user: {
				user_id: internalUser.user_id, // internal molci ID
				forgeUserId: forgeUser.id,
				login: forgeUser.login,
				avatar_url: forgeUser.avatar_url,
			},
		});
	} catch (err) {
		res.clearCookie(cookieName, { path: "/" });
		console.error("OAuth callback error:", err);
		res.status(500).json({ error: "OAuth callback failed" });
	}
});

authRouter.post("/logout", (req: Request, res: Response) => {
	const isProduction = config.node.env === "production";

	req.session.destroy((err) => {
		if (err) {
			res.status(500).json({ error: "Failed to logout" });
			return;
		}
		res.clearCookie(isProduction ? "__Host-SessionID" : "sessionID", {
			path: "/",
		});
		res.clearCookie(isProduction ? "__Host-oauth_state" : "oauth_state", {
			path: "/",
		});
		res.json({ success: true });
	});
});

function parseCookies(req: Request): Record<string, string> {
	const header = req.headers.cookie;
	if (!header) return {};
	return Object.fromEntries(
		header.split("; ").map((c) => {
			const [key, ...v] = c.split("=");
			return [key, decodeURIComponent(v.join("="))];
		}),
	);
}

export default authRouter;
