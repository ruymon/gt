import { createDiagnosticMessage } from './diagnostics';
import { gtInstanceLogger } from './logger';

const warnedDeprecations = new Set<string>();

/**
 * Warns that `deprecated` (a method or input, such as `GT.getProjectInfo()` or
 * `GT.createBranch({ branchName })`) is deprecated in favor of `replacement`,
 * once per loaded copy of this module: a process that loads both the CJS and
 * ESM builds warns once per build.
 */
export function warnDeprecated(deprecated: string, replacement: string): void {
  if (warnedDeprecations.has(deprecated)) return;
  warnedDeprecations.add(deprecated);
  gtInstanceLogger.warn(
    createDiagnosticMessage({
      source: 'generaltranslation',
      severity: 'Warning',
      whatHappened: `\`${deprecated}\` is deprecated and will be removed in the next major version`,
      fix: `Use \`${replacement}\` instead`,
    })
  );
}
