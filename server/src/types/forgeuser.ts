export interface ForgeUser {
	// TODO should this be a string for futureproofing?
	id: number; // forge user ID
	login: string;
	avatar_url?: string | undefined;
}
