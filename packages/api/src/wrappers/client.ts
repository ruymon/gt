import {
  createClient as createGeneratedClient,
  mergeHeaders,
} from '../generated/client';
import type { Client } from '../generated/client';
import type { ApiVersion } from '../generated/types.gen';
import { ApiError } from './errors';
import { createRetryingFetch, createTimeoutFetch } from './transport';
import type { RetryPolicy } from './transport';

export type { ApiVersion };

export const API_VERSION = '2026-10-08.v1' satisfies ApiVersion;

export type UserTokenProvider = {
  getAccessToken: () => Promise<string>;
  refreshAccessToken: () => Promise<string | undefined>;
};

export type ApiClientConfig = {
  apiKey?: string;
  apiVersion?: ApiVersion;
  baseUrl: string;
  fetch?: typeof fetch;
  /**
   * Sent as `gt-project-id` only to the header-targeted plugin operations
   * (`pluginInfo`, `pluginEnqueue`, …), which an organization API key needs;
   * a per-call `gt-project-id` header wins. Project-scoped operations take
   * `path.projectId`.
   */
  projectId?: string;
  retryPolicy?: RetryPolicy;
  /** Set to false when a custom fetch implementation owns request timeouts. */
  timeoutMs?: number | false;
  userTokenProvider?: UserTokenProvider;
};

/** Attaches the user's bearer token and retries once with a refreshed token after a 401. */
function createUserTokenFetch(
  fetchImplementation: typeof fetch,
  provider: UserTokenProvider
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.headers.has('Authorization'))
      return fetchImplementation(request);
    request.headers.set(
      'Authorization',
      `Bearer ${await provider.getAccessToken()}`
    );

    const response = await fetchImplementation(request.clone());
    if (response.status !== 401) return response;

    const refreshedAccessToken = await provider.refreshAccessToken();
    if (!refreshedAccessToken) return response;
    await response.body?.cancel();
    request.headers.set('Authorization', `Bearer ${refreshedAccessToken}`);
    return fetchImplementation(request);
  };
}

/**
 * The `gt-api-version` a client sends. Generated operations that require the
 * header take it per call, and per-call headers override the client's, so
 * passing this keeps `ApiClientConfig.apiVersion` in effect.
 */
export function getClientApiVersion(client: Client): ApiVersion {
  const apiVersion = mergeHeaders(client.getConfig().headers).get(
    'gt-api-version'
  );
  // createApiClient only ever sets an ApiVersion here.
  return (apiVersion ?? API_VERSION) as ApiVersion;
}

export function createApiClient(config: ApiClientConfig): Client {
  const client = createTransportClient(
    config,
    new Headers({ 'gt-api-version': config.apiVersion ?? API_VERSION })
  );
  const { projectId } = config;
  if (projectId) {
    client.interceptors.request.use((request) => {
      if (
        new URL(request.url).pathname.includes('/v1/integrations/plugins/') &&
        !request.headers.has('gt-project-id')
      ) {
        request.headers.set('gt-project-id', projectId);
      }
      return request;
    });
  }
  return client;
}

/** The generated client with auth, retry, timeout, and user-token refresh; shared with the legacy client. */
export function createTransportClient(
  config: Omit<ApiClientConfig, 'apiVersion' | 'projectId'>,
  headers: Headers
): Client {
  if (config.apiKey) headers.set('Authorization', `Bearer ${config.apiKey}`);

  const transportFetch = createRetryingFetch({
    // Timeout applies per attempt, inside the retry loop.
    fetch: createTimeoutFetch({
      fetch: config.fetch,
      timeoutMs: config.timeoutMs,
    }),
    retryPolicy: config.retryPolicy,
  });

  const client = createGeneratedClient({
    baseUrl: config.baseUrl,
    fetch:
      config.apiKey || !config.userTokenProvider
        ? transportFetch
        : createUserTokenFetch(transportFetch, config.userTokenProvider),
    headers,
  });
  // Only thrown errors change; `{ data, error }` results keep the decoded body.
  // `response` is undefined when fetch itself throws (timeout, abort, network).
  client.interceptors.error.use((error, response, _request, options) =>
    options.throwOnError && response
      ? ApiError.fromResponse(error, response)
      : error
  );
  return client;
}
