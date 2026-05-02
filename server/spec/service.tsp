import "@typespec/openapi";
import "@typespec/openapi3";

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
