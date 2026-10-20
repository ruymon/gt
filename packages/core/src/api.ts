import { createApiClient as createCanonicalApiClient } from '@generaltranslation/api';
import type { ApiClientConfig, Client } from '@generaltranslation/api';
import {
  LEGACY_API_VERSION,
  getTranslationJobInfo,
  pollJobs,
} from '@generaltranslation/api/legacy';
import type { awaitJobs as awaitLegacyJobs } from '@generaltranslation/api/legacy';

export * from '@generaltranslation/api';
// 9.x signatures: explicit exports take precedence over `export *`.
export { pollJobs } from '@generaltranslation/api/legacy';
export type {
  AwaitJobsOptions,
  AwaitJobsResult,
  GetJobStatuses,
  JobResult,
} from '@generaltranslation/api/legacy';

// awaitJobs polls a 2026-03-06.v1 route, which needs the gt-project-id header
// that canonical clients no longer send.
const clientProjectIds = new WeakMap<object, string>();

export function createApiClient(config: ApiClientConfig): Client {
  const client = createCanonicalApiClient(config);
  if (config.projectId) clientProjectIds.set(client, config.projectId);
  return client;
}

/**
 * @deprecated 9.x job polling on the 2026-03-06.v1 contract; removed in the
 * next major. Polls on `client` with the legacy version and the project of
 * the `createApiClient` config that built it.
 */
export const awaitJobs: typeof awaitLegacyJobs = (client, jobIds, options) => {
  const projectId = clientProjectIds.get(client);
  return pollJobs(
    jobIds,
    async (pendingJobIds, signal) => {
      const result = await getTranslationJobInfo({
        body: { jobIds: pendingJobIds },
        client,
        headers: {
          'gt-api-version': LEGACY_API_VERSION,
          ...(projectId && { 'gt-project-id': projectId }),
        },
        signal,
        throwOnError: true,
      });
      return result.data;
    },
    options
  );
};
