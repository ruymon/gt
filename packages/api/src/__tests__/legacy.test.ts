import { describe, expect, it, vi } from 'vitest';

import * as api from '../index';
import {
  awaitJobs,
  createLegacyApiClient,
  LEGACY_API_VERSION,
  pollJobs,
} from '../legacy';
import { API_VERSION, createApiClient } from '../wrappers/client';

function captureRequests() {
  const requests: Request[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    requests.push(new Request(input));
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { fetchMock, requests };
}

describe('createLegacyApiClient', () => {
  it('sends 2026-03-06.v1 and gt-project-id, which createApiClient sends neither of', async () => {
    const legacy = captureRequests();
    const canonical = captureRequests();
    const config = {
      apiKey: 'api-key',
      baseUrl: 'https://example.com',
      projectId: 'project-id',
    };

    await createLegacyApiClient({ ...config, fetch: legacy.fetchMock }).get({
      url: '/test',
    });
    await createApiClient({ ...config, fetch: canonical.fetchMock }).get({
      url: '/test',
    });

    const [legacyRequest] = legacy.requests;
    const [canonicalRequest] = canonical.requests;
    expect(LEGACY_API_VERSION).toBe('2026-03-06.v1');
    expect(legacyRequest.headers.get('gt-api-version')).toBe('2026-03-06.v1');
    expect(legacyRequest.headers.get('gt-project-id')).toBe('project-id');
    expect(legacyRequest.headers.get('Authorization')).toBe('Bearer api-key');
    expect(canonicalRequest.headers.get('gt-api-version')).toBe(API_VERSION);
    expect(API_VERSION).not.toBe(LEGACY_API_VERSION);
    expect(canonicalRequest.headers.has('gt-project-id')).toBe(false);
  });

  it('is not exported from the package root', () => {
    expect(api).not.toHaveProperty('createLegacyApiClient');
    expect(api).not.toHaveProperty('LEGACY_API_VERSION');
    expect(api).not.toHaveProperty('getTranslationJobInfo');
  });
});

describe('awaitJobs', () => {
  it('polls the jobs endpoint through a configured client', async () => {
    let request: Request | undefined;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        request = new Request(input);
        return new Response(
          JSON.stringify([{ jobId: 'one', status: 'completed' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
    const client = createLegacyApiClient({
      baseUrl: 'https://example.com',
      fetch: fetchMock,
      retryPolicy: 'none',
    });

    const result = await awaitJobs(client, ['one']);

    expect(result).toEqual({
      complete: true,
      jobs: [{ jobId: 'one', status: 'completed' }],
    });
    expect(request?.url).toBe('https://example.com/v2/project/jobs/info');
  });
});

describe('pollJobs', () => {
  it('polls pending jobs until they reach terminal states', async () => {
    const getJobStatuses = vi
      .fn()
      .mockResolvedValueOnce([{ jobId: 'one', status: 'processing' }])
      .mockResolvedValueOnce([{ jobId: 'one', status: 'completed' }]);

    const result = await pollJobs(['one'], getJobStatuses, {
      pollingIntervalSeconds: 0,
    });

    expect(result).toEqual({
      complete: true,
      jobs: [{ jobId: 'one', status: 'completed' }],
    });
    expect(getJobStatuses).toHaveBeenCalledTimes(2);
  });

  it('waits for each status load before starting the next poll', async () => {
    let activeLoads = 0;
    let maxActiveLoads = 0;
    let pollCount = 0;
    const getJobStatuses = vi.fn(async () => {
      activeLoads += 1;
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      await Promise.resolve();
      activeLoads -= 1;
      pollCount += 1;
      return [
        {
          jobId: 'one',
          status:
            pollCount === 1 ? ('processing' as const) : ('completed' as const),
        },
      ];
    });

    await pollJobs(['one'], getJobStatuses, { pollingIntervalSeconds: 0 });

    expect(maxActiveLoads).toBe(1);
    expect(getJobStatuses).toHaveBeenCalledTimes(2);
  });

  it('reports each successful poll through the hook', async () => {
    const processing = [{ jobId: 'one', status: 'processing' as const }];
    const completed = [{ jobId: 'one', status: 'completed' as const }];
    const getJobStatuses = vi
      .fn()
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(completed);
    const onPoll = vi.fn();

    await pollJobs(['one'], getJobStatuses, {
      onPoll,
      pollingIntervalSeconds: 0,
    });

    expect(onPoll.mock.calls).toEqual([[processing], [completed]]);
  });

  it('reports incomplete unknown jobs when the deadline expires', async () => {
    const getJobStatuses = vi.fn();

    const result = await pollJobs(['one'], getJobStatuses, {
      timeoutSeconds: 0,
    });

    expect(result).toEqual({
      complete: false,
      jobs: [{ jobId: 'one', status: 'unknown' }],
    });
    expect(getJobStatuses).not.toHaveBeenCalled();
  });

  it('marks jobs missing from the response as unknown', async () => {
    const getJobStatuses = vi.fn().mockResolvedValue([]);

    const result = await pollJobs(['one'], getJobStatuses, {
      pollingIntervalSeconds: 0,
    });

    expect(result).toEqual({
      complete: true,
      jobs: [{ jobId: 'one', status: 'unknown' }],
    });
    expect(getJobStatuses).toHaveBeenCalledOnce();
  });

  it('propagates status-loader errors before the deadline', async () => {
    const getJobStatuses = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(pollJobs(['one'], getJobStatuses)).rejects.toThrow('boom');
  });

  it('completes immediately for an empty job list', async () => {
    const getJobStatuses = vi.fn();

    await expect(pollJobs([], getJobStatuses)).resolves.toEqual({
      complete: true,
      jobs: [],
    });
    expect(getJobStatuses).not.toHaveBeenCalled();
  });
});
