import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from 'generaltranslation/errors';
import { api } from '../../adapter/core';
import type { GTFile } from '../../types';
import { uploadFiles } from '../uploadFiles';

vi.mock('../../adapter/core', () => ({
  api: {
    uploadSourceFiles: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
  },
  gt: { sourceLocale: 'en' },
  overrideConfig: vi.fn(),
}));

const document = {
  info: { documentId: 'doc-1', versionId: 'rev-1' } as GTFile,
  serializedDocument: { content: '<p>Hi</p>' },
} as Parameters<typeof uploadFiles>[0][number];

function uploadResult(status: 'succeeded' | 'failed') {
  return {
    summary: {
      total: 1,
      succeeded: status === 'succeeded' ? 1 : 0,
      failed: status === 'failed' ? 1 : 0,
    },
    results: [
      {
        branchId: 'branch-1',
        fileId: 'doc-1',
        versionId: 'rev-1',
        fileName: 'sanity/doc-1',
        fileFormat: 'HTML',
        status,
      },
    ],
  } as Awaited<ReturnType<typeof api.uploadSourceFiles>>;
}

describe('uploadFiles project default locale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('sets the project default locale when it differs from the source locale', async () => {
    vi.mocked(api.uploadSourceFiles).mockResolvedValue(
      uploadResult('succeeded')
    );
    vi.mocked(api.getProject).mockResolvedValue({
      defaultLocale: 'fr',
    } as Awaited<ReturnType<typeof api.getProject>>);

    await uploadFiles([document], null);

    expect(api.updateProject).toHaveBeenCalledWith({ defaultLocale: 'en' });
  });

  it('leaves the project alone when its default locale already matches', async () => {
    vi.mocked(api.uploadSourceFiles).mockResolvedValue(
      uploadResult('succeeded')
    );
    vi.mocked(api.getProject).mockResolvedValue({
      defaultLocale: 'en',
    } as Awaited<ReturnType<typeof api.getProject>>);

    await uploadFiles([document], null);

    expect(api.getProject).toHaveBeenCalledTimes(1);
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('warns and keeps the upload when the key cannot update the project', async () => {
    const result = uploadResult('succeeded');
    vi.mocked(api.uploadSourceFiles).mockResolvedValue(result);
    vi.mocked(api.getProject).mockResolvedValue({
      defaultLocale: 'fr',
    } as Awaited<ReturnType<typeof api.getProject>>);
    vi.mocked(api.updateProject).mockRejectedValueOnce(
      new ApiError('Forbidden', 403, 'Forbidden')
    );

    await expect(uploadFiles([document], null)).resolves.toBe(result);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("project's default locale was not updated")
    );
  });

  it('propagates other project update errors', async () => {
    vi.mocked(api.uploadSourceFiles).mockResolvedValue(
      uploadResult('succeeded')
    );
    vi.mocked(api.getProject).mockResolvedValue({
      defaultLocale: 'fr',
    } as Awaited<ReturnType<typeof api.getProject>>);
    vi.mocked(api.updateProject).mockRejectedValueOnce(
      new ApiError('Server error', 500, 'Server error')
    );

    await expect(uploadFiles([document], null)).rejects.toThrow('Server error');
  });

  it('leaves the project alone when no document was saved', async () => {
    vi.mocked(api.uploadSourceFiles).mockResolvedValue(uploadResult('failed'));

    await uploadFiles([document], null);

    expect(api.getProject).not.toHaveBeenCalled();
    expect(api.updateProject).not.toHaveBeenCalled();
  });
});
