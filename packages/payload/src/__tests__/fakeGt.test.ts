// The fake's queryFilesContent follows GT's content contract, so tests built on
// it see the same ready / pending / not_found answers a real project gives.
import { describe, expect, it } from 'vitest';
import { FakeGt } from './support/fakeGt';

const html = (text: string) => `<p data-gt-key="k">${text}</p>`;

async function upload(gt: FakeGt, content: string) {
  const { results } = await gt.uploadSourceFiles(
    [
      {
        source: {
          fileId: 'doc',
          fileName: 'doc.html',
          fileFormat: 'HTML',
          content,
          locale: 'en',
        },
      },
    ],
    { sourceLocale: 'en' }
  );
  return results[0].versionId;
}

async function translate(gt: FakeGt, versionId: string) {
  const { jobs } = await gt.translateFiles([{ fileId: 'doc', versionId }], {
    targetLocales: ['es'],
  });
  return jobs.map((job) => job.id);
}

describe('FakeGt.queryFilesContent', () => {
  it('reports a translation never requested as not_found', async () => {
    const gt = new FakeGt();
    const versionId = await upload(gt, html('hello'));

    const { results } = await gt.queryFilesContent([
      { fileId: 'doc', locale: 'es' },
      { fileId: 'doc', versionId, locale: 'es' },
    ]);

    expect(results.map((r) => r.status)).toEqual(['not_found', 'not_found']);
  });

  it('reports pending only while a translation job is unfinished', async () => {
    const gt = new FakeGt();
    const versionId = await upload(gt, html('hello'));
    const jobIds = await translate(gt, versionId);

    const before = await gt.queryFilesContent([
      { fileId: 'doc', locale: 'es' },
      { fileId: 'doc', versionId, locale: 'es' },
    ]);
    await gt.queryJobs(jobIds);
    const after = await gt.queryFilesContent([{ fileId: 'doc', locale: 'es' }]);

    expect(before.results).toEqual([
      expect.objectContaining({ status: 'pending', versionId, data: null }),
      expect.objectContaining({ status: 'pending', versionId, data: null }),
    ]);
    expect(after.results).toEqual([
      expect.objectContaining({ status: 'ready', versionId }),
    ]);
  });

  it('reads an unversioned translation from the newest completed version', async () => {
    const gt = new FakeGt();
    const first = await upload(gt, html('hello'));
    await gt.queryJobs(await translate(gt, first));
    const second = await upload(gt, html('goodbye'));

    const { results } = await gt.queryFilesContent([
      { fileId: 'doc', locale: 'es' },
      { fileId: 'doc', versionId: second, locale: 'es' },
    ]);

    expect(second).not.toBe(first);
    expect(results).toEqual([
      expect.objectContaining({
        status: 'ready',
        versionId: first,
        data: expect.stringContaining(html('HELLO')),
      }),
      expect.objectContaining({ status: 'not_found' }),
    ]);
  });
});
