export interface User {
	id: number | string;
	login: string;
	email?: string;
	avatar_url?: string;
}

// logic to insert user in db