import type {
  ApiClientConfig,
  GetFileStatusData,
} from 'generaltranslation/api';
import {
  createGtApiAdapter,
  defaultBaseUrl,
} from 'generaltranslation/internal';
import type { CustomMapping } from 'generaltranslation/types';

const {
  configure: configureSharedApi,
  getClient: _getClient,
  ...sharedApi
} = createGtApiAdapter({ baseUrl: defaultBaseUrl });

export function configureApiClient(
  config: Omit<ApiClientConfig, 'baseUrl'> & {
    baseUrl?: string;
    customMapping?: CustomMapping;
  }
): void {
  configureSharedApi({ baseUrl: defaultBaseUrl, ...config });
}

export const api = {
  ...sharedApi,

  async querySourceFile(
    query: Pick<GetFileStatusData['path'], 'fileId'> &
      NonNullable<GetFileStatusData['query']>
  ) {
    const { fileId, ...queryParams } = query;
    return sharedApi.querySourceFile({ fileId }, queryParams);
  },
};
