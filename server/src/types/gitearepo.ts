export interface GiteaRepo {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	html_url: string;
	owner: {
		id: number;
		login: string;
		avatar_url: string;
	};
	description?: string;
}
