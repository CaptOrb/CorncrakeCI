import "./common.tsp";

namespace CorncrakeCIAPI;

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
