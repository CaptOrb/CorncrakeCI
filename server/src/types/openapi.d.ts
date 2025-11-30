import type {
  Context,
  UnknownParams,
} from 'openapi-backend';

declare namespace Components {
    namespace Schemas {
        export interface Error {
            /**
             * Error message
             * example:
             * Repository not found
             */
            error: string;
            /**
             * Error code for programmatic handling
             * example:
             * REPO_NOT_FOUND
             */
            code: string;
            /**
             * Additional error details
             */
            details?: {
                [name: string]: any;
            };
        }
        export interface ForgeRepository {
            forge_repo_id?: string;
            /**
             * example:
             * molci
             */
            name?: string;
            /**
             * example:
             * gitea
             */
            forge?: "gitea";
        }
        export interface RepositoryConfig {
            repo?: ForgeRepository;
            configured_at?: string; // date-time
        }
        export interface RepositoryConfigInput {
            settings: {
                [name: string]: any;
            };
        }
    }
}
declare namespace Paths {
    namespace ConfigureRepo {
        namespace Parameters {
            export type Id = number;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        export type RequestBody = Components.Schemas.RepositoryConfigInput;
        namespace Responses {
            export type $200 = Components.Schemas.RepositoryConfig;
            export type $400 = Components.Schemas.Error;
            export type $401 = Components.Schemas.Error;
            export type $404 = Components.Schemas.Error;
            export type $500 = Components.Schemas.Error;
        }
    }
    namespace GetRepo {
        namespace Parameters {
            export type Id = number;
        }
        export interface PathParameters {
            id: Parameters.Id;
        }
        namespace Responses {
            export type $200 = Components.Schemas.RepositoryConfig;
            export type $400 = Components.Schemas.Error;
            export type $401 = Components.Schemas.Error;
            export type $404 = Components.Schemas.Error;
            export type $500 = Components.Schemas.Error;
        }
    }
    namespace ListAvailableRepos {
        namespace Responses {
            export type $200 = Components.Schemas.ForgeRepository[];
            export type $401 = Components.Schemas.Error;
            export type $403 = Components.Schemas.Error;
            export type $500 = Components.Schemas.Error;
        }
    }
    namespace ListConfiguredRepos {
        namespace Responses {
            export type $200 = Components.Schemas.RepositoryConfig[];
            export type $401 = Components.Schemas.Error;
            export type $500 = Components.Schemas.Error;
        }
    }
}


export interface Operations {
  /**
   * GET /repos/available
   */
  ['listAvailableRepos']: {
    requestBody: any;
    params: UnknownParams;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, UnknownParams, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.ListAvailableRepos.Responses.$200 | Paths.ListAvailableRepos.Responses.$401 | Paths.ListAvailableRepos.Responses.$403 | Paths.ListAvailableRepos.Responses.$500;
  }
  /**
   * GET /repos/configured
   */
  ['listConfiguredRepos']: {
    requestBody: any;
    params: UnknownParams;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, UnknownParams, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.ListConfiguredRepos.Responses.$200 | Paths.ListConfiguredRepos.Responses.$401 | Paths.ListConfiguredRepos.Responses.$500;
  }
  /**
   * GET /repo/{id}
   */
  ['getRepo']: {
    requestBody: any;
    params: Paths.GetRepo.PathParameters;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, Paths.GetRepo.PathParameters, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.GetRepo.Responses.$200 | Paths.GetRepo.Responses.$400 | Paths.GetRepo.Responses.$401 | Paths.GetRepo.Responses.$404 | Paths.GetRepo.Responses.$500;
  }
  /**
   * PUT /repo/{id}
   */
  ['configureRepo']: {
    requestBody: Paths.ConfigureRepo.RequestBody;
    params: Paths.ConfigureRepo.PathParameters;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<Paths.ConfigureRepo.RequestBody, Paths.ConfigureRepo.PathParameters, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.ConfigureRepo.Responses.$200 | Paths.ConfigureRepo.Responses.$400 | Paths.ConfigureRepo.Responses.$401 | Paths.ConfigureRepo.Responses.$404 | Paths.ConfigureRepo.Responses.$500;
  }
}

export type OperationContext<operationId extends keyof Operations> = Operations[operationId]["context"];
export type OperationResponse<operationId extends keyof Operations> = Operations[operationId]["response"];
export type HandlerResponse<ResponseBody, ResponseModel = Record<string, any>> = ResponseModel & { _t?: ResponseBody };
export type OperationHandlerResponse<operationId extends keyof Operations> = HandlerResponse<OperationResponse<operationId>>;
export type OperationHandler<operationId extends keyof Operations, HandlerArgs extends unknown[] = unknown[]> = (...params: [OperationContext<operationId>, ...HandlerArgs]) => Promise<OperationHandlerResponse<operationId>>;


export type Error = Components.Schemas.Error;
export type ForgeRepository = Components.Schemas.ForgeRepository;
export type RepositoryConfig = Components.Schemas.RepositoryConfig;
export type RepositoryConfigInput = Components.Schemas.RepositoryConfigInput;
