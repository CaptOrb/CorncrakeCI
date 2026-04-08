# Glossary of terminology relating to pipelines

Somewhat frustratingly, every CI system has its own slight variation on these terms. Here's ours.

**Pipeline**: The complete CI/CD configuration for the repository.
  Contains all workflows, which are independently triggered by events.

**Pipeline Run**: One invocation of the pipeline in response to an event.

**Event**: Something that happens to trigger a pipeline run (e.g. commits being pushed).

**Workflow**: A collection of jobs (perhaps wrapped in stages) that are independent.
  Workflows cannot have dependencies on each other.
  The individual unit of planning.

**Stage**: A group of jobs.
  Provides a convenient way to declare ordering dependencies between many jobs.

**Job**: The individual unit of execution scheduling, with a shared workspace.
  Each job gets its own workspace that is shared by the steps that run inside it.
  When active, a job represents a resource allocation
  (including CPU, memory and disk space).
  Jobs can have ordering dependencies between each other.

**Step**: The individual commands/operations that run within a job,
  each sharing the job's workspace, but potentially using different containers or
  tools.
