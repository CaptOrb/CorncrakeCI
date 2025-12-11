export interface GiteaRepo {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	/* API URL */
	url: string;
	html_url: string;
	clone_url: string;
	ssh_url: string;
	owner: {
		id: number;
		login: string;
		avatar_url: string;
	};
	description?: string;
}
