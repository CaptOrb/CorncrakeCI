import "@typespec/http";
import "./common.tsp";
import "./execution-models.tsp";

using Http;

namespace CorncrakeCIAPI {
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
}
