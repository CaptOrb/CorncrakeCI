import type { PoolClient } from "pg";
import { RepositoryStore } from "./repo";
import { UserStore } from "./user";

export class Transaction {
	public users: UserStore;
	public repositories: RepositoryStore;

	constructor(public client: PoolClient) {
		this.users = new UserStore(this.client);
		this.repositories = new RepositoryStore(this.client);
	}
}
