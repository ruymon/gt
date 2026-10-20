import type {
  PublishFilesData,
  PublishFilesResponse,
} from '@generaltranslation/api';

// Compatibility input: fileName is retained for published callers even though
// the generated request ignores it.
export type PublishFileEntry = PublishFilesData['body']['files'][number] & {
  fileName?: string;
};

export type PublishFileResult = PublishFilesResponse['results'][number] & {
  /** @deprecated Use `status === 'succeeded'` instead. */
  success: boolean;
};

export type PublishFilesResult = Omit<PublishFilesResponse, 'results'> & {
  results: PublishFileResult[];
};
