import { logger } from '../../console/logger.js';
import { recordWarning } from '../../state/translateWarnings.js';
import { Settings } from '../../types/index.js';
import { api } from '../../utils/api.js';
import { collectFonts } from '../../formats/files/collectFonts.js';

/**
 * Syncs configured project fonts to the API so they're available when
 * translation jobs run (e.g. Lottie layout refinement). Fonts are
 * locale-invariant and the upload is idempotent server-side, so calling this
 * from every workflow that triggers jobs is safe. A failure is non-fatal —
 * translation still proceeds with fallback fonts.
 */
export async function syncFonts(settings: Settings): Promise<void> {
  const fonts = await collectFonts(settings);
  if (fonts.length === 0) return;
  try {
    const { summary, results } = await api.upsertAssets(fonts);
    if (summary.succeeded > 0) {
      logger.success(`Synced ${summary.succeeded} font(s)`);
    }
    for (const result of results) {
      if (result.status === 'failed') {
        logger.warn(
          `Font sync failed for ${result.fileName}; continuing without it: ${result.error}`
        );
        recordWarning('failed_upload', result.fileName, result.error);
      }
    }
  } catch (error) {
    logger.warn(
      `Font sync failed; continuing without provisioned fonts: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
