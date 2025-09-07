export interface User {
	user_id: number; // internal molci ID
	avatar_url?: string;
	access_token?: string;
	forge_id: number;
	forge_user_id: string;
	token_expires_at?: Date;
}
