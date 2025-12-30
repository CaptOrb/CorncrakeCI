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

model ForgeSummary {
  id: integer;
  name: string;
}

model RepositoryConfig {
  repo: ForgeRepository;
  configured_at: utcDateTime;
}

@route("/repos/available")
@get
@summary("List repositories available from the user's forge account")
op listAvailableRepos():
  | Body<ForgeRepository[]>
  | (UnauthorizedResponse & Error)
  | (ForbiddenResponse & Error)
  | {
      @statusCode statusCode: 500;
      @body body: Error;
    };

@route("/repos/configured")
@get
@summary("List repositories already configured in MOLCI")
op listConfiguredRepos(): Body<RepositoryConfig[]> | (UnauthorizedResponse &
  Error) | {
  @statusCode statusCode: 500;
  @body body: Error;
};

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
  | {
      @statusCode statusCode: 500;
      @body body: Error;
    };

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
  | {
      @statusCode statusCode: 500;
      @body body: Error;
    };

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
  | {
      @statusCode statusCode: 500;
      @body body: Error;
    };

@route("/webhooks/{repoId}")
@post
@summary("Handle webhook events from forge")
op handleWebhook(
  /**
   * Repository ID
   */
  @path repoId: integer,

  /**
   * Webhook payload from forge.
   *
   * Freeform, forge-dependent and dependent on the event type (from HTTP header).
   * Will be parsed with Valibot later.
   */
  @body body: Record<unknown>,
): {
  @statusCode statusCode: 200;
} | {
  @statusCode statusCode: 400;
  @body body: Error;
} | {
  @statusCode statusCode: 404;
  @body body: Error;
};
