/** biome-ignore-all lint/complexity/useLiteralKeys: <oli said it was ok> */
import { type Request, type Response, Router } from "express";
import { config } from "../config/env";
import { createForge, listAvailableForges } from "../services/forges";
import { getOrCreateUser } from "../types/user";

const authRouter = Router();

authRouter.get("/providers", (_req, res) => {
	res.json({ providers: listAvailableForges() });
});

authRouter.get("/login/:forgeType", (req: Request, res: Response) => {
	const forgeType = req.params["forgeType"];
	if (!forgeType) return res.status(400).json({ error: "Missing forgeType" });

	try {
		const forge = createForge(forgeType);
		const authData = forge.getAuthorizationUrl();

		req.session.codeVerifier = authData.codeVerifier;
		req.session.forgeType = forgeType;

		res.cookie("state", authData.state, {
			secure: config.IS_PRODUCTION,
			path: "/",
			httpOnly: true,
			maxAge: 10 * 60 * 1000, // 10 minutes
		});

		res.json({ authUrl: authData.url });
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

	if (!forgeType || !state || !code || !codeVerifier) {
		return res.status(400).json({ error: "Missing OAuth callback parameters" });
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
		console.error("OAuth callback error:", err);
		res.status(500).json({ error: "OAuth callback failed" });
	}
});

authRouter.post("/logout", (req: Request, res: Response) => {
	req.session.destroy((err) => {
		if (err) return res.status(500).json({ error: "Failed to logout" });
		res.clearCookie("connect.sid");
		res.json({ success: true });
	});
});

export default authRouter;
