// Internal: the 2026-03-06.v1 client behind 9.x's deprecated methods; removed in the next major.
export { awaitJobs, pollJobs } from './legacy/awaitJobs';
export type {
  AwaitJobsOptions,
  AwaitJobsResult,
  GetJobStatuses,
  JobResult,
} from './legacy/awaitJobs';
export { LEGACY_API_VERSION, createLegacyApiClient } from './legacy/client';
export type { LegacyApiClientConfig } from './legacy/client';
export * from './legacy/generated';
export type { Client } from './legacy/generated/client';
