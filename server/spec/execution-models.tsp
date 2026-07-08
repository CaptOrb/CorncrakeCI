import "./common.tsp";

namespace CorncrakeCIAPI;

/** Lightweight job representation used in workflow detail and list responses. */
model JobSummary {
  /**
   * Identifier of the job run, unique within the pipeline.
   * Encoded as "{workflow_run_id}.{job_run_id}".
   */
  job_id: string;
  name: string;
  status: ExecutionStatus;

  /** Stage this job belongs to, if applicable. */
  stage?: string;

  started_at?: utcDateTime;
  finished_at?: utcDateTime;
}

/** A workflow run: the unit of planning within a pipeline, containing its jobs. */
model WorkflowRun {
  workflow_id: string;
  status: ExecutionStatus;

  /** Config file this workflow was planned from, if known. */
  source_file?: string;

  /** Earliest time any of this workflow's jobs started, if any have. */
  started_at?: utcDateTime;

  /** Latest time any of this workflow's jobs finished, once all have. */
  finished_at?: utcDateTime;

  jobs: JobSummary[];
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
