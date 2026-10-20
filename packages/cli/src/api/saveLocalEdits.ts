import { Settings } from '../types/index.js';
import { aggregateFiles } from '../formats/files/aggregateFiles.js';
import { collectAndSendUserEditDiffs } from './collectUserEditDiffs.js';
import { api } from '../utils/api.js';
import { BranchStep } from '../workflows/steps/BranchStep.js';
import { logErrorAndExit } from '../console/logging.js';
import { logger } from '../console/logger.js';
import { branchResolutionError } from '../console/index.js';
import type { FileReference } from 'generaltranslation/types';
import chalk from 'chalk';
import { runPublishWorkflow } from '../workflows/publish.js';
import { readLockfile } from '../fs/config/downloadedVersions.js';
import { TEMPLATE_FILE_ID, TEMPLATE_FILE_NAME } from '../utils/constants.js';
import { shouldPublishGt } from '../utils/resolvePublish.js';

/**
 * Uploads current source files to obtain file references, then collects and sends
 * diffs for all locales based on last downloaded versions. Does not enqueue translations.
 */
export async function saveLocalEdits(settings: Settings): Promise<void> {
  if (!settings.files) return;

  // Collect current files from config
  const { files, publishMap } = await aggregateFiles(settings);
  const fileRefs = files.map((file) => ({
    fileName: file.fileName,
    fileFormat: file.fileFormat,
    fileId: file.fileId,
    versionId: file.versionId,
  }));

  // Include the GT JSON at its last downloaded version
  const gtJsonEntry = settings.files.placeholderPaths.gt
    ? readLockfile(settings).entryMap.get(TEMPLATE_FILE_ID)
    : undefined;
  if (gtJsonEntry) {
    fileRefs.push({
      fileName: TEMPLATE_FILE_NAME,
      fileFormat: 'GTJSON',
      fileId: TEMPLATE_FILE_ID,
      versionId: gtJsonEntry.versionId,
    });
    const gtPublishValue = shouldPublishGt(settings);
    if (gtPublishValue !== undefined) {
      publishMap.set(TEMPLATE_FILE_ID, gtPublishValue);
    }
  }
  if (!fileRefs.length) return;

  // run branch query to get branch id
  // Run the branch step
  const branchStep = new BranchStep(api, settings);
  const branchResult = await branchStep.run();
  if (!branchResult) {
    return logErrorAndExit(branchResolutionError);
  }

  const uploads = fileRefs.map((file) => ({
    ...file,
    branchId: branchResult.currentBranch.id,
  })) satisfies FileReference[];

  const spinner = logger.createSpinner('dots');
  spinner.start('Saving local edits...');

  const { saved, failed } = await collectAndSendUserEditDiffs(
    uploads,
    settings
  );
  if (failed.length === 0) {
    spinner.stop(chalk.green('Local edits saved successfully'));
  } else if (saved.length === 0) {
    spinner.stop(chalk.red('Local edits could not be saved'));
  } else {
    spinner.stop(
      chalk.yellow(
        `Saved ${saved.length} of ${saved.length + failed.length} local edits`
      )
    );
  }

  // Publish only the file versions whose edits were all saved, if publish config exists
  const versionKey = (edit: { fileId: string; versionId: string }) =>
    `${edit.fileId}:${edit.versionId}`;
  const failedVersions = new Set(failed.map(versionKey));
  const savedVersions = new Map(
    saved
      .filter((edit) => !failedVersions.has(versionKey(edit)))
      .map((edit) => [versionKey(edit), edit])
  );
  if (savedVersions.size > 0) {
    await runPublishWorkflow(
      [...savedVersions.values()],
      publishMap,
      branchResult.currentBranch.id,
      settings
    );
  }
}
