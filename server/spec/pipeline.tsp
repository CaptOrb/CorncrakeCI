import "@typespec/http";
import "./common.tsp";
import "./execution-models.tsp";

using Http;

namespace CorncrakeCIAPI {
  @route("/repo/{id}/pipelines/check")
  @post
  @summary("Validate all pipeline configurations in a repository")
  op checkPipelines(
    @path id: integer,
    @body body: {
      /** ref/branch to check. Defaults to default branch. */
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

  /** Full pipeline detail including its workflow runs and their jobs. */
  model PipelineDetail {
    ...PipelineSummary;

    /**The raw pipeline configuration content that was executed. */
    config?: string;

    /** Files changed in the commit that triggered this pipeline. */
    changed_files?: ChangedFile[];

    /** Workflow runs that make up this pipeline, each containing its jobs. */
    workflows: WorkflowRun[];
  }

  model ChangedFile {
    /** File path relative to the repository root. */
    path: string;

    /** Type of change. */
    action: "added" | "modified" | "deleted" | "renamed";
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
}
