export interface User {
	user_id: number; // internal molci ID
	forge_id: number;
	forge_user_id: string;
	forge_username: string;
	/**
	 * Not currently in DB
	 */
	avatar_url?: string;
}
