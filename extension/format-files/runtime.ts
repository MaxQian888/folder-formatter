import { createHistoryStore } from './history';
import { createFormatFilesLogger } from './logger';

import type { HistoryStore } from './history';
import type { FormatFilesLogger } from './logger';
import type { ExtensionContext } from 'vscode';

export interface FormatFilesRuntime {
  context: ExtensionContext;
  logger: FormatFilesLogger;
  history: HistoryStore;
  /** Optional sink injected by `panel.ts` to forward run events to the webview. */
  panelNotify?: (event: import('./run').RunNotification) => void;
  /** Track whether a run is currently in flight (for the panel state). */
  isRunning: boolean;
  /**
   * Park a deferred per `runId` while the dry-run confirmation is awaiting a
   * webview reply. Resolved by the `formatFiles/confirmDryRun` message
   * handler with the user's `proceed` choice.
   */
  pendingDryRunDecisions: Map<string, { resolve: (proceed: boolean) => void }>;
  dispose: () => void;
}

let current: FormatFilesRuntime | undefined;

export function initRuntime(context: ExtensionContext): FormatFilesRuntime {
  if (current)
    return current;

  const logger = createFormatFilesLogger();
  const history = createHistoryStore(context.workspaceState);

  current = {
    context,
    logger,
    history,
    panelNotify: undefined,
    isRunning: false,
    pendingDryRunDecisions: new Map(),
    dispose: () => {
      logger.dispose();
      current = undefined;
    },
  };
  return current;
}

export function getRuntime(): FormatFilesRuntime {
  if (!current)
    throw new Error('FormatFiles runtime not initialized. Call initRuntime() in activate() first.');
  return current;
}

export function disposeRuntime(): void {
  current?.dispose();
  current = undefined;
}
