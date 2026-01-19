// biome-ignore-all lint/complexity/useLiteralKeys: without adding types,
//   we can't remove literal keys from a few areas in this file

import { promisify } from "node:util";
import { type Request, type Response, Router } from "express";
import { config } from "../../config";
import { mustGetForge } from "../../services/forges";
import { getOrCreateUser } from "../../services/user";

const authRouter = Router();

const isProduction = config.node.env === "production";

const getCookieName = (name: string): string =>
	isProduction ? `__Host-${name}` : name;

const OAUTH_STATE_COOKIE = getCookieName("oauth_state");
const THEN_PATH_COOKIE = getCookieName("then_path");
const SESSION_COOKIE = getCookieName("sessionID");

const OAUTH_COOKIE_OPTIONS = {
	secure: isProduction,
	path: "/",
	httpOnly: true,
	maxAge: 10 * 60 * 1000, // 10 minutes
	sameSite: "lax" as const,
};

const CLEAR_COOKIE_OPTIONS = {
	path: "/",
	secure: isProduction,
	httpOnly: true,
	sameSite: "lax" as const,
};

function clearOAuthCookies(res: Response): void {
	res.clearCookie(OAUTH_STATE_COOKIE, CLEAR_COOKIE_OPTIONS);
	res.clearCookie(THEN_PATH_COOKIE, CLEAR_COOKIE_OPTIONS);
}

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

	try {
		const forge = mustGetForge(forgeId);
		const authData = forge.getAuthorizationUrl();

		req.session.incompleteLogin = {
			forgeId,
			codeVerifier: authData.codeVerifier,
		};

		// Store OAuth state in a cookie
		res.cookie(OAUTH_STATE_COOKIE, authData.state, OAUTH_COOKIE_OPTIONS);

		// Store then parameter in a cookie
		const thenParam = req.query["then"] as string;
		if (thenParam) {
			res.cookie(THEN_PATH_COOKIE, thenParam, OAUTH_COOKIE_OPTIONS);
		}
		res.redirect(authData.url);
	} catch (err) {
		console.error("Failed to generate auth URL:", err);
		res.status(400).json({ error: "Login unsuccessful" });
	}
});

authRouter.get("/callback", async (req: Request, res: Response) => {
	const incompleteLogin = req.session.incompleteLogin;
	const state = req.query["state"] as string;
	const code = req.query["code"] as string;

	const cookies = parseCookies(req);
	const stateFromCookie = cookies[OAUTH_STATE_COOKIE];

	if (!incompleteLogin || !state || !code) {
		res.status(400).json({ error: "Missing OAuth callback parameters" });
		return;
	}

	if (!stateFromCookie) {
		res.status(400).json({ error: "Missing state from cookie" });
		return;
	}

	if (state !== stateFromCookie) {
		res.status(400).json({ error: "Invalid OAuth state parameter" });
		return;
	}

	try {
		const { forgeId, codeVerifier } = incompleteLogin;
		const forge = mustGetForge(forgeId);
		const tokens = await forge.exchangeCodeForToken(code, codeVerifier);
		const forgeWithUser = forge.withUser(tokens.accessToken);
		const forgeUser = await forgeWithUser.getUserInfo();

		const internalUser = await getOrCreateUser(
			forgeId,
			forgeUser.id.toString(),
			tokens.accessToken,
			tokens.accessTokenExpiresAt,
			tokens.refreshToken,
			tokens.refreshTokenExpiresAt,
		);

		// incomplete_login should not be reused
		delete req.session.incompleteLogin;

		// regenerate the session, which is good practice to help guard against forms of session fixation
		// see https://expressjs.com/en/resources/middleware/session.html
		await promisify(req.session.regenerate).apply(req.session);

		req.session.userId = internalUser.user_id;

		await promisify(req.session.save).apply(req.session);

		const thenPath = cookies[THEN_PATH_COOKIE];

		clearOAuthCookies(res);

		// Validate and redirect to the then path if provided and valid
		if (thenPath && isValidRedirectPath(thenPath)) {
			res.redirect(thenPath);
			return;
		}

		res.redirect(`/`);
	} catch (err) {
		clearOAuthCookies(res);
		console.error("OAuth callback error:", err);
		res.status(500).json({ error: "OAuth callback failed" });
	}
});

authRouter.post("/logout", (req: Request, res: Response) => {
	const requestedRedirectUrl: string | undefined = req.body.then;
	const redirectUrl =
		requestedRedirectUrl && isValidRedirectPath(requestedRedirectUrl)
			? requestedRedirectUrl
			: config.app.baseurl;
	req.session.destroy((err) => {
		if (err) {
			res.status(500).json({ error: "Failed to logout" });
			return;
		}
		res.clearCookie(SESSION_COOKIE, {
			path: "/",
			secure: isProduction,
			httpOnly: true,
			sameSite: "lax" as const,
		});
		clearOAuthCookies(res);
		res.redirect(redirectUrl);
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

function isValidRedirectPath(redirectUrl: string): boolean {
	let url: URL;
	try {
		url = new URL(redirectUrl, config.app.baseurl);
	} catch {
		return false;
	}

	const base = new URL(config.app.baseurl);

	return url.origin === base.origin;
}

export default authRouter;
