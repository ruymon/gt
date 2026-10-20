// The plugin calls only GT methods that are not deprecated, so translating
// logs no deprecation warning.
import { GT } from 'generaltranslation';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { translateDocument } from '../translation';
import { createTestPayload } from './support/createTestPayload';
import { FakeGt } from './support/fakeGt';
import { createPage } from './support/fixtures';

let payload: Payload;

beforeAll(async () => {
  payload = await createTestPayload();
});

afterAll(async () => {
  await payload.destroy();
});

describe('GT deprecations', () => {
  it('translating a document logs no deprecation warning', async () => {
    const page = await createPage(payload);
    const gt = new GT({
      projectId: 'project',
      apiKey: 'key',
      sourceLocale: 'en',
    });
    // The real GT methods run against the fake in place of the API.
    vi.spyOn(
      gt as unknown as { _getApiAdapter: () => unknown },
      '_getApiAdapter'
    ).mockReturnValue(new FakeGt());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deprecations = () =>
      warn.mock.calls.filter((args) => String(args[0]).includes('deprecated'));

    const result = await translateDocument({
      payload,
      gt,
      target: { collection: 'pages', id: page.id },
      locales: ['es'],
    });

    expect(deprecations()).toEqual([]);
    expect(result.locales.es).toMatchObject({ status: 'applied' });
    // A deprecated method does warn here.
    await gt.checkJobStatus([]).catch(() => undefined);
    expect(deprecations()).toHaveLength(1);
    warn.mockRestore();
  });
});
