export interface GiteaRepo {
	id: number;
	name: string;
	full_name: string;
	/* API URL */
	url: string;
	owner: {
		id: number;
		login: string;
		avatar_url: string;
	};
}
