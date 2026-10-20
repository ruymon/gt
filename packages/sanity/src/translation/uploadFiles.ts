import type { GTFile, Secrets } from '../types';
import { api, gt, overrideConfig } from '../adapter/core';
import { libraryDefaultLocale } from 'generaltranslation/internal';
import type { SerializedDocument } from '../serialization/types';
import { resolveFileName } from '../utils/fileNames';
import { failedResultsDiagnostic } from '../utils/batchResults';
import { syncProjectDefaultLocale } from '../adapter/syncProjectDefaultLocale';

// note: this function is used to create a new translation task
// uploads files & calls the getTranslationTask function
export async function uploadFiles(
  documents: {
    info: GTFile;
    serializedDocument: SerializedDocument;
  }[],
  secrets: Secrets | null
): Promise<Awaited<ReturnType<typeof api.uploadSourceFiles>>> {
  overrideConfig(secrets);
  const uploadResult = await api.uploadSourceFiles(
    documents.map(({ info, serializedDocument }) => ({
      source: {
        content: serializedDocument.content,
        fileName: resolveFileName(info),
        fileId: info.documentId,
        fileFormat: 'HTML',
        locale: gt.sourceLocale || libraryDefaultLocale,
        versionId: info.versionId || undefined,
      },
    })),
    {
      sourceLocale: gt.sourceLocale || libraryDefaultLocale,
    }
  );
  if (uploadResult.summary.failed > 0) {
    console.warn(
      failedResultsDiagnostic(
        'Some documents could not be uploaded to General Translation and were skipped',
        uploadResult,
        'Warning'
      )
    );
  }
  if (uploadResult.summary.succeeded > 0) {
    await syncProjectDefaultLocale(gt.sourceLocale || libraryDefaultLocale);
  }
  return uploadResult;
}
