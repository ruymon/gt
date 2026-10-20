---
'generaltranslation': minor
---

Move `GT` onto the canonical project-scoped API (`gt-api-version: 2026-10-08.v1`, no `gt-project-id` header) and add methods named after the canonical operations: `getProject`, `updateProject`, `listBranches`, `updateBranch`, `listBranchFiles`, `moveFiles`, `generateProjectContext`, `queryJobs`, `getJob`, `translateFiles`, `setTag`, `overwriteTranslations`, `queryFiles`, `getFileStatus`, `getFileContent`, `queryFilesContent`, and `upsertAssets`. Batched requests follow the server caps (25 moves, 10 fonts, 100 for the rest). `moveFiles` rejects a move list in which a file ID repeats or is both an old and a new file ID before sending any request, and `upsertAssets([])` sends no request.

The methods they replace keep their names, inputs, and result shapes but are deprecated and warn on first use (once per loaded CJS or ESM build): `getProjectInfo`, `getProjectData`, `queryBranchData`, `getOrphanedFiles`, `processFileMoves`, `setupProject`, `checkJobStatus`, `enqueueFiles`, `createTag`, `submitUserEditDiffs`, `queryFileData`, `querySourceFile`, `downloadFile`, `downloadFileBatch`, and `uploadFonts`. They still call the `2026-03-06.v1` routes, so their behavior is unchanged; they are removed in the next major. `createBranch` takes `name` and `isDefault` and returns an existing branch with the same name (looking it up needs branch read access; without it the 409 conflict is thrown); the deprecated `branchName` and `defaultBranch` input still calls the `2026-03-06.v1` route.

`uploadSourceFiles`, `uploadTranslations`, and `publishFiles` now return the canonical `summary` and per-item `results` and no longer fail as a whole when single items fail; `uploadedFiles` lists only saved files, and `publishFiles` results are per file version with a deprecated `success` flag. `awaitJobs` polls through `queryJobs` and keeps its result shape.

Runtime translation (`translate`, `translateMany`) now calls `POST /v2/projects/{projectId}/translate`.

`generaltranslation/api` re-exports the regenerated SDK, so the legacy generated operations and types (for example `getProjectInfo`, `createTag`, `downloadFiles`, `translate`, `TranslateData`, `GetFileInfoResponse`, `DownloadFilesData`) are no longer exported from it. Its `awaitJobs`, `pollJobs`, and their types keep their 9.x signatures, and `awaitJobs` still polls the `2026-03-06.v1` jobs route on the given client (with its current auth and interceptors), sending the `projectId` of its `createApiClient` as `gt-project-id`; the client's other requests stay canonical.
