/** biome-ignore-all lint/complexity/useLiteralKeys: <oli said it was ok> */
import { type Request, type Response, Router } from "express";
import { config } from "../config/env";
import { createForge, listAvailableForges } from "../services/forges";

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

		const { accessToken } = await forge.exchangeCodeForToken(
			code,
			codeVerifier,
		);

		const userInfo = await forge.getUserInfo(accessToken);

		// -----------------------------
		// TODO: Insert user in DB
		// -----------------------------
		const simulatedUserId = 1; // replace with actual DB user_id

		req.session.userId = simulatedUserId;
		req.session.forgeType = forgeType;

		// Clear OAuth session data
		delete req.session.codeVerifier;

		res.json({
			success: true,
			user: {
				id: simulatedUserId, // internal molci ID
				forgeUserId: userInfo.id, // forge user ID
				login: userInfo.login,
				avatar_url: userInfo.avatar_url,
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
