import { describe, expect, it, vi } from 'vitest';
import { API_VERSION } from '@generaltranslation/api';
import { LEGACY_API_VERSION } from '@generaltranslation/api/legacy';
import { GT } from '../index';
import { gtInstanceLogger } from '../logging/logger';

const warn = vi.spyOn(gtInstanceLogger, 'warn');

const project = {
  id: 'p',
  name: 'Project',
  orgId: 'org',
  defaultLocale: 'en',
  currentLocales: ['es'],
  autoApprove: true,
  cdnEnabled: false,
};
const branch = { id: 'b', name: 'main', isDefault: true };
const branchFile = { fileId: 'f', versionId: 'v', fileName: 'f.json' };
const ids = { fileId: 'f', versionId: 'v', branchId: 'b' };
const tag = {
  id: 'tag',
  tagId: 'release',
  message: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const job = {
  id: 'job',
  status: 'queued',
  subject: { type: 'file_translation', ...ids, locale: 'es' },
};
const sourceFile = {
  ...ids,
  fileName: 'f.json',
  fileFormat: 'JSON',
  dataFormat: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  publishedAt: null,
  locales: ['es'],
  sourceLocale: 'en',
};
const fileStatus = {
  translations: [
    {
      locale: 'es',
      completedAt: null,
      approvedAt: null,
      publishedAt: null,
      createdAt: null,
      updatedAt: null,
    },
  ],
  sourceFile: { ...sourceFile, id: 'row' },
};
const content = {
  ...ids,
  locale: 'es',
  fileName: 'f.json',
  data: Buffer.from('hello').toString('base64'),
  fileFormat: 'JSON',
};
const decodedContent = { ...content, data: 'hello', metadata: {} };
const uploaded = { ...ids, fileName: 'f.json', fileFormat: 'JSON' };
const asset = { id: 'asset', assetKey: 'key', fileName: 'font.woff2' };
const legacyProject = {
  id: 'p',
  name: 'Project',
  orgId: 'org',
  defaultLocale: 'en',
  currentLocales: ['es'],
  autoApprove: true,
};
const legacyBranch = { id: 'b', name: 'main' };
const legacyContent = { ...content, id: 'row', metadata: {} };
const legacyJobData = {
  job: { sourceFileId: 'f', ...ids, targetLocale: 'es', projectId: 'p' },
};

function succeeded<T>(results: T[]) {
  return {
    summary: { total: results.length, succeeded: results.length, failed: 0 },
    results,
  };
}

const routes: Record<string, unknown> = {
  'GET /v2/projects/p': project,
  'PATCH /v2/projects/p': { ...project, cdnEnabled: true },
  'GET /v2/projects/p/branches': { items: [branch], nextCursor: null },
  'POST /v2/projects/p/branches': { branch },
  'PATCH /v2/projects/p/branches/b': branch,
  'GET /v2/projects/p/branches/b/files': {
    items: [branchFile],
    nextCursor: null,
  },
  'POST /v2/projects/p/files/move': succeeded([
    { oldFileId: 'a', newFileId: 'f', status: 'succeeded' },
  ]),
  'POST /v2/projects/p/context/generate': { job: null },
  'POST /v2/projects/p/jobs/query': {
    results: [{ id: 'job', status: 'not_found' }],
  },
  'GET /v2/projects/p/jobs/job': { ...job, error: null },
  'POST /v2/projects/p/files/translate': { jobs: [job] },
  'PUT /v2/projects/p/tags/release': { created: true, tag },
  'POST /v2/projects/p/files/publish': succeeded([
    {
      ...ids,
      status: 'succeeded',
      translations: [{ locale: 'es', status: 'succeeded' }],
    },
  ]),
  'POST /v2/projects/p/files/translations/overwrite': succeeded([
    { ...ids, locale: 'es', status: 'succeeded' },
  ]),
  'POST /v2/projects/p/files/query': {
    results: [{ ...sourceFile, status: 'found' }],
  },
  'GET /v2/projects/p/files/f/status': fileStatus,
  'GET /v2/projects/p/files/f/content': { ...content, status: 'ready' },
  'POST /v2/projects/p/files/content/query': {
    results: [{ ...content, status: 'ready' }],
  },
  'POST /v2/orgs/org/assets': succeeded([{ ...asset, status: 'succeeded' }]),
  'POST /v2/projects/p/files': succeeded([
    { ...uploaded, status: 'succeeded' },
  ]),
  'POST /v2/projects/p/files/translations': succeeded([
    { ...uploaded, locale: 'es', status: 'succeeded' },
  ]),
  // Legacy routes (2026-03-06.v1) behind the deprecated methods.
  'GET /v2/project/info/p': legacyProject,
  'POST /v2/project/branches/info': {
    branches: [legacyBranch],
    defaultBranch: legacyBranch,
  },
  'POST /v2/project/branches/create': { branch: legacyBranch },
  'POST /v2/project/files/moves': {
    results: [{ oldFileId: 'a', newFileId: 'f', success: true }],
  },
  'POST /v2/project/files/orphaned': { orphanedFiles: [branchFile] },
  'POST /v2/project/setup/generate': { status: 'completed' },
  'POST /v2/project/jobs/info': [{ jobId: 'job', status: 'unknown' }],
  'POST /v2/project/translations/enqueue': {
    jobData: legacyJobData,
    locales: ['es'],
    message: 'Enqueued',
  },
  'POST /v2/project/tags/create': { tag },
  'POST /v2/project/files/diffs': {
    filesProcessed: 1,
    entriesReceived: 1,
    message: 'ok',
  },
  'POST /v2/project/files/info': {
    sourceFiles: [sourceFile],
    translatedFiles: [],
  },
  'GET /v2/project/translations/files/status/f': fileStatus,
  'POST /v2/project/files/download': { files: [legacyContent], count: 1 },
  'POST /v2/project/assets': { assets: [asset] },
};

const requests: Request[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const route = `${request.method} ${new URL(request.url).pathname}`;
    return route in routes
      ? Response.json(routes[route])
      : Response.json({ error: `No route ${route}` }, { status: 404 });
  })
);

const gt = new GT({
  apiKey: 'key',
  projectId: 'p',
  baseUrl: 'https://api.example.com',
  sourceLocale: 'en',
  targetLocale: 'es',
});

function warningsFor(deprecated: string): number {
  return warn.mock.calls.filter(([message]) =>
    message.includes(`\`${deprecated}\``)
  ).length;
}

describe.sequential('GT canonical API methods', () => {
  it('return canonical shapes from canonical routes without deprecation warnings', async () => {
    const warningsBefore = warn.mock.calls.length;

    await expect(gt.getProject()).resolves.toEqual(project);
    await expect(gt.updateProject({ cdnEnabled: true })).resolves.toEqual({
      ...project,
      cdnEnabled: true,
    });
    await expect(gt.listBranches({ isDefault: 'true' })).resolves.toEqual({
      items: [branch],
      nextCursor: null,
    });
    await expect(gt.createBranch({ name: 'main' })).resolves.toEqual({
      branch,
    });
    await expect(gt.updateBranch('b', { isDefault: true })).resolves.toEqual(
      branch
    );
    await expect(gt.listBranchFiles('b')).resolves.toEqual({
      items: [branchFile],
      nextCursor: null,
    });
    await expect(
      gt.moveFiles([{ oldFileId: 'a', newFileId: 'f', newFileName: 'f.json' }])
    ).resolves.toEqual(routes['POST /v2/projects/p/files/move']);
    await expect(gt.generateProjectContext([ids])).resolves.toEqual({
      job: null,
    });
    await expect(gt.queryJobs(['job'])).resolves.toEqual({
      results: [{ id: 'job', status: 'not_found' }],
    });
    await expect(gt.getJob('job')).resolves.toEqual({ ...job, error: null });
    await expect(gt.translateFiles([ids])).resolves.toEqual({ jobs: [job] });
    await expect(gt.setTag('release', { files: [ids] })).resolves.toEqual({
      created: true,
      tag,
    });
    await expect(
      gt.overwriteTranslations([
        { ...ids, locale: 'es', diff: '@@', localContent: '{}' },
      ])
    ).resolves.toEqual(
      routes['POST /v2/projects/p/files/translations/overwrite']
    );
    await expect(gt.queryFiles([ids])).resolves.toEqual({
      results: [{ ...sourceFile, status: 'found' }],
    });
    await expect(gt.getFileStatus('f')).resolves.toEqual(fileStatus);
    await expect(gt.getFileContent('f', { locale: 'es' })).resolves.toEqual({
      ...decodedContent,
      metadata: undefined,
      status: 'ready',
    });
    await expect(
      gt.queryFilesContent([{ ...ids, locale: 'es' }])
    ).resolves.toEqual({
      results: [{ ...decodedContent, metadata: undefined, status: 'ready' }],
    });
    await expect(
      gt.upsertAssets([
        { assetType: 'FONT', content: 'x', fileName: 'font.woff2' },
      ])
    ).resolves.toEqual(succeeded([{ ...asset, status: 'succeeded' }]));

    expect(warn.mock.calls.length).toBe(warningsBefore);
  });

  it('return superset results from the colliding method names', async () => {
    const file = {
      ...ids,
      content: '{}',
      fileName: 'f.json',
      fileFormat: 'JSON' as const,
      locale: 'en',
    };

    await expect(
      gt.uploadSourceFiles([{ source: file }], { sourceLocale: 'en' })
    ).resolves.toEqual({
      ...succeeded([{ ...uploaded, status: 'succeeded' }]),
      uploadedFiles: [{ ...uploaded, locale: 'en' }],
      count: 1,
      message: 'Successfully uploaded 1 files in 1 batch(es)',
    });
    await expect(
      gt.uploadTranslations(
        [{ source: file, translations: [{ ...file, locale: 'es' }] }],
        { sourceLocale: 'en' }
      )
    ).resolves.toEqual({
      ...succeeded([{ ...uploaded, locale: 'es', status: 'succeeded' }]),
      uploadedFiles: [{ ...uploaded, locale: 'es' }],
      count: 1,
      message: 'Successfully uploaded 1 files in 1 batch(es)',
    });
    await expect(gt.publishFiles([{ ...ids, publish: true }])).resolves.toEqual(
      succeeded([
        {
          ...ids,
          status: 'succeeded',
          success: true,
          translations: [{ locale: 'es', status: 'succeeded' }],
        },
      ])
    );
  });

  it.each([
    ['getProjectInfo', () => gt.getProjectInfo(), legacyProject, []],
    [
      'getProjectData',
      () => gt.getProjectData('p'),
      legacyProject,
      ['autoApprove'],
    ],
  ] as const)(
    '%s returns the legacy project from the legacy route and warns once',
    async (name, call, expected, stripped) => {
      const legacy = Object.fromEntries(
        Object.entries(expected).filter(
          ([key]) => !(stripped as readonly string[]).includes(key)
        )
      );
      await expect(call()).resolves.toEqual(legacy);
      await expect(call()).resolves.toEqual(legacy);
      expect(warningsFor(`GT.${name}()`)).toBe(1);
    }
  );

  it.each([
    [
      'queryBranchData',
      () => gt.queryBranchData({ branchNames: ['main'] }),
      { branches: [legacyBranch], defaultBranch: legacyBranch },
    ],
    [
      'processFileMoves',
      () =>
        gt.processFileMoves([
          { oldFileId: 'a', newFileId: 'f', newFileName: 'f.json' },
        ]),
      {
        summary: { total: 1, succeeded: 1, failed: 0 },
        results: [{ oldFileId: 'a', newFileId: 'f', success: true }],
      },
    ],
    [
      'getOrphanedFiles',
      () => gt.getOrphanedFiles('b', []),
      { orphanedFiles: [branchFile] },
    ],
    ['setupProject', () => gt.setupProject([ids]), { status: 'completed' }],
    [
      'checkJobStatus',
      () => gt.checkJobStatus(['job']),
      [{ jobId: 'job', status: 'unknown' }],
    ],
    [
      'enqueueFiles',
      () =>
        gt.enqueueFiles([ids], { targetLocales: ['es'], sourceLocale: 'en' }),
      {
        jobData: legacyJobData,
        locales: ['es'],
        message: 'Successfully enqueued 1 file translation jobs in 1 batch(es)',
      },
    ],
    [
      'createTag',
      () => gt.createTag({ tagId: 'release', files: [ids] }),
      { tag },
    ],
    [
      'submitUserEditDiffs',
      () =>
        gt.submitUserEditDiffs({
          diffs: [
            {
              ...ids,
              fileName: 'f.json',
              locale: 'es',
              diff: '@@',
              localContent: '{}',
            },
          ],
        }),
      undefined,
    ],
    [
      'queryFileData',
      () => gt.queryFileData({ sourceFiles: [ids] }),
      { sourceFiles: [sourceFile], translatedFiles: [] },
    ],
    ['querySourceFile', () => gt.querySourceFile({ fileId: 'f' }), fileStatus],
    [
      'downloadFile',
      () => gt.downloadFile({ fileId: 'f', locale: 'es' }),
      'hello',
    ],
    [
      'downloadFileBatch',
      () => gt.downloadFileBatch([{ fileId: 'f', locale: 'es' }]),
      { files: [{ ...legacyContent, data: 'hello' }], count: 1 },
    ],
    [
      'uploadFonts',
      () =>
        gt.uploadFonts([
          { assetType: 'FONT', content: 'x', fileName: 'font.woff2' },
        ]),
      { assets: [asset], count: 1 },
    ],
  ] as const)(
    '%s returns the legacy route result and warns once',
    async (name, call, expected) => {
      await expect(call()).resolves.toEqual(expected);
      await expect(call()).resolves.toEqual(expected);
      expect(warningsFor(`GT.${name}()`)).toBe(1);
    }
  );

  it('queryFiles and queryFilesContent send selectors that normalize alike once and answer each with its requested locale', async () => {
    const warningsBefore = warn.mock.calls.length;
    const files = [
      { fileId: 'f', locale: 'es' },
      { fileId: 'f', locale: 'ES' },
    ];

    await expect(gt.queryFilesContent(files)).resolves.toEqual({
      results: [
        { ...decodedContent, metadata: undefined, status: 'ready' },
        {
          ...decodedContent,
          metadata: undefined,
          status: 'ready',
          locale: 'ES',
        },
      ],
    });
    const contentQuery = requests.findLast((request) =>
      request.url.endsWith('/files/content/query')
    );
    expect(await contentQuery!.json()).toEqual({
      files: [{ fileId: 'f', locale: 'es' }],
    });

    const { results } = await gt.queryFiles(files);
    expect(results).toHaveLength(2);
    const fileQuery = requests.findLast((request) =>
      request.url.endsWith('/files/query')
    );
    expect(await fileQuery!.json()).toEqual({
      files: [{ fileId: 'f', locale: 'es' }],
    });
    expect(warn.mock.calls.length).toBe(warningsBefore);
  });

  it('sends the deprecated createBranch input to the legacy route and warns once per field', async () => {
    const legacyQuery = { branchName: 'main', defaultBranch: true };
    await expect(gt.createBranch(legacyQuery)).resolves.toEqual({
      branch: legacyBranch,
    });
    await gt.createBranch(legacyQuery);
    expect(warningsFor('GT.createBranch({ branchName })')).toBe(1);
    expect(warningsFor('GT.createBranch({ defaultBranch })')).toBe(1);
    const create = requests.findLast((request) =>
      request.url.endsWith('/v2/project/branches/create')
    );
    expect(await create!.json()).toEqual(legacyQuery);
  });

  it('sends canonical routes the pinned version and legacy routes the legacy version with gt-project-id', () => {
    const isLegacy = (request: Request) =>
      new URL(request.url).pathname.startsWith('/v2/project/');
    expect(requests.filter(isLegacy).length).toBeGreaterThan(0);
    for (const request of requests) {
      const { pathname } = new URL(request.url);
      if (isLegacy(request)) {
        expect(request.headers.get('gt-api-version')).toBe(LEGACY_API_VERSION);
        expect(request.headers.get('gt-project-id')).toBe('p');
        continue;
      }
      expect(pathname).toMatch(/^\/v2\/(projects\/p|orgs\/org)(\/|$)/);
      expect(request.headers.get('gt-api-version')).toBe(API_VERSION);
      expect(request.headers.has('gt-project-id')).toBe(false);
    }
  });
});
