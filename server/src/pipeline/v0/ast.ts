import type { StoredLocation } from "@bgotink/kdl";

type Span = StoredLocation;

export type V0File = {
	uses: UseDeclaration[];

	workflows: WorkflowDeclaration[];
};

export type UseDeclaration = {
	resourceKind: string; // image
	name: string;
	specifier: string; // e.g. rust:1.123
	location: StoredLocation | null;
};

export type WorkflowDeclaration = {
	/**
	 * Null if this is an implicit workflow.
	 */
	name: string | null;
	span: Span;

	stages: StageDeclaration[];
};

export type StageDeclaration = {
	/**
	 * Name of the stage.
	 *
	 * When a job is not defined in a stage explicitly, it is wrapped in an 'implicit stage'
	 * and that stage has the same name as the job.
	 */
	name: string;
	span: Span;

	jobs: JobDeclaration[];
};

export type JobDeclaration = {
	name: string;
	span: Span;
	needs: NeedsDeclaration[];

	steps: AnyStepDeclaration[];
};

export type AnyStepDeclaration =
	| CacheStepDeclaration
	| EnvStepDeclaration
	| UserStepDeclaration;

export type CacheStepDeclaration = {
	type: "cache";
	span: Span;
	// TODO
};

export type EnvStepDeclaration = {
	type: "env";
	span: Span;
	// TODO
};

export type UserStepDeclaration = {
	type: "user";
	span: Span;
	image?: string | undefined;
	command: string;
	// TODO
};

export type NeedsDeclaration = {
	job: string;
	allowFailed: boolean;
	span: Span;
};
