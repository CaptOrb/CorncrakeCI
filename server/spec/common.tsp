import "@typespec/http";

using Http;

namespace CorncrakeCIAPI;

model Error {
  /** Error message */
  error: string;

  /** Additional error details */
  details?: {};
}

model ForgeRepository {
  forge_repo_id: string;
  full_name: string;
  html_url?: string;
  forge: ForgeSummary;
}

model ConfiguredRepository {
  repo_id: integer;
  forge_repo_id: string;
  full_name: string;
  html_url?: string;
  forge: ForgeSummary;
}

model UserSummary {
  id: integer;
  name: string;
}

/** Summary of a forge provider (e.g. Gitea, GitHub). */
model ForgeSummary {
  id: integer;
  name: string;
  logo_url?: string;
}

model RepositoryConfig {
  repo: ConfiguredRepository;
  configured_at: utcDateTime;
}

alias InternalError = {
  @statusCode statusCode: 500;
  @body body: Error;
};

/** Status shared by pipeline, workflow and job runs. */
union ExecutionStatus {
  pending: "pending",
  running: "running",
  completed: "completed",
  failed: "failed",
  canceled: "canceled",
  skipped: "skipped",
}

/** Kind of event that triggered a pipeline run. */
union TriggerEvent {
  push: "push",
  pull_request: "pull_request",
  workflow_dispatch: "workflow_dispatch",
  tag: "tag",
}

alias LogResponse = {
  @statusCode statusCode: 200;
  @header contentType: "text/plain";
  @body logs: string;
} | {
  @statusCode statusCode: 206;
  @header contentType: "text/plain";
  @header contentRange: string;
  @body logs: string;
};

model WhoAmI {
  user: UserSummary;
  forge: ForgeSummary;
}
