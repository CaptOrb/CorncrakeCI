// biome-ignore-all lint/complexity/useLiteralKeys: without adding types,
//   we can't remove literal keys from a few areas in this file

import { promisify } from "node:util";
import { type Request, type Response, Router } from "express";
import { config } from "../../config";
import { mustGetForge } from "../../services/forges";
import { getOrCreateUser } from "../../services/user";

const authRouter = Router();

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

		req.session.incompleteLogin = {
			forgeId,
			codeVerifier: authData.codeVerifier,
		};

		const cookieName = isProduction ? "__Host-oauth_state" : "oauth_state";
		const thenCookieName = isProduction ? "__Host-then_path" : "then_path";

		// Store OAuth state in a cookie
		res.cookie(cookieName, authData.state, {
			secure: isProduction,
			path: "/",
			httpOnly: true,
			maxAge: 10 * 60 * 1000, // 10 minutes
			sameSite: "lax",
		});

		// Store then parameter in a cookie
		const thenParam = req.query["then"] as string;
		if (thenParam) {
			res.cookie(thenCookieName, thenParam, {
				secure: isProduction,
				path: "/",
				httpOnly: true,
				maxAge: 10 * 60 * 1000, // 10 minutes
				sameSite: "lax",
			});
		}
		res.redirect(authData.url);
	} catch (err) {
		console.error("Failed to generate auth URL:", err);
		res.status(400).json({ error: (err as Error).message });
	}
});

authRouter.get("/callback", async (req: Request, res: Response) => {
	const incompleteLogin = req.session.incompleteLogin;
	const state = req.query["state"] as string;
	const code = req.query["code"] as string;

	const isProduction = config.node.env === "production";
	const cookies = parseCookies(req);
	const cookieName = isProduction ? "__Host-oauth_state" : "oauth_state";
	const thenCookieName = isProduction ? "__Host-then_path" : "then_path";
	const stateFromCookie = cookies[cookieName];

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

		// regenerate the session, which is good practice to help guard against forms of session fixation
		// see https://expressjs.com/en/resources/middleware/session.html
		await promisify(req.session.regenerate).apply(req.session);

		req.session.userId = internalUser.user_id;
		// incomplete_login should not be reused
		delete req.session.incompleteLogin;

		await promisify(req.session.save).apply(req.session);

		const thenPath = cookies[thenCookieName];

		res.clearCookie(cookieName, {
			path: "/",
			secure: isProduction,
			httpOnly: true,
			sameSite: "lax",
		});

		// Clear the then cookie if it exists
		if (thenPath) {
			res.clearCookie(thenCookieName, {
				path: "/",
				secure: isProduction,
				httpOnly: true,
				sameSite: "lax",
			});
		}

		// Validate and redirect to the then path if provided and valid
		if (thenPath && isValidRedirectPath(thenPath)) {
			res.redirect(thenPath);
			return;
		}

		res.redirect(`/`);
	} catch (err) {
		res.clearCookie(cookieName, {
			path: "/",
			secure: isProduction,
			httpOnly: true,
			sameSite: "lax",
		});
		res.clearCookie(thenCookieName, {
			path: "/",
			secure: isProduction,
			httpOnly: true,
			sameSite: "lax",
		});
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

function isValidRedirectPath(path: string): boolean {
	return path.startsWith("/") && !path.includes("://");
}

export default authRouter;
