import { commands, ProgressLocation, ViewColumn, window, workspace } from 'vscode';

import { OperationAborted } from './errors';
import { ht } from './host-i18n';

import type { FormatFilesConfig } from './config';
import type { FormatFilesLogger } from './logger';
import type { FileResultEntry } from '@shared/messages';
import type { CancellationToken, Progress, TextDocument, Uri } from 'vscode';

export interface FormatLoopProgress {
  message: string;
  processed: number;
  total: number;
}

export interface FormatLoopResult {
  processed: number;
  failed: number;
  total: number;
  fileResults: FileResultEntry[];
}

export interface FormatLoopOptions {
  files: Uri[];
  config: FormatFilesConfig;
  logger: FormatFilesLogger;
  onProgress?: (snapshot: FormatLoopProgress) => void;
  /** Called once per file after its outcome is known, in iteration order. */
  onFileDone?: (result: FileResultEntry) => void;
}

const FILE_RESULTS_CAP = 1000;

async function tryOpenDocument(
  uri: Uri,
  logger: FormatFilesLogger,
): Promise<TextDocument | undefined> {
  try {
    return await workspace.openTextDocument(uri);
  }
  catch (err) {
    logger.warn('tryOpenDocument', `skipping ${uri.fsPath}`, err);
    return undefined;
  }
}

interface SafeExecuteOutcome {
  ok: boolean;
  error?: Error;
}

async function safeExecute(
  commandId: string,
  logger: FormatFilesLogger,
  source: string,
  filePath: string,
): Promise<SafeExecuteOutcome> {
  try {
    await commands.executeCommand(commandId);
    return { ok: true };
  }
  catch (err) {
    logger.warn(source, `'${commandId}' failed for ${filePath}`, err);
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Run the format loop with a notification-style progress reporter and a
 * cancellation token. Per-file outcome is captured and surfaced both via the
 * `onFileDone` callback and the aggregated `fileResults` array on the result.
 *
 * Status classification:
 *   - `skipped`   — `openTextDocument` failed (binary, permission, etc.)
 *   - `failed`    — format / save command threw, OR `showTextDocument` failed
 *   - `unchanged` — file ran clean but content matches the pre-format snapshot
 *   - `ok`        — file ran clean and content changed
 */
export async function runFormatLoop(opts: FormatLoopOptions): Promise<FormatLoopResult> {
  const { files, config, logger, onProgress, onFileDone } = opts;
  const total = files.length;
  let processed = 0;
  let failed = 0;
  const fileResults: FileResultEntry[] = [];

  function pushResult(entry: FileResultEntry): void {
    if (fileResults.length < FILE_RESULTS_CAP)
      fileResults.push(entry);
    onFileDone?.(entry);
  }

  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      cancellable: true,
      title: 'Formatting documents',
    },
    async (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => {
      const incrementPerFile = total > 0 ? 100 / total : 0;
      for (const uri of files) {
        if (token.isCancellationRequested) {
          await window.showInformationMessage(
            ht('host.cancelled', {
              processed,
              total,
              plural: total === 1 ? '' : 's',
            }),
            { modal: true },
          );
          throw new OperationAborted('Cancelled by user.');
        }

        const relative = workspace.asRelativePath(uri, false);
        progress.report({ increment: incrementPerFile, message: relative });
        onProgress?.({ message: relative, processed, total });

        const fileStart = Date.now();

        const doc = await tryOpenDocument(uri, logger);
        if (!doc) {
          failed++;
          pushResult({
            uri: uri.toString(),
            relativePath: relative,
            status: 'skipped',
            durationMs: Date.now() - fileStart,
            errorMessage: 'document could not be opened',
          });
          continue;
        }

        try {
          await window.showTextDocument(doc, { preview: false, viewColumn: ViewColumn.One });
        }
        catch (err) {
          logger.warn('runFormatLoop', `failed to show ${uri.fsPath}`, err);
          failed++;
          pushResult({
            uri: uri.toString(),
            relativePath: relative,
            status: 'failed',
            durationMs: Date.now() - fileStart,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        const before = doc.getText();
        const failures: string[] = [];

        if (config.runOrganizeImports) {
          const r = await safeExecute('editor.action.organizeImports', logger, 'organizeImports', uri.fsPath);
          if (!r.ok && r.error)
            failures.push(`organizeImports: ${r.error.message}`);
        }

        const fmt = await safeExecute('editor.action.formatDocument', logger, 'formatDocument', uri.fsPath);
        if (!fmt.ok && fmt.error)
          failures.push(`formatDocument: ${fmt.error.message}`);

        const sav = await safeExecute('workbench.action.files.save', logger, 'save', uri.fsPath);
        if (!sav.ok && sav.error)
          failures.push(`save: ${sav.error.message}`);

        // Re-read post-save content. `doc.getText()` reflects on-disk content
        // because save() flushes the editor buffer.
        const after = doc.getText();

        await safeExecute('workbench.action.closeActiveEditor', logger, 'closeEditor', uri.fsPath);

        const durationMs = Date.now() - fileStart;
        if (failures.length > 0) {
          failed++;
          pushResult({
            uri: uri.toString(),
            relativePath: relative,
            status: 'failed',
            durationMs,
            errorMessage: failures.join('; '),
          });
        }
        else if (before === after) {
          processed++;
          pushResult({
            uri: uri.toString(),
            relativePath: relative,
            status: 'unchanged',
            durationMs,
          });
        }
        else {
          processed++;
          pushResult({
            uri: uri.toString(),
            relativePath: relative,
            status: 'ok',
            durationMs,
          });
        }

        onProgress?.({ message: relative, processed, total });
      }
    },
  );

  await window.showInformationMessage(
    ht('host.completed', {
      processed,
      plural: processed === 1 ? '' : 's',
    }),
    { modal: true },
  );

  return { processed, failed, total, fileResults };
}
