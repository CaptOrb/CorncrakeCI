import "@typespec/http";
import "./common.tsp";

using Http;

namespace CorncrakeCIAPI {
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
  op listConfiguredRepos(): Body<RepositoryConfig[]> | (UnauthorizedResponse & Error) | InternalError;

  @route("/repo")
  @post
  @summary("Configure a new repository for CORNCRAKECI")
  op configureRepo(
    @body body: { forge_repo_id: string; },
  ):
    | Body<{ repo_id: integer; }>
    | (BadRequestResponse & Error)
    | (UnauthorizedResponse & Error)
    | InternalError;

  @route("/repo/{id}")
  @get
  @summary("Get the configuration of a specific repository")
  op getRepo(
    /** Repository ID */
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
    /** Repository ID */
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
  op listBranches(@path id: integer):
    | Body<string[]>
    | (UnauthorizedResponse & Error)
    | (NotFoundResponse & Error)
    | InternalError;
}
