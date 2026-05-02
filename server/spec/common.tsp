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

alias ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

alias TriggerEvent = "push" | "pull_request" | "workflow_dispatch" | "tag";

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
