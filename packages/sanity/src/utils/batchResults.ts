import type {
  UploadSourceFilesResponse,
  UploadTranslationsResponse,
} from 'generaltranslation/api';
import {
  createDiagnosticMessage,
  type DiagnosticSeverity,
} from 'generaltranslation/diagnostics';

// Source upload results carry no locale; translation upload results do.
type BatchItemResult = Pick<
  UploadSourceFilesResponse['results'][number],
  'fileId' | 'status' | 'error'
> &
  Partial<Pick<UploadTranslationsResponse['results'][number], 'locale'>>;

/** Items the API saved; a successful batch write can still fail individual items. */
export function succeededResults<Result extends BatchItemResult>(response: {
  results: Result[];
}): Result[] {
  return response.results.filter((result) => result.status === 'succeeded');
}

/** Documents whose source upload succeeded; a missing source fails a whole translation upload. */
export function filterUploadedDocuments<
  Document extends { info: { documentId: string } },
>(
  documents: Document[],
  uploadResult: { results: BatchItemResult[] }
): Document[] {
  const uploadedFileIds = new Set(
    succeededResults(uploadResult).map(({ fileId }) => fileId)
  );
  return documents.filter(({ info }) => uploadedFileIds.has(info.documentId));
}

export function failedResultsDiagnostic(
  whatHappened: string,
  response: { results: BatchItemResult[] },
  severity: DiagnosticSeverity
): string {
  return createDiagnosticMessage({
    source: 'gt-sanity',
    severity,
    whatHappened,
    details: response.results
      .filter((result) => result.status === 'failed')
      .map(
        ({ fileId, locale, error }) =>
          `${fileId}${locale ? ` (${locale})` : ''}: ${error ?? 'no reason given'}`
      ),
  });
}
