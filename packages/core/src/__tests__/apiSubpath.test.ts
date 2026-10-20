import { describe, expect, it, vi } from 'vitest';
import * as legacy from '@generaltranslation/api/legacy';
import * as api from '../api';

describe('generaltranslation/api', () => {
  it('keeps the 9.x awaitJobs and pollJobs next to the canonical SDK', async () => {
    expect(api.pollJobs).toBe(legacy.pollJobs);
    expect(api.getProject).toBeTypeOf('function');
    expect(api.queryJobsInBatches).toBeTypeOf('function');

    await expect(
      api.pollJobs(['done', 'missing'], async () => [
        { jobId: 'done', status: 'completed' },
      ])
    ).resolves.toEqual({
      complete: true,
      jobs: [
        { jobId: 'done', status: 'completed' },
        { jobId: 'missing', status: 'unknown' },
      ],
    });
  });

  it("polls 9.x awaitJobs on the legacy route with createApiClient's project, leaving canonical requests alone", async () => {
    const requests: Request[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        requests.push(new Request(input, init));
        const body = new URL(requests.at(-1)!.url).pathname.endsWith(
          '/jobs/info'
        )
          ? [{ jobId: 'job-id', status: 'completed' }]
          : { id: 'project-id' };
        return Response.json(body);
      });
    // An organization key has no bound project, so the configured projectId targets it.
    const client = api.createApiClient({
      apiKey: 'org-api-key',
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
      projectId: 'project-id',
      retryPolicy: 'none',
    });

    await expect(api.awaitJobs(client, ['job-id'])).resolves.toEqual({
      complete: true,
      jobs: [{ jobId: 'job-id', status: 'completed' }],
    });
    await api.getProject({ client, path: { projectId: 'project-id' } });

    const [legacyRequest, canonicalRequest] = requests;
    expect(new URL(legacyRequest.url).pathname).toBe('/v2/project/jobs/info');
    expect(legacyRequest.headers.get('gt-api-version')).toBe(
      legacy.LEGACY_API_VERSION
    );
    expect(legacyRequest.headers.get('gt-project-id')).toBe('project-id');
    expect(legacyRequest.headers.get('authorization')).toBe(
      'Bearer org-api-key'
    );
    expect(new URL(canonicalRequest.url).pathname).toBe(
      '/v2/projects/project-id'
    );
    expect(canonicalRequest.headers.get('gt-api-version')).toBe(
      api.API_VERSION
    );
    expect(canonicalRequest.headers.has('gt-project-id')).toBe(false);
  });

  it("polls 9.x awaitJobs on the caller's client, with its later auth and interceptors", async () => {
    const requests: Request[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json([{ jobId: 'job-id', status: 'completed' }]);
      });
    const client = api.createApiClient({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
      projectId: 'project-id',
      retryPolicy: 'none',
    });
    client.setConfig({ auth: 'rotated-api-key' });
    client.interceptors.request.use((request) => {
      request.headers.set('x-trace-id', 'trace-id');
      return request;
    });

    await api.awaitJobs(client, ['job-id']);

    const [request] = requests;
    expect(new URL(request.url).pathname).toBe('/v2/project/jobs/info');
    expect(request.headers.get('authorization')).toBe('Bearer rotated-api-key');
    expect(request.headers.get('x-trace-id')).toBe('trace-id');
    expect(request.headers.get('gt-api-version')).toBe(
      legacy.LEGACY_API_VERSION
    );
    expect(request.headers.get('gt-project-id')).toBe('project-id');
  });
});
