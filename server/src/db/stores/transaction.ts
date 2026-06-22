import type { Transaction as KyselyTransaction } from "kysely";
import type Database from "../schema/Database";
import { PipelineStore } from "./pipeline";
import { RepositoryStore } from "./repo";
import { UserStore } from "./user";

export class Transaction {
	public users: UserStore;
	public pipelines: PipelineStore;
	public repositories: RepositoryStore;

	constructor(public kysely: KyselyTransaction<Database>) {
		this.users = new UserStore(this.kysely);
		this.pipelines = new PipelineStore(this.kysely);
		this.repositories = new RepositoryStore(this.kysely);
	}
}
