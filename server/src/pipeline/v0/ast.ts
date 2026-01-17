// This will be used to track where items in the file come from, so we can
// report errors later on. If you can figure it out, feel free to fix, otherwise
// just leave it as the string "TODO" everywhere this is used for now!
type Span = "TODO";

export type V0File = {
	uses: UseDeclaration[];

	workflows: WorkflowDeclaration[];
};

export type UseDeclaration = {
	resourceKind: string;
	name: string;
	specifier: string;
	span: Span;
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
	 * Null if this is an implicit workflow.
	 */
	name: string | null;
	span: Span;

	jobs: JobDeclaration[];
};

export type JobDeclaration = {
	name: string;
	span: Span;

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
	// TODO
};
