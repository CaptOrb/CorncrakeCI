/** biome-ignore-all lint/complexity/useLiteralKeys: <oli said it was ok> */
import { type Request, type Response, Router } from "express";
import { config } from "../config/env";
import { createForge, listAvailableForges } from "../services/forges";
import { getOrCreateUser } from "../services/user";

const authRouter = Router();

authRouter.get("/providers", (_req, res) => {
	res.json({ providers: listAvailableForges() });
});

authRouter.get("/login/:forgeType", (req: Request, res: Response) => {
	const forgeType = req.params["forgeType"];
	if (!forgeType) {
		res.status(400).json({ error: "Missing forgeType" });
		return;
	}

	try {
		const forge = createForge(forgeType);
		const authData = forge.getAuthorizationUrl();

		req.session.codeVerifier = authData.codeVerifier;
		req.session.forgeType = forgeType;

		const cookieName = config.IS_PRODUCTION
			? "__Host-oauth_state"
			: "oauth_state";

		// Store OAuth state in a cookie
		res.cookie(cookieName, authData.state, {
			secure: config.IS_PRODUCTION,
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
	const forgeType = req.session.forgeType;
	const codeVerifier = req.session.codeVerifier;
	const state = req.query["state"] as string;
	const code = req.query["code"] as string;

	const cookies = parseCookies(req);
	const cookieName = config.IS_PRODUCTION
		? "__Host-oauth_state"
		: "oauth_state";
	const stateFromCookie = cookies[cookieName];

	if (!forgeType || !state || !code || !codeVerifier) {
		res.status(400).json({ error: "Missing OAuth callback parameters" });
		return;
	}

	if (state !== stateFromCookie) {
		res.status(400).json({ error: "Invalid OAuth state parameter" });
		return;
	}

	try {
		const forge = createForge(forgeType);
		const { accessToken, accessTokenExpiresAt } =
			await forge.exchangeCodeForToken(code, codeVerifier);

		const forgeUser = await forge.getUserInfo(accessToken);

		const internalUser = await getOrCreateUser(
			forgeType,
			forgeUser.id.toString(),
			accessToken,
			accessTokenExpiresAt,
		);

		req.session.userId = internalUser.user_id;
		req.session.forgeType = forgeType;

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
	req.session.destroy((err) => {
		if (err) {
			res.status(500).json({ error: "Failed to logout" });
			return;
		}
		res.clearCookie("__Host-SessionID", { path: "/" });
		const cookieName = config.IS_PRODUCTION
			? "__Host-oauth_state"
			: "oauth_state";
		res.clearCookie(cookieName, { path: "/" });
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
