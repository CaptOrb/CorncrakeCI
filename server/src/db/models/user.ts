export interface User {
	user_id: number; // internal molci ID
	forge_id: number;
	forge_user_id: string;
	access_token?: string;
	token_expires_at?: Date;
	/**
	 * Not currently in DB
	 */
	avatar_url?: string;
}
