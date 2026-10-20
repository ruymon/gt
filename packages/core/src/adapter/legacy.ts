// The 2026-03-06.v1 adapter behind GT's deprecated methods: the server's
// compat routes own their behavior. Removed in the next major.
import { DEFAULT_BATCH_SIZE, processBatches } from '@generaltranslation/api';
import {
  createBranch,
  createLegacyApiClient,
  createTag,
  downloadFiles,
  enqueueFileTranslations,
  generateProjectContext,
  getBranchInfo,
  getFileInfo,
  getOrphanedFiles,
  getProjectInfo,
  getTranslationJobInfo,
  getTranslationStatus,
  processFileMoves,
  submitUserEditDiffs,
  uploadAssets,
  type CreateBranchData,
  type CreateTagData,
  type DownloadFilesData,
  type EnqueueFileTranslationsData,
  type GenerateProjectContextData,
  type GetBranchInfoData,
  type GetFileInfoData,
  type GetTranslationJobInfoResponse,
  type GetTranslationStatusData,
  type ProcessFileMovesData,
  type SubmitUserEditDiffsData,
  type UploadAssetsData,
} from '@generaltranslation/api/legacy';
import {
  resolveAliasLocale,
  resolveCanonicalLocale,
  standardizeLocale,
} from '@generaltranslation/format';
import type { DownloadedFile } from '../types-dir/api/downloadFileBatch';
import { createDiagnosticMessage } from '../logging/diagnostics';
import { decodeFileContent } from '../utils/base64';
import { unwrapApiResult } from '../translate/utils/unwrapApiResult';
import { validateFileFormatTransforms } from '../translate/utils/validateFileFormatTransform';
import { isModelProvider, supportedModelProviders } from './modelProvider';
import type { GtApiAdapterConfig } from './createGtApi';

function normalizeJobStatus(job: GetTranslationJobInfoResponse[number]): {
  jobId: string;
  status: GetTranslationJobInfoResponse[number]['status'];
  error?: { message: string };
} {
  return {
    jobId: job.jobId,
    status: job.status,
    ...(job.status === 'failed'
      ? { error: { message: job.error.message ?? '' } }
      : {}),
  };
}

/** @deprecated Removed in the next major. */
export function createLegacyGtApiAdapter() {
  let client: ReturnType<typeof createLegacyApiClient> | undefined;
  let config: GtApiAdapterConfig | undefined;

  // Mapping resolves aliases; standardization also canonicalizes configured
  // spellings such as en-us before they cross the service boundary.
  function resolveServiceLocale(locale: string): string {
    return standardizeLocale(
      resolveCanonicalLocale(locale, config?.customMapping)
    );
  }

  function getConfig(): GtApiAdapterConfig {
    if (!config) {
      throw new Error(
        'API client not configured — call configureApiClient first'
      );
    }
    return config;
  }

  function getClient(
    timeoutMs?: number
  ): ReturnType<typeof createLegacyApiClient> {
    if (timeoutMs === undefined && client) return client;
    return createLegacyApiClient({ ...getConfig(), timeoutMs });
  }

  function configure(nextConfig: GtApiAdapterConfig): void {
    client = createLegacyApiClient(nextConfig);
    config = { ...nextConfig };
  }

  // Raw service responses; the normalized adapter methods build on these and
  // compatibility facades (CLI) expose them unchanged.
  async function loadJobStatuses(
    jobIds: readonly string[],
    options: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<GetTranslationJobInfoResponse> {
    return unwrapApiResult(
      await getTranslationJobInfo({
        body: { jobIds: [...jobIds] },
        client: getClient(options.timeoutMs),
        signal: options.signal,
      })
    );
  }

  async function loadProjectInfo(projectId?: string, timeoutMs?: number) {
    const resolvedProjectId = projectId ?? getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('Project ID is required to fetch project information');
    }
    return unwrapApiResult(
      await getProjectInfo({
        client: getClient(timeoutMs),
        path: { projectId: resolvedProjectId },
      })
    );
  }

  return {
    configure,

    async queryBranchData(body: GetBranchInfoData['body']) {
      return unwrapApiResult(
        await getBranchInfo({ body, client: getClient() })
      );
    },

    async createBranch(body: CreateBranchData['body']) {
      return unwrapApiResult(await createBranch({ body, client: getClient() }));
    },

    async processFileMoves(
      moves: ProcessFileMovesData['body']['moves'],
      options: Pick<ProcessFileMovesData['body'], 'branchId'> & {
        timeout?: number;
      } = {}
    ) {
      const results = await processBatches(moves, async (batch) => {
        const response = unwrapApiResult(
          await processFileMoves({
            body: { branchId: options.branchId, moves: batch },
            client: getClient(options.timeout),
          })
        );
        return response.results;
      });
      const succeeded = results.filter(({ success }) => success).length;
      return {
        results,
        summary: {
          total: moves.length,
          succeeded,
          failed: results.length - succeeded,
        },
      };
    },

    async getOrphanedFiles(
      branchId: string,
      fileIds: string[],
      options: { timeout?: number } = {}
    ) {
      const request = async (batch: string[]) =>
        unwrapApiResult(
          await getOrphanedFiles({
            body: { branchId, fileIds: batch },
            client: getClient(options.timeout),
          })
        );

      if (fileIds.length === 0) return request([]);

      const results = await processBatches(fileIds, async (batch) => [
        await request(batch),
      ]);
      const orphanedFiles = new Map(
        results[0].orphanedFiles.map((file) => [file.fileId, file])
      );
      for (const result of results.slice(1)) {
        const batchFileIds = new Set(
          result.orphanedFiles.map((file) => file.fileId)
        );
        for (const fileId of Array.from(orphanedFiles.keys())) {
          if (!batchFileIds.has(fileId)) orphanedFiles.delete(fileId);
        }
      }
      return { orphanedFiles: Array.from(orphanedFiles.values()) };
    },

    async setupProject(
      files: GenerateProjectContextData['body']['files'],
      options: Omit<GenerateProjectContextData['body'], 'files'> & {
        timeoutMs?: number;
      } = {}
    ) {
      return unwrapApiResult(
        await generateProjectContext({
          body: {
            files: files.map(({ branchId, fileId, versionId }) => ({
              branchId,
              fileId,
              versionId,
            })),
            locales: options.locales?.map((locale) =>
              resolveServiceLocale(locale)
            ),
            force: options.force,
          },
          client: getClient(options.timeoutMs),
        })
      );
    },

    loadJobStatuses,

    async checkJobStatus(jobIds: string[], timeoutMs?: number) {
      const statuses = await loadJobStatuses(jobIds, { timeoutMs });
      return statuses.map(normalizeJobStatus);
    },

    async enqueueFiles(
      files: EnqueueFileTranslationsData['body']['files'],
      options: {
        sourceLocale?: string;
        targetLocales: string[];
        modelProvider?: string;
        force?: boolean;
        timeout?: number;
      }
    ) {
      validateFileFormatTransforms(files);
      const modelProvider = options.modelProvider;
      if (modelProvider !== undefined && !isModelProvider(modelProvider)) {
        throw new Error(
          createDiagnosticMessage({
            source: 'generaltranslation',
            severity: 'Error',
            whatHappened: `Unsupported model provider \`${modelProvider}\``,
            fix: `Use one of: ${supportedModelProviders.join(', ')}`,
          })
        );
      }
      const targetLocales = options.targetLocales.map((locale) =>
        resolveServiceLocale(locale)
      );
      const result = await processBatches(files, async (batch) => {
        const response = unwrapApiResult(
          await enqueueFileTranslations({
            body: {
              files: batch.map(
                ({
                  branchId,
                  fileId,
                  versionId,
                  fileName,
                  transformFormat,
                }) => ({
                  branchId,
                  fileId,
                  versionId,
                  fileName,
                  transformFormat,
                })
              ),
              targetLocales,
              sourceLocale: options.sourceLocale
                ? resolveServiceLocale(options.sourceLocale)
                : undefined,
              modelProvider,
              force: options.force,
            },
            client: getClient(options.timeout),
          })
        );
        const jobData =
          'jobData' in response ? response.jobData : response.data;
        return Object.entries(jobData);
      });

      return {
        jobData: Object.fromEntries(result),
        locales: targetLocales,
        message: `Successfully enqueued ${result.length} file translation jobs in ${Math.ceil(files.length / DEFAULT_BATCH_SIZE)} batch(es)`,
      };
    },

    async createTag(body: CreateTagData['body']) {
      return unwrapApiResult(await createTag({ body, client: getClient() }));
    },

    async submitUserEditDiffs(
      body: SubmitUserEditDiffsData['body'],
      options: { timeout?: number } = {}
    ) {
      return processBatches(body.diffs, async (diffs) => [
        unwrapApiResult(
          await submitUserEditDiffs({
            body: {
              projectId: body.projectId,
              diffs: diffs.map(
                ({
                  diff,
                  branchId,
                  versionId,
                  fileId,
                  localContent,
                  locale,
                }) => ({
                  diff,
                  branchId,
                  versionId,
                  fileId,
                  localContent,
                  locale: resolveServiceLocale(locale),
                })
              ),
            },
            client: getClient(options.timeout),
          })
        ),
      ]);
    },

    loadProjectInfo,

    async getProjectInfo(projectId?: string, timeoutMs?: number) {
      const result = await loadProjectInfo(projectId, timeoutMs);
      return {
        ...result,
        defaultLocale: resolveAliasLocale(
          result.defaultLocale,
          config?.customMapping
        ),
        currentLocales: result.currentLocales.map((locale) =>
          resolveAliasLocale(locale, config?.customMapping)
        ),
      };
    },

    async queryFileData(body: GetFileInfoData['body'], timeoutMs?: number) {
      const result = unwrapApiResult(
        await getFileInfo({
          body: {
            ...body,
            translatedFiles: body.translatedFiles?.map((file) => ({
              ...file,
              locale: resolveServiceLocale(file.locale),
            })),
          },
          client: getClient(timeoutMs),
        })
      );
      return {
        ...result,
        translatedFiles: result.translatedFiles.map((file) => ({
          ...file,
          locale: resolveAliasLocale(file.locale, config?.customMapping),
        })),
        sourceFiles: result.sourceFiles.map((file) => ({
          ...file,
          sourceLocale: resolveAliasLocale(
            file.sourceLocale,
            config?.customMapping
          ),
          locales: file.locales.map((locale) =>
            resolveAliasLocale(locale, config?.customMapping)
          ),
        })),
      };
    },

    async querySourceFile(
      path: GetTranslationStatusData['path'],
      query: GetTranslationStatusData['query'] = {},
      timeoutMs?: number
    ) {
      const result = unwrapApiResult(
        await getTranslationStatus({
          path,
          query,
          client: getClient(timeoutMs),
        })
      );
      return {
        ...result,
        translations: result.translations.map((translation) => ({
          ...translation,
          locale: resolveAliasLocale(translation.locale, config?.customMapping),
        })),
        sourceFile: {
          ...result.sourceFile,
          sourceLocale: resolveAliasLocale(
            result.sourceFile.sourceLocale,
            config?.customMapping
          ),
          locales: result.sourceFile.locales.map((locale) =>
            resolveAliasLocale(locale, config?.customMapping)
          ),
        },
      };
    },

    async downloadFileBatch(
      files: DownloadFilesData['body'],
      options: { timeout?: number } = {}
    ) {
      const request = async (batch: DownloadFilesData['body']) =>
        unwrapApiResult(
          await downloadFiles({
            body: batch.map((file) => ({
              ...file,
              locale: file.locale
                ? resolveServiceLocale(file.locale)
                : undefined,
            })),
            client: getClient(options.timeout),
          })
        );
      const responses = await processBatches(files, async (batch) => [
        await request(batch),
      ]);
      return {
        files: responses.flatMap((response) =>
          response.files.map(
            (file): DownloadedFile => ({
              ...file,
              ...(file.locale && {
                locale: resolveAliasLocale(file.locale, config?.customMapping),
              }),
              data: decodeFileContent(file.data, file.fileFormat),
              metadata: file.metadata,
            })
          )
        ),
        count: responses.reduce((count, response) => count + response.count, 0),
        pending: responses.flatMap((response) =>
          (response.pending ?? []).map((file) => ({
            ...file,
            locale: resolveAliasLocale(file.locale, config?.customMapping),
          }))
        ),
      };
    },

    async uploadFonts(
      fonts: UploadAssetsData['body']['assets'],
      options: { timeout?: number } = {}
    ) {
      const assets = await processBatches(
        fonts,
        async (batch) => {
          const result = unwrapApiResult(
            await uploadAssets({
              body: { assets: batch },
              client: getClient(options.timeout),
            })
          );
          return result.assets;
        },
        { batchSize: 50 }
      );
      return { assets, count: assets.length };
    },
  };
}
