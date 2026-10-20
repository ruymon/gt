import { describe, expect, it } from 'vitest';
import { filterUploadedDocuments } from '../batchResults';

describe('filterUploadedDocuments', () => {
  it('keeps only the documents whose source upload succeeded', () => {
    const documents = ['saved', 'failed'].map((documentId) => ({
      info: { documentId, versionId: `${documentId}-rev` },
      translations: [{ locale: 'fr', content: `<p>${documentId}</p>` }],
    }));

    const result = filterUploadedDocuments(documents, {
      results: [
        { fileId: 'saved', status: 'succeeded' },
        { fileId: 'failed', status: 'failed', error: 'not saved' },
      ],
    });

    expect(result).toEqual([documents[0]]);
  });
});
