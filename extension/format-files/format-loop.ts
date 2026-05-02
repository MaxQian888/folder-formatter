import { CodeActionKind, commands, ProgressLocation, Range, window, workspace, WorkspaceEdit } from 'vscode';

import { OperationAborted } from './errors';
import { ht } from './host-i18n';

import type { FormatFilesConfig } from './config';
import type { FormatFilesLogger } from './logger';
import type { FileResultEntry } from '@shared/messages';
import type { CancellationToken, CodeAction, Progress, TextDocument, TextEdit, Uri } from 'vscode';

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

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

async function applyOrganizeImports(
  doc: TextDocument,
  logger: FormatFilesLogger,
): Promise<SafeExecuteOutcome> {
  try {
    const fullRange = new Range(0, 0, doc.lineCount, 0);
    const actions = await commands.executeCommand<CodeAction[] | undefined>(
      'vscode.executeCodeActionProvider',
      doc.uri,
      fullRange,
      CodeActionKind.SourceOrganizeImports.value,
    );
    for (const action of actions ?? []) {
      if (action.edit)
        await workspace.applyEdit(action.edit);
      if (action.command) {
        await commands.executeCommand(
          action.command.command,
          ...(action.command.arguments ?? []),
        );
      }
    }
    return { ok: true };
  }
  catch (err) {
    logger.warn('applyOrganizeImports', `failed for ${doc.uri.fsPath}`, err);
    return { ok: false, error: toError(err) };
  }
}

async function applyFormatProvider(
  doc: TextDocument,
  logger: FormatFilesLogger,
): Promise<SafeExecuteOutcome> {
  try {
    const edits = await commands.executeCommand<TextEdit[] | undefined>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
    );
    if (edits && edits.length > 0) {
      const we = new WorkspaceEdit();
      we.set(doc.uri, edits);
      const applied = await workspace.applyEdit(we);
      if (!applied)
        return { ok: false, error: new Error('workspace.applyEdit returned false') };
    }
    return { ok: true };
  }
  catch (err) {
    logger.warn('applyFormatProvider', `failed for ${doc.uri.fsPath}`, err);
    return { ok: false, error: toError(err) };
  }
}

async function saveDocument(
  doc: TextDocument,
  logger: FormatFilesLogger,
): Promise<SafeExecuteOutcome> {
  if (!doc.isDirty)
    return { ok: true };
  try {
    const saved = await doc.save();
    if (!saved)
      return { ok: false, error: new Error('TextDocument.save() returned false') };
    return { ok: true };
  }
  catch (err) {
    logger.warn('saveDocument', `failed for ${doc.uri.fsPath}`, err);
    return { ok: false, error: toError(err) };
  }
}

/**
 * Run the format loop with a notification-style progress reporter and a
 * cancellation token. Per-file outcome is captured and surfaced both via the
 * `onFileDone` callback and the aggregated `fileResults` array on the result.
 *
 * Files are formatted via the document's formatting/code-action providers and
 * saved through `TextDocument.save()`. Editors are never shown, which avoids
 * the visible open/close flicker and the "unsaved changes" prompt that an
 * editor-based flow would trigger if focus drifted between files.
 *
 * Status classification:
 *   - `skipped`   — `openTextDocument` failed (binary, permission, etc.)
 *   - `failed`    — provider/apply/save threw or reported failure
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

        const before = doc.getText();
        const failures: string[] = [];

        if (config.runOrganizeImports) {
          const r = await applyOrganizeImports(doc, logger);
          if (!r.ok && r.error)
            failures.push(`organizeImports: ${r.error.message}`);
        }

        const fmt = await applyFormatProvider(doc, logger);
        if (!fmt.ok && fmt.error)
          failures.push(`formatDocument: ${fmt.error.message}`);

        const sav = await saveDocument(doc, logger);
        if (!sav.ok && sav.error)
          failures.push(`save: ${sav.error.message}`);

        // After save the in-memory document reflects on-disk content.
        const after = doc.getText();

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
