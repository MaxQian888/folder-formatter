import { randomUUID } from 'node:crypto';

import { window, workspace } from 'vscode';

import { loadConfig } from './config';
import { LARGE_RUN_THRESHOLD } from './constants';
import { buildDryRunReport } from './dry-run';
import { isOperationAborted, OperationAborted } from './errors';
import { queryFiles } from './file-query';
import { runFormatLoop } from './format-loop';
import { GitNotAvailable } from './git-api';
import { ht } from './host-i18n';
import {
  confirmStart,
  requestGlob,
  selectWorkspaceFolder,
  useDefaultExcludes,
} from './prompts';
import { getRuntime } from './runtime';

import type { HistoryStore } from './history';
import type { FormatFilesLogger } from './logger';
import type { DryRunReport, FileResultEntry, FormatFilesRunMode, RunHistoryEntry } from '@shared/messages';
import type { ExtensionContext, Uri } from 'vscode';

export interface RunFormatFilesDeps {
  context: ExtensionContext;
  logger: FormatFilesLogger;
  history: HistoryStore;
  /** Hook for the webview panel — invoked with run lifecycle events. */
  notify?: (event: RunNotification) => void;
}

export type RunNotification
  = | { kind: 'started'; runId: string; mode: FormatFilesRunMode; timestamp: number; totalFiles: number }
    | { kind: 'progress'; runId: string; processed: number; total: number; currentFile: string }
    | { kind: 'fileDone'; runId: string; result: FileResultEntry }
    | { kind: 'completed'; runId: string; entry: RunHistoryEntry }
    | { kind: 'dryRun'; report: DryRunReport };

interface RunOptions {
  mode: FormatFilesRunMode;
  /** Folder URI surfaced from the explorer context menu (mode === 'folder'). */
  inFolder?: Uri;
}

async function maybeWarnLargeRun(fileCount: number): Promise<void> {
  if (fileCount < LARGE_RUN_THRESHOLD)
    return;
  const continueLabel = ht('host.confirmContinue');
  const choice = await window.showWarningMessage(
    ht('host.confirmLargeRun', { count: fileCount }),
    { modal: true },
    continueLabel,
    ht('host.confirmCancel'),
  );
  if (choice !== continueLabel)
    throw new OperationAborted('User cancelled large-run confirmation.');
}

export async function runFormatFiles(
  opts: RunOptions,
  deps: RunFormatFilesDeps,
): Promise<void> {
  const { logger, history, notify } = deps;
  const startedAt = Date.now();
  const runId = randomUUID();
  let totalFiles = 0;
  let processed = 0;
  let status: RunHistoryEntry['status'] = 'completed';
  let workspaceFolderName: string | undefined;
  let errorMessage: string | undefined;
  let fileResults: FileResultEntry[] | undefined;

  logger.show(true);
  logger.appendDivider();
  logger.info('runFormatFiles', `start mode=${opts.mode} runId=${runId}`);

  try {
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0)
      throw new OperationAborted(ht('host.noWorkspace'));

    const folder = await selectWorkspaceFolder(opts.inFolder);
    workspaceFolderName = folder.name;
    logger.info('runFormatFiles', `workspaceFolder=${folder.name} (${folder.uri.fsPath})`);

    const config = loadConfig(folder.uri);
    logger.debug(
      'runFormatFiles',
      `config: extensions=[${config.extensionsToInclude.join(',')}] excludedFolders=[${config.excludedFolders.join(',')}] excludePattern=[${config.excludePattern.join(',')}] inherit=${config.inheritWorkspaceExcludedFiles} organize=${config.runOrganizeImports} gitignore=${config.useGitIgnore}`,
    );

    let globs: string[] | undefined;
    let skipExcludes = false;
    let folderUri: Uri | undefined;

    switch (opts.mode) {
      case 'glob':
        globs = await requestGlob();
        skipExcludes = !(await useDefaultExcludes());
        break;
      case 'folder':
        folderUri = opts.inFolder ?? folder.uri;
        break;
      case 'workspace':
        folderUri = folder.uri;
        break;
      case 'gitChanged':
        break;
    }

    const queryResult = await queryFiles({
      mode: opts.mode,
      workspaceFolder: folder,
      folderUri,
      globs,
      config,
      skipExcludes,
      logger,
    });

    totalFiles = queryResult.files.length;

    if (totalFiles === 0) {
      logger.info('runFormatFiles', 'no files matched');
      const message = opts.mode === 'gitChanged'
        ? ht('host.gitNoChanges')
        : ht('host.noFilesMatched');
      await window.showInformationMessage(message);
      return;
    }

    await maybeWarnLargeRun(totalFiles);

    if (config.dryRunFirst) {
      // Build a lightweight pre-flight report and park execution until the
      // webview replies via `formatFiles/confirmDryRun`. If no panel is open,
      // fall back to the regular modal QuickPick prompt.
      const report = buildDryRunReport({
        runId,
        mode: opts.mode,
        files: queryResult.files,
        history,
      });
      logger.info(
        'runFormatFiles',
        `dry-run: total=${report.total} eta=${report.etaMs}ms unknownExts=[${report.unknownFormatterExtensions.join(',')}]`,
      );

      let proceed = true;
      try {
        const runtime = getRuntime();
        if (runtime.panelNotify) {
          notify?.({ kind: 'dryRun', report });
          proceed = await new Promise<boolean>((resolve) => {
            runtime.pendingDryRunDecisions.set(runId, { resolve });
          });
        }
        else {
          await confirmStart(totalFiles);
        }
      }
      catch (err) {
        logger.warn('runFormatFiles', 'dry-run gate skipped (runtime not ready)', err);
      }

      if (!proceed)
        throw new OperationAborted('Dry-run cancelled by user.');
    }
    else {
      await confirmStart(totalFiles);
    }

    notify?.({
      kind: 'started',
      runId,
      mode: opts.mode,
      timestamp: startedAt,
      totalFiles,
    });

    const result = await runFormatLoop({
      files: queryResult.files,
      config,
      logger,
      onProgress: (snap) => {
        notify?.({
          kind: 'progress',
          runId,
          processed: snap.processed,
          total: snap.total,
          currentFile: snap.message,
        });
      },
      onFileDone: (fileResult) => {
        notify?.({ kind: 'fileDone', runId, result: fileResult });
      },
    });

    processed = result.processed;
    fileResults = result.fileResults;
    logger.info('runFormatFiles', `completed processed=${processed} failed=${result.failed} total=${result.total}`);
  }
  catch (err) {
    if (isOperationAborted(err)) {
      status = 'aborted';
      errorMessage = err.message;
      logger.info('runFormatFiles', `aborted: ${err.message}`);
    }
    else if (err instanceof GitNotAvailable) {
      status = 'failed';
      errorMessage = err.message;
      logger.warn('runFormatFiles', err.message);
      void window.showErrorMessage(ht('host.gitNotAvailable'));
    }
    else {
      status = 'failed';
      const e = err instanceof Error ? err : new Error(String(err));
      errorMessage = e.message;
      logger.error('runFormatFiles', e.message, e);
      void window.showErrorMessage(ht('host.failure', { message: e.message }));
    }
  }
  finally {
    // If the run aborted mid-dry-run-gate, drop the parked deferred so the
    // runtime map doesn't leak.
    try {
      getRuntime().pendingDryRunDecisions.delete(runId);
    }
    catch {}

    const entry: RunHistoryEntry = {
      id: runId,
      timestamp: startedAt,
      mode: opts.mode,
      fileCount: totalFiles,
      processed,
      durationMs: Date.now() - startedAt,
      status,
      workspaceFolder: workspaceFolderName,
      errorMessage,
      fileResults,
    };
    try {
      await history.add(entry);
    }
    catch (err) {
      logger.warn('runFormatFiles', 'failed to persist history entry', err);
    }
    notify?.({ kind: 'completed', runId, entry });
  }
}
