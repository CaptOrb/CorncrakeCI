import { transaction } from "../../db/stores";
import type { WhoAmI } from "../../generated/server/generated";
import { AuthError, mustGetForge } from "../../services/forges";

export const whoAmI: WhoAmI = async (_params, respond, req) => {
	const userId = req.session?.userId;
	if (!userId) {
		throw new AuthError("Not authenticated");
	}

	const userInfo = await transaction(async (txn) => {
		return await txn.users.findUserById(userId);
	});
	if (!userInfo) {
		throw new Error("No userinfo for authenticated user");
	}

	const forge = mustGetForge(userInfo.forge_id);

	return respond.with200().body({
		forge: {
			id: userInfo.forge_id,
			name: forge.name,
			logo_url: forge.logoUrl,
		},
		user: {
			id: userInfo.user_id,
			name: userInfo.forge_username,
		},
	});
};
