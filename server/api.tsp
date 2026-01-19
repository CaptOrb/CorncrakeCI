import "@typespec/http";
import "@typespec/openapi";
import "@typespec/openapi3";

using Http;
using OpenAPI;

/**
 * OpenAPI spec for MOLCI backend. This API allows users to log in via a Git forge (Gitea), list repositories and handle configuration.
 *
 */
@service(#{ title: "MOLCI API" })
@info(#{ version: "0.1.0" })
namespace MOLCIAPI;

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
  forge: ForgeSummary;
}

model ConfiguredRepository {
  repo_id: integer;
  forge_repo_id: string;
  full_name: string;
  forge: ForgeSummary;
}

model UserSummary {
  id: integer;
  name: string;
}

model ForgeSummary {
  id: integer;
  name: string;
}

model RepositoryConfig {
  repo: ConfiguredRepository;
  configured_at: utcDateTime;
}

alias InternalError = {
  @statusCode statusCode: 500;
  @body body: Error;
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
@summary("List repositories already configured in MOLCI")
op listConfiguredRepos(): Body<RepositoryConfig[]> | (UnauthorizedResponse &
  Error) | InternalError;

@route("/repo")
@post
@summary("Configure a new repository for MOLCI")
op configureRepo(
  @body body: {
    forge: integer;
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
@summary("Reconfigure a repository for MOLCI")
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
