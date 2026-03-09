import "@typespec/http";
import "@typespec/openapi";
import "@typespec/openapi3";

using Http;
using OpenAPI;

/**
 * CORNCRAKECI API.
 *
 * Provides authentication via Git forges, repository configuration,
 * pipeline observability (logs, artifacts, status), and runner management.
 */
@service(#{ title: "CORNCRAKECI API" })
@info(#{ version: "0.1.0" })
namespace CorncrakeCIAPI;

model Error {
  /**
   * Error message
   */
  error: string;

  /**
   * Additional error details
   */
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

alias ExecutionStatus = "pending" | "running" | "completed" | "failed" | "canceled";
alias TriggerEvent = "push" | "pull_request" | "workflow_dispatch" | "tag";
alias LogResponse =
  | {
      @statusCode statusCode: 200;
      @header contentType: "text/plain";
      @body logs: string;
    }
  | {
      @statusCode statusCode: 206;
      @header contentType: "text/plain";
      @header contentRange: string;
      @body logs: string;
    };

model WhoAmI {
  user: UserSummary;
  forge: ForgeSummary;
}

@route("/whoami")
@get
@summary("Return information about the current logged-in user")
op whoAmI(): Body<WhoAmI> | (UnauthorizedResponse & Error) | InternalError;

@route("/forges")
@get
@summary("List available forge providers")
op listForges(): Body<ForgeSummary[]> | InternalError;

@route("/repos/available")
@get
@summary("List repositories available from the user's forge account")
op listAvailableRepos():
  | Body<ForgeRepository[]>
  | (UnauthorizedResponse & Error)
  | (ForbiddenResponse & Error)
  | InternalError;

@route("/repos/configured")
@get
@summary("List repositories already configured in CORNCRAKECI")
op listConfiguredRepos(): Body<RepositoryConfig[]> | (UnauthorizedResponse &
  Error) | InternalError;

@route("/repo")
@post
@summary("Configure a new repository for CORNCRAKECI")
op configureRepo(
  @body body: {
    forge_repo_id: string;
  },
):
  | Body<{
      repo_id: integer;
    }>
  | (BadRequestResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{id}")
@get
@summary("Get the configuration of a specific repository")
op getRepo(
  /**
   * Repository ID
   */
  @path id: integer,
):
  | RepositoryConfig
  | (BadRequestResponse & Error)
  | (UnauthorizedResponse & Error)
  | (NotFoundResponse & Error)
  | InternalError;

@route("/repo/{id}")
@put
@summary("Reconfigure a repository for CORNCRAKECI")
op reconfigureRepo(
  /**
   * Repository ID
   */
  @path id: integer,

  @body body: {},
):
  | RepositoryConfig
  | (BadRequestResponse & Error)
  | (UnauthorizedResponse & Error)
  | (NotFoundResponse & Error)
  | InternalError;

@route("/repo/{id}/branches")
@get
@summary("List branches for a repository")
op listBranches(
  @path id: integer,
):
  | Body<string[]>
  | (UnauthorizedResponse & Error)
  | (NotFoundResponse & Error)
  | InternalError;

@route("/repo/{id}/pipelines/check")
@post
@summary("Validate all pipeline configurations in a repository")
op checkPipelines(
  @path id: integer,
  @body body: {
    /**
     * ref/branch to check. Defaults to default branch.
     */
    @example("main")
    ref?: string;
  },
):
  | Body<{
      pipelines: PipelineCheckResult[];
    }>
  | (BadRequestResponse & Error)
  | (UnauthorizedResponse & Error)
  | (NotFoundResponse & Error)
  | InternalError;

model PipelineCheckResult {
  /**
   * Path to the pipeline configuration file relative to the ci folder root.
   * Example: "deploy.kdl"
   */
  path: string;

  /**
   * The content of the pipeline configuration file that was validated.
   * This allows clients to display the file content alongside any errors.
   */
  content: string;

  errors?: PipelineError[];
}

model PipelineError {
  message: string;
  startLine?: integer;
  startColumn?: integer;
  endLine?: integer;
  endColumn?: integer;
  docRef?: string;
}

model TriggerInfo {
  /** Event type that triggered this pipeline */
  event: TriggerEvent;

  /** Branch or ref that triggered the pipeline */
  ref?: string;

  /** Commit SHA that triggered the pipeline */
  commit_sha?: string;

  /** First line of the commit message. */
  commit_message?: string;

  /** Author of the commit, or user who triggered a manual dispatch. */
  author?: string;

  /** For workflow_dispatch: any custom JSON-structured data */
  manual_data?: {};
}

model PipelineSummary {
  pipeline_id: string;

  /** Path to the pipeline config file that was executed, e.g. "deploy.kdl" */
  source_file: string;

  status: ExecutionStatus;
  trigger: TriggerInfo;
  created_at: utcDateTime;
  started_at?: utcDateTime;
  finished_at?: utcDateTime;
}

/** Full pipeline detail including stages and jobs. */
model PipelineDetail {
  ...PipelineSummary;

  /** The raw pipeline configuration content that was executed. */
  config: string;

  /** Files changed in the commit that triggered this pipeline. */
  changed_files?: ChangedFile[];

  /** Jobs grouped by stage. Stage order reflects execution order. */
  stages: StageInfo[];
}

model ChangedFile {
  /** File path relative to the repository root. */
  path: string;

  /** Type of change. */
  action: "added" | "modified" | "deleted" | "renamed";
}

/** A stage groups jobs that run in parallel within the pipeline */
model StageInfo {
  /** Stage name. Absent for implicit (single-job) stages */
  name?: string;

  jobs: JobSummary[];
}

/** Lightweight job representation used in pipeline detail and list responses. */
model JobSummary {
  job_id: string;
  name: string;
  status: ExecutionStatus;

  /** Stage this job belongs to, if applicable. */
  stage?: string;

  started_at?: utcDateTime;
  finished_at?: utcDateTime;
}

/** Full job detail including steps, dependencies, and runtime info. */
model JobDetail {
  ...JobSummary;

  /** Jobs this job depends on. */
  needs?: JobDependency[];

  /** Container image used to run this job, if any. */
  image?: string;

  /** ID of the runner this job was assigned to. */
  runner_id?: string;

  steps: StepStatus[];
}

/** A dependency on another job, with optional failure tolerance */
model JobDependency {
  /** Name of the required job. */
  job: string;

  /** If true, this job runs even when the dependency has failed. */
  allow_failed: boolean;
}

/** Status of a single step within a job */
model StepStatus {
  step_id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  started_at?: utcDateTime;
  finished_at?: utcDateTime;
}

/** Metadata for an artifact produced by a job. */
model Artifact {
  artifact_id: string;
  name: string;
  size_bytes: integer;
  created_at: utcDateTime;
}

@route("/repo/{repoId}/pipelines")
@get
@summary("List pipelines for a repository")
op listPipelines(
  @path repoId: integer,

  /** Filter by pipeline status. */
  @query status?: ExecutionStatus,

  /** Filter by branch/ref name. */
  @query branch?: string,

  /** Filter by trigger event type. */
  @query event?: TriggerEvent,

  @query limit?: integer,
  @query offset?: integer,
):
  | Body<PipelineSummary[]>
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}")
@get
@summary("Get pipeline detail including stages and jobs")
op getPipeline(@path repoId: integer, @path pipelineId: string):
  | Body<PipelineDetail>
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}/cancel")
@post
@summary("Cancel a running pipeline and all of its pending/running jobs")
op cancelPipeline(@path repoId: integer, @path pipelineId: string):
  | Body<PipelineSummary>
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}/retry")
@post
@summary("Retry a failed pipeline — re-runs all failed and canceled jobs")
op retryPipeline(@path repoId: integer, @path pipelineId: string):
  | Body<PipelineSummary>
  | (BadRequestResponse & Error)
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/dispatch")
@post
@summary("Manually trigger a pipeline run (workflow_dispatch)")
op dispatchPipeline(
  @path repoId: integer,
  @body body: {
    /** Branch or ref to run against. Defaults to the repository's default branch. */
    ref?: string;

    /** Custom data passed to the pipeline. */
    manual_data?: {};

    /** Key-value variables for the pipeline run. */
    variables?: Record<string>;
  },
):
  | Body<PipelineSummary>
  | (BadRequestResponse & Error)
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}/jobs/{jobId}")
@get
@summary("Get job detail including steps and dependencies")
op getJob(
  @path repoId: integer,
  @path pipelineId: string,
  @path jobId: string,
):
  | Body<JobDetail>
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}/jobs/{jobId}/retry")
@post
@summary("Retry a single failed or canceled job")
op retryJob(
  @path repoId: integer,
  @path pipelineId: string,
  @path jobId: string,
):
  | Body<JobSummary>
  | (BadRequestResponse & Error)
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}/jobs/{jobId}/logs")
@get
@summary("Get aggregated logs for a job. Supports Range headers for byte-range pagination; chunked transfer encoding for running jobs.")
op getJobLogs(
  @path repoId: integer,
  @path pipelineId: string,
  @path jobId: string,
):
  | LogResponse
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}/jobs/{jobId}/steps/{stepId}/logs")
@get
@summary("Get logs for a specific step. Supports Range headers for byte-range pagination; chunked transfer encoding for running steps.")
op getStepLogs(
  @path repoId: integer,
  @path pipelineId: string,
  @path jobId: string,
  @path stepId: string,
):
  | LogResponse
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;


@route("/repo/{repoId}/pipelines/{pipelineId}/jobs/{jobId}/artifacts")
@get
@summary("List artifacts produced by a job")
op listJobArtifacts(
  @path repoId: integer,
  @path pipelineId: string,
  @path jobId: string,
):
  | Body<Artifact[]>
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

@route("/repo/{repoId}/pipelines/{pipelineId}/jobs/{jobId}/artifacts/{artifactId}")
@get
@summary("Download a specific artifact")
op downloadArtifact(
  @path repoId: integer,
  @path pipelineId: string,
  @path jobId: string,
  @path artifactId: string,
):
  | {
      @statusCode statusCode: 200;
      @header contentType: "application/octet-stream";
      @header contentDisposition: string;
      @body data: bytes;
    }
  | (NotFoundResponse & Error)
  | (UnauthorizedResponse & Error)
  | InternalError;

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

/** A runner capable of executing jobs. */
model Runner {
  id: string;
  name: string;

  /** Total CPU cores available. */
  cpu: integer;

  /** Total RAM in MiB available. */
  ram: integer;

  /** CPU cores currently allocated to running jobs. */
  cpu_allocated: integer;

  /** RAM in MiB currently allocated to running jobs. */
  ram_allocated: integer;

  status: "idle" | "running" | "offline";
}

@route("/runners")
@get
@summary("List all registered runners and their current status")
op listRunners(): Body<Runner[]> | InternalError;
