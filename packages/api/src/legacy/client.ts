import type { Client } from './generated/client';
import type { ApiVersion as LegacyApiVersion } from './generated/types.gen';
import { createTransportClient } from '../wrappers/client';
import type { ApiClientConfig } from '../wrappers/client';

/** @deprecated The 2026-03-06.v1 contract of 9.x's deprecated methods; removed in the next major. */
export const LEGACY_API_VERSION = '2026-03-06.v1' satisfies LegacyApiVersion;

/** @deprecated Removed in the next major. */
export type LegacyApiClientConfig = Omit<ApiClientConfig, 'apiVersion'>;

/**
 * @deprecated A client pinned to `LEGACY_API_VERSION` that targets
 * `config.projectId` through `gt-project-id`, like 9.x's `createApiClient`.
 * Removed in the next major.
 */
export function createLegacyApiClient(config: LegacyApiClientConfig): Client {
  const headers = new Headers({ 'gt-api-version': LEGACY_API_VERSION });
  if (config.projectId) headers.set('gt-project-id', config.projectId);
  return createTransportClient(config, headers);
}
