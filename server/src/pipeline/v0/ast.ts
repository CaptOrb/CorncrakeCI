import type { StoredLocation } from "@bgotink/kdl";

// This will be used to track where items in the file come from, so we can
// report errors later on. If you can figure it out, feel free to fix, otherwise
// just leave it as the string "TODO" everywhere this is used for now!
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
	span: Span;
	// TODO
};

export type EnvStepDeclaration = {
	span: Span;
	// TODO
};

export type UserStepDeclaration = {
	span: Span;
	image?: string;
	command: string;
	// TODO
};

export type NeedsDeclaration = {
	job: string;
	allowFailed: boolean;
	span: Span;
};
