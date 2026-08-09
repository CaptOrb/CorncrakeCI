export type TriggerEvent = PushTriggerEvent | PullRequestTriggerEvent;

export interface PushTriggerEvent {
	eventType: "push";

	commitHash: string;

	commitMessage?: string;

	/**
	 * ref such as `refs/heads/main` for the `main` branch.
	 */
	ref: string;
}

export interface PullRequestTriggerEvent {
	eventType: "pull_request";

	prCommitHash: string;
	targetCommitHash: string;

	prBranch: string;
	targetBranch: string;

	commitMessage?: string;

	// Generally the PR number in string form.
	// But Forges could expose something different here.
	prShortHumanId: string;
}
