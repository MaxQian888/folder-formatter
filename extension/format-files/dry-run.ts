import { posix } from 'node:path';

import { workspace } from 'vscode';

import { KNOWN_FORMATTABLE_EXTENSIONS } from './constants';

import type { HistoryStore } from './history';
import type { DryRunReport, FormatFilesRunMode, RunHistoryEntry } from '@shared/messages';
import type { Uri } from 'vscode';

const FALLBACK_MS_PER_FILE = 200;
const FIRST_FILES_LIMIT = 20;

/**
 * Compute a static average of "ms per processed file" across recent successful
 * runs. Falls back to a 200ms heuristic when history is empty or every run has
 * processed=0.
 */
function computeAverageMsPerFile(history: HistoryStore): number {
  const entries = history.list().filter((e: RunHistoryEntry) => e.processed > 0 && e.durationMs > 0);
  if (entries.length === 0)
    return FALLBACK_MS_PER_FILE;
  // Cap to the last 10 entries so older outlier runs don't skew the estimate.
  const recent = entries.slice(0, 10);
  const total = recent.reduce((acc, e) => acc + (e.durationMs / e.processed), 0);
  return Math.round(total / recent.length);
}

function extOf(uri: Uri): string {
  // posix.extname returns e.g. '.ts' or '' for files without an extension.
  // We use the URI path (which is always POSIX) rather than `fsPath` to avoid
  // platform-specific edge cases.
  return posix.extname(uri.path).toLowerCase();
}

/**
 * Build a lightweight pre-flight report describing what a run would touch:
 * count, by-extension breakdown, ETA, and any extensions that fall outside
 * the static `KNOWN_FORMATTABLE_EXTENSIONS` whitelist (advisory only — the
 * run is never blocked on that signal).
 *
 * No file content is read; this is intentionally cheap so it can run for
 * thousand-file workspaces in a few milliseconds.
 */
export function buildDryRunReport(args: {
  runId: string;
  mode: FormatFilesRunMode;
  files: Uri[];
  history: HistoryStore;
}): DryRunReport {
  const { runId, mode, files, history } = args;
  const total = files.length;

  const byExtension: Record<string, number> = {};
  for (const uri of files) {
    const ext = extOf(uri) || '(no extension)';
    byExtension[ext] = (byExtension[ext] ?? 0) + 1;
  }

  const known = new Set(KNOWN_FORMATTABLE_EXTENSIONS.map(e => e.toLowerCase()));
  const unknownFormatterExtensions = Object.keys(byExtension)
    .filter(ext => ext !== '(no extension)' && !known.has(ext))
    .sort();

  const avg = computeAverageMsPerFile(history);
  const etaMs = total * avg;

  const firstFiles = files
    .slice(0, FIRST_FILES_LIMIT)
    .map(uri => workspace.asRelativePath(uri, false));

  return {
    runId,
    mode,
    total,
    byExtension,
    etaMs,
    unknownFormatterExtensions,
    firstFiles,
  };
}
