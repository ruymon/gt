// `generaltranslation` language toolkit
// © 2026, General Translation, Inc.

// ----- IMPORTS ----- //

import {
  DEFAULT_BATCH_SIZE,
  type CreateBranchData,
  type CreateBranchResponse,
  type GenerateProjectContextData,
  type GenerateProjectContextResponse,
  type GetFileContentData,
  type GetFileContentResponse,
  type GetFileStatusData,
  type GetFileStatusResponse,
  type GetJobResponse,
  type GetProjectResponse,
  type ListBranchesData,
  type ListBranchesResponse,
  type ListBranchFilesData,
  type ListBranchFilesResponse,
  type MoveFilesResponse,
  type OverwriteTranslationsData,
  type OverwriteTranslationsResponse,
  type QueryFilesContentData,
  type QueryFilesContentResponse,
  type QueryFilesData,
  type QueryFilesResponse,
  type QueryJobsResponse,
  type SetTagData,
  type SetTagResponse,
  type TranslateFilesData,
  type TranslateFilesResponse,
  type UpdateBranchData,
  type UpdateBranchResponse,
  type UpdateProjectData,
  type UpdateProjectResponse,
  type UpsertAssetsData,
  type UpsertAssetsResponse,
} from '@generaltranslation/api';
import {
  EnqueueFilesResult,
  CheckFileTranslationsOptions,
  DownloadFileBatchOptions,
  DownloadFileBatchResult,
  DownloadFileOptions,
  CreateTagOptions,
  CreateTagResult,
  GetOrphanedFilesResult,
} from './types';
import { libraryDefaultLocale } from './settings/settings';
import { defaultBaseUrl } from './settings/settingsUrls';
import {
  noSourceLocaleProvidedError,
  noTargetLocaleProvidedError,
} from './logging/errors';
import { gtInstanceLogger } from './logging/logger';
import { warnDeprecated } from './logging/deprecation';
import type {
  SetupProjectResult,
  SetupProjectOptions,
  SetupProjectFileReference,
} from './translate/setupProject';
import type { EnqueueFilesOptions } from './translate/enqueueFiles';
import type {
  FileQuery,
  FileQueryResult,
} from './types-dir/api/checkFileTranslations';
import type { SubmitUserEditDiffsPayload } from './translate/submitUserEditDiffs';
import type {
  FileUpload,
  UploadFilesOptions,
  UploadFilesResponse,
  UploadTranslationsResult,
} from './types-dir/api/uploadFiles';
import type {
  AssetUpload,
  UploadAssetsOptions,
  UploadAssetsResponse,
} from './types-dir/api/uploadAssets';
import type { ProjectData } from './types-dir/api/project';
import type { DownloadFileBatchRequest } from './types-dir/api/downloadFileBatch';
import type { CheckJobStatusResult } from './translate/checkJobStatus';
import type { AwaitJobsOptions, AwaitJobsResult } from './translate/awaitJobs';
import type { FileDataQuery, FileDataResult } from './translate/queryFileData';
import type {
  GetProjectInfoOptions,
  ProjectInfoResult,
} from './translate/getProjectInfo';
import type { BranchQuery } from './translate/queryBranchData';
import type { BranchDataResult } from './types-dir/api/branch';
import type {
  CreateBranchQuery,
  CreateBranchResult,
  LegacyCreateBranchQuery,
} from './translate/createBranch';
import type { FileReferenceIds } from './types-dir/api/file';
import type {
  MoveMapping,
  ProcessMovesResponse,
  ProcessMovesOptions,
} from './translate/processFileMoves';
import type {
  PublishFileEntry,
  PublishFilesResult,
} from './translate/publishFiles';
import { createGtApiAdapter, type GtApiAdapter } from './adapter/createGtApi';
import { GTRuntime, type GTConstructorParams } from './runtime';
import { validateAuth } from './translate/runtimeTranslate';

export { GTRuntime, type GTConstructorParams } from './runtime';
export { decodeVars } from './derive/decodeVars';
export { declareVar } from './derive/declareVar';
export { derive } from './derive/derive';

export {
  LocaleConfig,
  type LocaleConfigConstructorParams,
} from '@generaltranslation/format';

export {
  determineLocale,
  formatCurrency,
  formatCutoff,
  formatDateTime,
  formatList,
  formatListToParts,
  formatMessage,
  formatNum,
  formatRelativeTime,
  formatRelativeTimeFromDate,
  getLocaleDirection,
  getLocaleEmoji,
  getLocaleName,
  getLocaleProperties,
  getRegionProperties,
  isSameDialect,
  isSameLanguage,
  isSupersetLocale,
  isValidLocale,
  requiresTranslation,
  resolveAliasLocale,
  resolveCanonicalLocale,
  standardizeLocale,
} from '@generaltranslation/format';

// ============================================================ //
//                        Core Class                            //
// ============================================================ //

/**
 * GT is the core driver for the General Translation library.
 * It extends {@link GTRuntime} (locale management, formatting, and runtime
 * translation) with the project and file management API client used by
 * tooling such as the CLI.
 *
 * Browser-facing SDK code should construct {@link GTRuntime} instead so
 * production bundles do not ship the file management client.
 *
 * @class GT
 * @description A comprehensive toolkit for handling internationalization and localization.
 *
 * @example
 * const gt = new GT({
 *   sourceLocale: 'en-US',
 *   targetLocale: 'es-ES',
 *   locales: ['en-US', 'es-ES', 'fr-FR']
 * });
 */
export class GT extends GTRuntime {
  // Built lazily from the current config. `setConfig` is the only supported
  // way to change those fields after construction, so it is the only place the
  // cache is dropped; assigning `gt.apiKey` etc. directly does not rebuild it.
  private _apiAdapter?: GtApiAdapter;

  setConfig(params: GTConstructorParams) {
    // GTRuntime writes credentials before it validates locales, so drop the
    // cache even when validation throws.
    try {
      super.setConfig(params);
    } finally {
      this._apiAdapter = undefined;
    }
  }

  private _getApiAdapter(): GtApiAdapter {
    this._apiAdapter ??= createGtApiAdapter({
      apiKey: this.apiKey || this.devApiKey,
      userTokenProvider: this.userTokenProvider,
      baseUrl: this.baseUrl || defaultBaseUrl,
      projectId: this.projectId,
      customMapping: this.customMapping,
    });
    return this._apiAdapter;
  }

  // Restores configured locale spellings on a project read from the service.
  private _restoreProjectLocales<
    T extends { defaultLocale: string; currentLocales: string[] },
  >(project: T): T {
    return {
      ...project,
      defaultLocale: this.resolveServiceResponseLocale(project.defaultLocale),
      currentLocales: project.currentLocales.map((locale) =>
        this.resolveServiceResponseLocale(locale)
      ),
    };
  }

  private _restoreFileStatusLocales(
    result: GetFileStatusResponse
  ): GetFileStatusResponse {
    return {
      translations: result.translations.map((item) => ({
        ...item,
        ...(item.locale && {
          locale: this.resolveServiceResponseLocale(item.locale),
        }),
      })),
      sourceFile: {
        ...result.sourceFile,
        ...(result.sourceFile.sourceLocale && {
          sourceLocale: this.resolveServiceResponseLocale(
            result.sourceFile.sourceLocale
          ),
        }),
        locales: result.sourceFile.locales.map((locale) =>
          this.resolveServiceResponseLocale(locale)
        ),
      },
    };
  }

  // -------------- Project Methods -------------- //

  /**
   * Fetches the configured project: name, locales, review and CDN settings.
   *
   * @param options - Options for the API call.
   * @returns The project.
   */
  async getProject(
    options: GetProjectInfoOptions = {}
  ): Promise<GetProjectResponse> {
    validateAuth('getProject', this._getTranslationConfig());
    return this._restoreProjectLocales(
      await this._getApiAdapter().getProject(options)
    );
  }

  /**
   * Updates settings of the configured project. Omitted settings stay unchanged.
   *
   * @param body - The settings to change.
   * @param options - Options for the API call.
   * @returns The updated project.
   */
  async updateProject(
    body: UpdateProjectData['body'],
    options: GetProjectInfoOptions = {}
  ): Promise<UpdateProjectResponse> {
    validateAuth('updateProject', this._getTranslationConfig());
    return this._restoreProjectLocales(
      await this._getApiAdapter().updateProject(body, options)
    );
  }

  /**
   * Fetches project info (name, locales, review settings) for the
   * authenticated project.
   *
   * @deprecated Use `getProject()` instead. This method will be removed in the next major version.
   * @param options - The options for the API call.
   * @returns The project info.
   */
  async getProjectInfo(
    options: GetProjectInfoOptions = {}
  ): Promise<ProjectInfoResult> {
    warnDeprecated('GT.getProjectInfo()', 'GT.getProject()');
    validateAuth('getProjectInfo', this._getTranslationConfig());
    return this._restoreProjectLocales(
      await this._getApiAdapter().getProjectInfo(undefined, options.timeout)
    );
  }

  /**
   * Get project data for a given project ID.
   *
   * @deprecated Use `getProject()` instead. This method will be removed in the next major version.
   * @param {string} projectId - The ID of the project to get the data for.
   * @returns {Promise<ProjectData>} The project data.
   *
   * @example
   * const result = await gt.getProjectData(
   *   '1234567890'
   * );
   *
   */
  async getProjectData(
    projectId: string,
    options: { timeout?: number } = {}
  ): Promise<ProjectData> {
    warnDeprecated('GT.getProjectData()', 'GT.getProject()');
    validateAuth('getProjectData', this._getTranslationConfig());
    const { autoApprove: _autoApprove, ...project } =
      await this._getApiAdapter().getProjectInfo(projectId, options.timeout);
    return this._restoreProjectLocales(project);
  }

  // -------------- Branch Methods -------------- //

  /**
   * Lists one page of the project's branches.
   *
   * @param query - Filters (`name`, `isDefault`) and paging (`cursor`, `limit`).
   * @param options - Options for the API call.
   * @returns The branches and the cursor of the next page.
   */
  async listBranches(
    query: ListBranchesData['query'] = {},
    options: { timeout?: number } = {}
  ): Promise<ListBranchesResponse> {
    validateAuth('listBranches', this._getTranslationConfig());
    return await this._getApiAdapter().listBranches(query, options);
  }

  /**
   * Queries branch information from the API.
   *
   * @deprecated Use `listBranches()` instead. This method will be removed in the next major version.
   * @param {BranchQuery} query - Object mapping the current branch and incoming branches
   * @returns {Promise<BranchDataResult>} The branch information.
   */
  async queryBranchData(query: BranchQuery): Promise<BranchDataResult> {
    warnDeprecated('GT.queryBranchData()', 'GT.listBranches()');
    validateAuth('queryBranchData', this._getTranslationConfig());
    return await this._getApiAdapter().queryBranchData(query);
  }

  /**
   * Creates a branch. If a branch with the name already exists, it is returned;
   * that lookup needs branch read access, so a key without it gets the 409.
   *
   * @param query - The branch `name` and whether it `isDefault`.
   * @returns The created or existing branch.
   */
  createBranch(query: CreateBranchData['body']): Promise<CreateBranchResponse>;
  /**
   * Creates a new branch in the API. If the branch already exists, it will be returned.
   *
   * @deprecated Use `createBranch({ name, isDefault })` instead. This input will be removed in the next major version.
   * @param {LegacyCreateBranchQuery} query - Object mapping the branch name and default branch flag
   * @returns {Promise<CreateBranchResult>} The created branch information.
   */
  createBranch(query: LegacyCreateBranchQuery): Promise<CreateBranchResult>;
  async createBranch(
    query: CreateBranchQuery
  ): Promise<CreateBranchResponse | CreateBranchResult> {
    if ('branchName' in query) {
      warnDeprecated(
        'GT.createBranch({ branchName })',
        'GT.createBranch({ name })'
      );
    }
    if ('defaultBranch' in query) {
      warnDeprecated(
        'GT.createBranch({ defaultBranch })',
        'GT.createBranch({ isDefault })'
      );
    }
    validateAuth('createBranch', this._getTranslationConfig());
    return await this._getApiAdapter().createBranch(query);
  }

  /**
   * Renames a branch or makes it the project's default branch. Omitted
   * fields stay unchanged.
   *
   * @param branchId - The branch to update.
   * @param body - The new `name` and/or `isDefault: true`.
   * @param options - Options for the API call.
   * @returns The updated branch.
   */
  async updateBranch(
    branchId: string,
    body: UpdateBranchData['body'],
    options: { timeout?: number } = {}
  ): Promise<UpdateBranchResponse> {
    validateAuth('updateBranch', this._getTranslationConfig());
    return await this._getApiAdapter().updateBranch(branchId, body, options);
  }

  /**
   * Lists one page of the files on a branch, with their head versions.
   *
   * @param branchId - The branch to list.
   * @param query - Paging (`cursor`, `limit`).
   * @param options - Options for the API call.
   * @returns The files and the cursor of the next page.
   */
  async listBranchFiles(
    branchId: string,
    query: ListBranchFilesData['query'] = {},
    options: { timeout?: number } = {}
  ): Promise<ListBranchFilesResponse> {
    validateAuth('listBranchFiles', this._getTranslationConfig());
    return await this._getApiAdapter().listBranchFiles(
      branchId,
      query,
      options
    );
  }

  /**
   * Gets orphaned files for a branch - files that exist on the branch
   * but whose fileIds are not in the provided list.
   * Used for move detection.
   *
   * @deprecated Use `listBranchFiles()` instead. This method will be removed in the next major version.
   * @param {string} branchId - The branch to check for orphaned files.
   * @param {string[]} fileIds - List of current file IDs (files that are NOT orphaned)
   * @param {Object} options - Options including timeout.
   * @returns {Promise<GetOrphanedFilesResult>} The orphaned files.
   */
  async getOrphanedFiles(
    branchId: string,
    fileIds: string[],
    options: { timeout?: number } = {}
  ): Promise<GetOrphanedFilesResult> {
    warnDeprecated('GT.getOrphanedFiles()', 'GT.listBranchFiles()');
    validateAuth('getOrphanedFiles', this._getTranslationConfig());
    return await this._getApiAdapter().getOrphanedFiles(
      branchId,
      fileIds,
      options
    );
  }

  /**
   * Moves files to new file IDs, cloning each source file and its translations,
   * in batches the server accepts. A move can fail on its own; check
   * `summary.failed` and each result's `status`.
   *
   * @param {MoveMapping[]} moves - Old file ID to new file ID and name.
   * @param {ProcessMovesOptions} options - Branch and timeout.
   * @returns The summary and one result per move, in request order.
   */
  async moveFiles(
    moves: MoveMapping[],
    options: ProcessMovesOptions = {}
  ): Promise<MoveFilesResponse> {
    validateAuth('moveFiles', this._getTranslationConfig());
    return await this._getApiAdapter().moveFiles(moves, options);
  }

  /**
   * Processes file moves by cloning source files and translations with new fileIds.
   *
   * @deprecated Use `moveFiles()` instead. This method will be removed in the next major version.
   * @param {MoveMapping[]} moves - Array of move mappings (old fileId to new fileId)
   * @param {ProcessMovesOptions} options - Options including branchId and timeout
   * @returns {Promise<ProcessMovesResponse>} The move processing results.
   */
  async processFileMoves(
    moves: MoveMapping[],
    options: ProcessMovesOptions = {}
  ): Promise<ProcessMovesResponse> {
    warnDeprecated('GT.processFileMoves()', 'GT.moveFiles()');
    validateAuth('processFileMoves', this._getTranslationConfig());
    return await this._getApiAdapter().processFileMoves(moves, options);
  }

  // -------------- Job Methods -------------- //

  /**
   * Queues context generation for the project from previously uploaded source files.
   *
   * @param files - Source file versions to generate the context from.
   * @param options - Target `locales`, `force`, and timeout.
   * @returns The queued job, or `job: null` when the context is already current.
   */
  async generateProjectContext(
    files: GenerateProjectContextData['body']['files'],
    options: Omit<GenerateProjectContextData['body'], 'files'> & {
      timeout?: number;
    } = {}
  ): Promise<GenerateProjectContextResponse> {
    validateAuth('generateProjectContext', this._getTranslationConfig());
    return await this._getApiAdapter().generateProjectContext(files, options);
  }

  /**
   * Enqueues project setup job using the specified file references
   *
   * @deprecated Use `generateProjectContext()` instead. This method will be removed in the next major version.
   * @param {SetupProjectFileReference[]} files - Array of file references containing IDs of previously uploaded source files
   * @param {SetupProjectOptions} [options] - Optional settings for target locales and timeout.
   * @returns {Promise<SetupProjectResult>} Object containing the jobId and status
   */
  async setupProject(
    files: SetupProjectFileReference[],
    options?: SetupProjectOptions
  ): Promise<SetupProjectResult> {
    warnDeprecated('GT.setupProject()', 'GT.generateProjectContext()');
    validateAuth('setupProject', this._getTranslationConfig());
    return await this._getApiAdapter().setupProject(files, {
      ...options,
      locales: options?.locales?.map((locale) =>
        this.resolveServiceLocale(locale)
      ),
    });
  }

  /**
   * Reads the statuses of project jobs, in batches the server accepts.
   * A job the project does not have is `not_found`.
   *
   * @param jobIds - The jobs to read; each ID may appear once.
   * @param options - Options for the API call.
   * @returns One result per job ID, in request order.
   */
  async queryJobs(
    jobIds: string[],
    options: { timeout?: number } = {}
  ): Promise<QueryJobsResponse> {
    validateAuth('queryJobs', this._getTranslationConfig());
    return await this._getApiAdapter().queryJobs(jobIds, options);
  }

  /**
   * Reads one project job.
   *
   * @param jobId - The job to read.
   * @param options - Options for the API call.
   * @returns The job.
   */
  async getJob(
    jobId: string,
    options: { timeout?: number } = {}
  ): Promise<GetJobResponse> {
    validateAuth('getJob', this._getTranslationConfig());
    return await this._getApiAdapter().getJob(jobId, options);
  }

  /**
   * Checks the current status of one or more project jobs by their unique identifiers.
   *
   * @deprecated Use `queryJobs()` instead. This method will be removed in the next major version.
   * @param {string[]} jobIds - The unique identifiers of the jobs to check.
   * @param {number} [timeoutMs] - Optional timeout in milliseconds for the API request.
   * @returns {Promise<CheckJobStatusResult>} Object containing the job status.
   */
  async checkJobStatus(
    jobIds: string[],
    timeoutMs?: number
  ): Promise<CheckJobStatusResult> {
    warnDeprecated('GT.checkJobStatus()', 'GT.queryJobs()');
    validateAuth('checkJobStatus', this._getTranslationConfig());
    return await this._getApiAdapter().checkJobStatus(jobIds, timeoutMs);
  }

  /**
   * Polls job statuses until all jobs are finished or the timeout is reached.
   * A job the project does not have, or one not polled before the timeout,
   * reads as `unknown`.
   *
   * @param {EnqueueFilesResult | string[]} jobs - Job IDs or the result returned from enqueueFiles.
   * @param {AwaitJobsOptions} [options] - Polling configuration (interval, timeout).
   * @returns {Promise<AwaitJobsResult>} The final status of all jobs and whether they all completed.
   */
  async awaitJobs(
    jobs: EnqueueFilesResult | string[],
    options?: AwaitJobsOptions
  ): Promise<AwaitJobsResult> {
    validateAuth('awaitJobs', this._getTranslationConfig());
    const jobIds = Array.isArray(jobs) ? jobs : Object.keys(jobs.jobData);
    return await this._getApiAdapter().awaitJobs(jobIds, options);
  }

  // -------------- Translation Methods -------------- //

  /**
   * Queues translation jobs for previously uploaded source files, in batches
   * the server accepts. Poll the returned jobs with `awaitJobs()` or `queryJobs()`.
   *
   * @param files - Source file versions to translate.
   * @param options - Target and source locales, `force`, `modelProvider`, `publish`, and timeout.
   * @returns One job per file and target locale that needs translating; empty when nothing is queued.
   */
  async translateFiles(
    files: TranslateFilesData['body']['files'],
    options: Omit<TranslateFilesData['body'], 'files'> & {
      timeout?: number;
    } = {}
  ): Promise<TranslateFilesResponse> {
    validateAuth('translateFiles', this._getTranslationConfig());
    return await this._getApiAdapter().translateFiles(files, options);
  }

  /**
   * Enqueues translation jobs for previously uploaded source files.
   *
   * @deprecated Use `translateFiles()` instead. This method will be removed in the next major version.
   * @param {FileReferenceIds[]} files - Array of file references containing IDs of previously uploaded source files
   * @param {EnqueueFilesOptions} options - Configuration options including source locale, target locales, and job settings.
   * @returns {Promise<EnqueueFilesResult>} Result containing job IDs, queue status, and processing information.
   */
  async enqueueFiles(
    files: FileReferenceIds[],
    options: EnqueueFilesOptions
  ): Promise<EnqueueFilesResult> {
    warnDeprecated('GT.enqueueFiles()', 'GT.translateFiles()');
    // Validation
    validateAuth('enqueueFiles', this._getTranslationConfig());

    // Merge instance settings with options.
    let mergedOptions: EnqueueFilesOptions = {
      ...options,
      sourceLocale: options.sourceLocale ?? this.sourceLocale!,
      targetLocales: options.targetLocales ?? [this.targetLocale!],
    };

    // Require source locale
    if (!mergedOptions.sourceLocale) {
      const error = noSourceLocaleProvidedError('enqueueFiles');
      gtInstanceLogger.error(error);
      throw new Error(error);
    }

    // Require target locale(s)
    if (
      !mergedOptions.targetLocales ||
      mergedOptions.targetLocales.length === 0
    ) {
      const error = noTargetLocaleProvidedError('enqueueFiles');
      gtInstanceLogger.error(error);
      throw new Error(error);
    }

    // The adapter synthesizes result.locales from targetLocales, so retain
    // the caller's identities before converting the request to service
    // language codes.
    const targetLocaleIdentities = [...mergedOptions.targetLocales];

    // Convert configured identities at the service boundary.
    mergedOptions = {
      ...mergedOptions,
      sourceLocale: this.resolveServiceLocale(mergedOptions.sourceLocale),
      targetLocales: mergedOptions.targetLocales.map((locale) =>
        this.resolveServiceLocale(locale)
      ),
    };

    const result = await this._getApiAdapter().enqueueFiles(
      files,
      mergedOptions
    );
    return {
      ...result,
      locales: targetLocaleIdentities,
    };
  }

  /**
   * Creates or replaces a tag: points `tagId` at exactly the given source file
   * versions and sets its message (omitted clears it).
   *
   * @param tagId - The tag name, unique within the project.
   * @param body - The tagged file versions and optional message.
   * @returns The tag, and whether this request `created` it.
   */
  async setTag(
    tagId: string,
    body: SetTagData['body']
  ): Promise<SetTagResponse> {
    validateAuth('setTag', this._getTranslationConfig());
    return await this._getApiAdapter().setTag(tagId, body);
  }

  /**
   * Creates or upserts a file tag, associating a set of source files
   * with a user-defined tag ID and optional message.
   *
   * @deprecated Use `setTag()` instead. This method will be removed in the next major version.
   * @param {CreateTagOptions} options - Tag creation options including tagId, sourceFileIds, and optional message
   * @returns {Promise<CreateTagResult>} The created or updated tag.
   */
  async createTag(options: CreateTagOptions): Promise<CreateTagResult> {
    warnDeprecated('GT.createTag()', 'GT.setTag()');
    validateAuth('createTag', this._getTranslationConfig());
    return await this._getApiAdapter().createTag(options);
  }

  /**
   * Publishes or unpublishes file versions on the CDN, in batches the server
   * accepts. A version can fail on its own; check `summary.failed` and each
   * result's `status` and `translations`.
   *
   * @param {PublishFileEntry[]} files - File versions with publish flags.
   * @returns {Promise<PublishFilesResult>} The summary and one result per file version, in request order.
   */
  async publishFiles(files: PublishFileEntry[]): Promise<PublishFilesResult> {
    validateAuth('publishFiles', this._getTranslationConfig());
    const result = await this._getApiAdapter().publishFiles(files);
    return {
      ...result,
      results: result.results.map((item) => ({
        ...item,
        translations: item.translations.map((translation) => ({
          ...translation,
          locale: this.resolveServiceResponseLocale(translation.locale),
        })),
      })),
    };
  }

  /**
   * Replaces translations with full local content so future generations
   * preserve user edits, in batches the server accepts. A translation can fail
   * on its own; check `summary.failed` and each result's `status`.
   *
   * @param diffs - One entry per translation with its diff and full local content.
   * @param options - Options for the API call.
   * @returns The summary and one result per translation, in request order.
   */
  async overwriteTranslations(
    diffs: OverwriteTranslationsData['body']['diffs'],
    options: { timeout?: number } = {}
  ): Promise<OverwriteTranslationsResponse> {
    validateAuth('overwriteTranslations', this._getTranslationConfig());
    const result = await this._getApiAdapter().overwriteTranslations(
      diffs,
      options
    );
    return {
      ...result,
      results: result.results.map((item, index) => ({
        ...item,
        locale: diffs[index].locale,
      })),
    };
  }

  /**
   * Submits user edit diffs for existing translations so future generations preserve user intent.
   *
   * @deprecated Use `overwriteTranslations()` instead. This method will be removed in the next major version.
   * @param {SubmitUserEditDiffsPayload} payload - Project-scoped diff payload.
   * @returns {Promise<void>} Resolves when submission succeeds.
   */
  async submitUserEditDiffs(
    payload: SubmitUserEditDiffsPayload
  ): Promise<void> {
    warnDeprecated('GT.submitUserEditDiffs()', 'GT.overwriteTranslations()');
    validateAuth('submitUserEditDiffs', this._getTranslationConfig());
    // Normalize locales to canonical form before submission.
    const normalized: SubmitUserEditDiffsPayload = {
      ...payload,
      diffs: (payload.diffs || []).map((d) => ({
        ...d,
        locale: this.resolveServiceLocale(d.locale),
      })),
    };
    await this._getApiAdapter().submitUserEditDiffs(normalized);
  }

  // -------------- File Methods -------------- //

  /**
   * Reads metadata of source files and translations, in batches the server
   * accepts. A selector without `locale` reads the source file.
   *
   * @param files - Selectors; ones that resolve to the same file, version, and locale are sent once and each gets the shared result.
   * @param options - Options for the API call.
   * @returns One result per selector, in selector order: `found`, `pending`, or `not_found`.
   */
  async queryFiles(
    files: QueryFilesData['body']['files'],
    options: CheckFileTranslationsOptions = {}
  ): Promise<QueryFilesResponse> {
    validateAuth('queryFiles', this._getTranslationConfig());
    const { results } = await this._getApiAdapter().queryFiles(files, options);
    return {
      results: results.map((result) => ({
        ...result,
        ...(result.sourceLocale && {
          sourceLocale: this.resolveServiceResponseLocale(result.sourceLocale),
        }),
        ...(result.locales && {
          locales: result.locales.map((locale) =>
            this.resolveServiceResponseLocale(locale)
          ),
        }),
      })),
    };
  }

  /**
   * Queries data about one or more source or translation files.
   *
   * @deprecated Use `queryFiles()` instead. This method will be removed in the next major version.
   * @param {FileDataQuery} data - Object mapping source and translation file information.
   * @param {CheckFileTranslationsOptions} options - Options for the API call.
   * @returns {Promise<FileDataResult>} The source and translation file data information.
   */
  async queryFileData(
    data: FileDataQuery,
    options: CheckFileTranslationsOptions = {}
  ): Promise<FileDataResult> {
    warnDeprecated('GT.queryFileData()', 'GT.queryFiles()');
    // Validation
    validateAuth('queryFileData', this._getTranslationConfig());

    // Replace target locales with canonical locales
    data.translatedFiles = data.translatedFiles?.map((item) => ({
      ...item,
      locale: this.resolveServiceLocale(item.locale),
    }));

    // Request the file translation status
    const result = await this._getApiAdapter().queryFileData(
      data,
      options.timeout
    );

    // Restore configured identities from service language codes.
    result.translatedFiles = result.translatedFiles?.map((item) => ({
      ...item,
      ...(item.locale && {
        locale: this.resolveServiceResponseLocale(item.locale),
      }),
    }));
    result.sourceFiles = result.sourceFiles?.map((item) => ({
      ...item,
      ...(item.sourceLocale && {
        sourceLocale: this.resolveServiceResponseLocale(item.sourceLocale),
      }),
      locales: item.locales.map((locale) =>
        this.resolveServiceResponseLocale(locale)
      ),
    }));
    return result;
  }

  /**
   * Reads a source file's status and the status of each of its translations.
   *
   * @param fileId - The source file.
   * @param query - Branch and source version; default to the default branch and its head.
   * @param options - Options for the API call.
   * @returns The source file and its translations.
   */
  async getFileStatus(
    fileId: string,
    query: GetFileStatusData['query'] = {},
    options: CheckFileTranslationsOptions = {}
  ): Promise<GetFileStatusResponse> {
    validateAuth('getFileStatus', this._getTranslationConfig());
    return this._restoreFileStatusLocales(
      await this._getApiAdapter().getFileStatus(fileId, query, options)
    );
  }

  /**
   * Gets source and translation information for a given file ID and version ID.
   *
   * @deprecated Use `getFileStatus()` instead. This method will be removed in the next major version.
   * @param {FileQuery} data - File query containing file ID and version ID.
   * @param {CheckFileTranslationsOptions} options - Options for getting source and translation information.
   * @returns {Promise<FileQueryResult>} The source file and translation information.
   */
  async querySourceFile(
    data: FileQuery,
    options: CheckFileTranslationsOptions = {}
  ): Promise<FileQueryResult> {
    warnDeprecated('GT.querySourceFile()', 'GT.getFileStatus()');
    // Validation
    validateAuth('querySourceFile', this._getTranslationConfig());

    const result = await this._getApiAdapter().querySourceFile(
      { fileId: data.fileId },
      { branchId: data.branchId, versionId: data.versionId },
      options.timeout
    );
    // Restore configured identities from service language codes.
    result.translations = result.translations.map((item) => ({
      ...item,
      ...(item.locale && {
        locale: this.resolveServiceResponseLocale(item.locale),
      }),
    }));
    result.sourceFile.locales = result.sourceFile.locales.map((locale) =>
      this.resolveServiceResponseLocale(locale)
    );
    if (result.sourceFile.sourceLocale) {
      result.sourceFile.sourceLocale = this.resolveServiceResponseLocale(
        result.sourceFile.sourceLocale
      );
    }
    return result;
  }

  /**
   * Reads the decoded content of a source file, or with `locale` of one translation.
   * Without `versionId`, a translation is the newest completed version on the branch.
   *
   * @param fileId - The source file.
   * @param query - Branch, source version, and translation locale.
   * @param options - Options for the API call.
   * @returns The content, or `status: 'pending'` with `data: null` while the translation is processing.
   */
  async getFileContent(
    fileId: string,
    query: GetFileContentData['query'] = {},
    options: DownloadFileOptions = {}
  ): Promise<GetFileContentResponse> {
    validateAuth('getFileContent', this._getTranslationConfig());
    const result = await this._getApiAdapter().getFileContent(
      fileId,
      query,
      options
    );
    return result.locale ? { ...result, locale: query.locale } : result;
  }

  /**
   * Reads the decoded content of source files and translations, in batches the
   * server accepts. A selector without `locale` reads the source file.
   *
   * @param files - Selectors; ones that resolve to the same file, version, and locale are sent once and each gets the shared result.
   * @param options - Options for the API call.
   * @returns One result per selector, in selector order: `ready`, `pending`, or `not_found`.
   */
  async queryFilesContent(
    files: QueryFilesContentData['body']['files'],
    options: DownloadFileBatchOptions = {}
  ): Promise<QueryFilesContentResponse> {
    validateAuth('queryFilesContent', this._getTranslationConfig());
    return await this._getApiAdapter().queryFilesContent(files, options);
  }

  /**
   * Downloads a single file.
   *
   * @deprecated Use `getFileContent()` instead. This method will be removed in the next major version.
   * @param file - The file query object.
   * @param {string} file.fileId - The ID of the file to download.
   * @param {string} [file.branchId] - The ID of the branch to download the file from. If not provided, the default branch will be used.
   * @param {string} [file.locale] - The locale to download the file for. If not provided, the source file will be downloaded.
   * @param {string} [file.versionId] - The version ID to download the file from. If not provided, the latest version will be used.
   * @param {DownloadFileOptions} options - Options for downloading the file.
   * @returns {Promise<string>} The downloaded file content.
   */
  async downloadFile(
    file: {
      fileId: string;
      branchId?: string;
      locale?: string;
      versionId?: string;
      useLatestAvailableVersion?: boolean;
    },
    options: DownloadFileOptions = {}
  ): Promise<string> {
    warnDeprecated('GT.downloadFile()', 'GT.getFileContent()');
    // Validation
    validateAuth('downloadTranslatedFile', this._getTranslationConfig());

    const result = await this._getApiAdapter().downloadFileBatch(
      [
        {
          ...file,
          locale: file.locale
            ? this.resolveServiceLocale(file.locale)
            : undefined,
        },
      ],
      options
    );
    return result.files[0]?.data ?? '';
  }

  /**
   * Downloads multiple files in a batch.
   *
   * @deprecated Use `queryFilesContent()` instead. This method will be removed in the next major version.
   * @param {DownloadFileBatchRequest} requests - Array of file query objects to download.
   * @param {DownloadFileBatchOptions} options - Options for the batch download.
   * @returns {Promise<DownloadFileBatchResult>} The batch download results.
   */
  async downloadFileBatch(
    requests: DownloadFileBatchRequest,
    options: DownloadFileBatchOptions = {}
  ): Promise<DownloadFileBatchResult> {
    warnDeprecated('GT.downloadFileBatch()', 'GT.queryFilesContent()');
    // Validation
    validateAuth('downloadFileBatch', this._getTranslationConfig());

    const requestedFiles = new Map<string, DownloadFileBatchRequest>();
    requests = requests.map((request) => {
      const locale = request.locale
        ? this.resolveServiceLocale(request.locale)
        : undefined;
      if (locale) {
        const key = JSON.stringify([request.fileId, locale]);
        const group = requestedFiles.get(key) ?? [];
        group.push(request);
        requestedFiles.set(key, group);
      }
      return { ...request, locale };
    });

    // Request the batch download.
    const result = await this._getApiAdapter().downloadFileBatch(
      requests,
      options
    );

    return {
      files: result.files.map((file) => {
        if (!file.locale) return file;
        // The adapter may already have restored an alias; canonicalize before
        // matching against the service codes the requests were keyed by.
        const serviceLocale = this.resolveServiceLocale(file.locale);
        const matchingRequests = (
          requestedFiles.get(JSON.stringify([file.fileId, serviceLocale])) ?? []
        ).filter(
          (request) =>
            (!request.branchId || request.branchId === file.branchId) &&
            (!request.versionId || request.versionId === file.versionId)
        );
        return {
          ...file,
          locale:
            matchingRequests.length === 1
              ? matchingRequests[0].locale
              : this.resolveServiceResponseLocale(file.locale),
        };
      }),
      count: result.count,
    };
  }

  // -------------- Upload Methods -------------- //

  /**
   * Uploads source files to the translation service without any translation content,
   * in batches the server accepts. A file can fail on its own; check
   * `summary.failed` and each result's `status`. `uploadedFiles` lists only saved files.
   *
   * @param {Array<{source: FileUpload}>} files - Array of objects containing source file data to upload
   * @param {UploadFilesOptions} options - Configuration options including source locale and other upload settings.
   * @returns {Promise<UploadFilesResponse>} The summary and one result per file, in request order.
   */
  async uploadSourceFiles(
    files: { source: FileUpload }[],
    options: UploadFilesOptions
  ): Promise<UploadFilesResponse> {
    validateAuth('uploadSourceFiles', this._getTranslationConfig());

    const result = await this._getApiAdapter().uploadSourceFiles(
      files.map((f) => ({
        ...f,
        source: {
          ...f.source,
          locale: this.resolveServiceLocale(f.source.locale),
        },
      })),
      {
        ...options,
        sourceLocale: this.resolveServiceLocale(
          options.sourceLocale ?? this.sourceLocale ?? libraryDefaultLocale
        ),
      }
    );
    return {
      ...result,
      count: result.uploadedFiles.length,
      message: `Successfully uploaded ${result.uploadedFiles.length} files in ${Math.ceil(files.length / DEFAULT_BATCH_SIZE)} batch(es)`,
    };
  }

  /**
   * Uploads fonts used when translating formats that need the source font.
   * Persistent and reused across translation jobs for the project's
   * organization, in batches the server accepts. A font can fail on its own;
   * check `summary.failed` and each result's `status`.
   *
   * @param assets - Fonts to upload (`content` base64-encoded).
   * @param options - Options for the API call.
   * @returns The summary and one result per font, in request order.
   */
  async upsertAssets(
    assets: UpsertAssetsData['body']['assets'],
    options: UploadAssetsOptions = {}
  ): Promise<UpsertAssetsResponse> {
    validateAuth('upsertAssets', this._getTranslationConfig());
    return await this._getApiAdapter().upsertAssets(assets, options);
  }

  /**
   * Uploads fonts used when translating formats that need the source font.
   * Persistent and reused across translation jobs; idempotent on the server, so
   * re-running only stores new fonts.
   *
   * @deprecated Use `upsertAssets()` instead. This method will be removed in the next major version.
   * @param {AssetUpload[]} fonts - Fonts to upload (`content` base64-encoded).
   * @param {UploadAssetsOptions} options - Optional settings (e.g. timeout).
   * @returns {Promise<UploadAssetsResponse>} The stored assets.
   */
  async uploadFonts(
    fonts: AssetUpload[],
    options: UploadAssetsOptions = {}
  ): Promise<UploadAssetsResponse> {
    warnDeprecated('GT.uploadFonts()', 'GT.upsertAssets()');
    validateAuth('uploadFonts', this._getTranslationConfig());
    return await this._getApiAdapter().uploadFonts(fonts, options);
  }

  /**
   * Uploads translation files that correspond to previously uploaded source files,
   * in batches the server accepts. A translation can fail on its own; check
   * `summary.failed` and each result's `status`. `uploadedFiles` lists only saved files.
   *
   * @param {Array<{source: FileUpload, translations: FileUpload[]}>} files - Array of file objects where:
   *   - `source`: Reference to the existing source file (contains IDs but no content).
   *   - `translations`: Array of translated files, each containing content, locale, and reference IDs
   * @param {UploadFilesOptions} options - Configuration options including source locale and upload settings.
   * @returns {Promise<UploadTranslationsResult>} The summary and one result per translation, in request order.
   */
  async uploadTranslations(
    files: {
      source: FileUpload; // reference only (no content)
      translations: FileUpload[]; // each has content + ids + locale
    }[],
    options: UploadFilesOptions
  ): Promise<UploadTranslationsResult> {
    validateAuth('uploadTranslations', this._getTranslationConfig());

    // Require source locale
    if (!(options.sourceLocale ?? this.sourceLocale)) {
      const error = noSourceLocaleProvidedError('uploadTranslations');
      gtInstanceLogger.error(error);
      throw new Error(error);
    }

    const result = await this._getApiAdapter().uploadTranslations(
      files.map((f) => ({
        ...f,
        source: {
          ...f.source,
          locale: this.resolveServiceLocale(f.source.locale),
        },
        translations: f.translations.map((t) => ({
          ...t,
          locale: this.resolveServiceLocale(t.locale),
        })),
      })),
      { timeout: options.timeout }
    );
    return {
      ...result,
      count: result.uploadedFiles.length,
      message: `Successfully uploaded ${result.uploadedFiles.length} files in ${Math.ceil(files.length / DEFAULT_BATCH_SIZE)} batch(es)`,
    };
  }
}
