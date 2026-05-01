import { commands, ConfigurationTarget, window, workspace } from 'vscode';

import { loadConfig } from '../format-files/config';
import {
  normalizeFolderList,
  parseExtensions,
  parseGlobList,
} from '../format-files/config-utils';
import { COMMAND_IDS, CONFIG_SECTION } from '../format-files/constants';
import { resolveLocale } from '../format-files/locale';
import { getRuntime } from '../format-files/runtime';

import { MainPanel } from './panel';

import type {
  FormatFilesConfigShape,
  WebviewToExtensionMessage,
} from '@shared/messages';
import type { ExtensionContext } from 'vscode';

type Handler<T extends WebviewToExtensionMessage['type']> = (
  msg: Extract<WebviewToExtensionMessage, { type: T }>,
  ctx: ExtensionContext,
) => void | Promise<void>;

function readExtensionVersion(): string {
  try {
    const runtime = getRuntime();
    const pkg = runtime.context.extension?.packageJSON as { version?: string } | undefined;
    return pkg?.version ?? '0.0.0';
  }
  catch {
    return '0.0.0';
  }
}

type HandlerMap = {
  [K in WebviewToExtensionMessage['type']]: Handler<K>;
};

function activeWorkspaceUri() {
  return workspace.workspaceFolders?.[0]?.uri;
}

function pushFullState(): void {
  const panel = MainPanel.currentPanel;
  if (!panel)
    return;
  const runtime = getRuntime();
  const config = loadConfig(activeWorkspaceUri());
  void panel.post({
    type: 'formatFiles/state',
    config,
    history: runtime.history.list(),
    version: readExtensionVersion(),
    isRunning: runtime.isRunning,
    locale: resolveLocale(config.locale),
  });
}

let lastConfigPayload: string | undefined;

function pushConfig(): void {
  const panel = MainPanel.currentPanel;
  if (!panel)
    return;
  const config = loadConfig(activeWorkspaceUri());
  const locale = resolveLocale(config.locale);
  const serialized = JSON.stringify({ config, locale });
  if (serialized === lastConfigPayload)
    return;
  lastConfigPayload = serialized;
  void panel.post({ type: 'formatFiles/configChanged', config, locale });
}

function pushHistory(): void {
  const panel = MainPanel.currentPanel;
  if (!panel)
    return;
  const runtime = getRuntime();
  void panel.post({
    type: 'formatFiles/historyChanged',
    history: runtime.history.list(),
  });
}

/**
 * Coerce an incoming webview value into the shape expected by VSCode's
 * configuration store. The webview UI sends arrays as arrays and strings as
 * strings, but `extensionsToInclude` and `excludePattern` are *strings* in
 * the manifest (comma-joined), so we normalize.
 */
function coerceSettingValue(key: keyof FormatFilesConfigShape, value: unknown): unknown {
  switch (key) {
    case 'extensionsToInclude':
      if (Array.isArray(value))
        return parseExtensions(value.join(',')).map(e => e.replace(/^\./, '')).join(',');
      if (typeof value === 'string')
        return parseExtensions(value).map(e => e.replace(/^\./, '')).join(',');
      return '';
    case 'excludePattern':
      if (Array.isArray(value))
        return parseGlobList(value.join(',')).join(',');
      if (typeof value === 'string')
        return parseGlobList(value).join(',');
      return '';
    case 'excludedFolders':
      if (typeof value === 'string')
        return normalizeFolderList(value.split(','), []);
      return normalizeFolderList(value, []);
    case 'logLevel':
    case 'inheritWorkspaceExcludedFiles':
    case 'runOrganizeImports':
    case 'useGitIgnore':
    case 'dryRunFirst':
    case 'locale':
      return value;
    case 'gitScope':
      // The webview never sends the whole `gitScope` object — sub-keys are
      // updated individually via dotted paths handled below. Pass through
      // as-is for safety.
      return value;
    default:
      return value;
  }
}

const handlers: HandlerMap = {
  'hello': (msg) => {
    void window.showInformationMessage(msg.data);
  },
  'log': (msg) => {
    const runtime = getRuntime();
    runtime.logger[msg.level]('webview', msg.message);
  },
  'webview/error': (msg) => {
    const runtime = getRuntime();
    runtime.logger.error(
      'webview',
      `${msg.error.name}: ${msg.error.message}`,
      msg.error.stack ? { stack: msg.error.stack } : undefined,
    );
    void window.showErrorMessage(`Webview error: ${msg.error.message}`);
  },
  'webview/ready': () => {
    pushFullState();
  },

  'formatFiles/getState': () => {
    pushFullState();
  },

  'formatFiles/updateSetting': async (msg) => {
    const target = msg.target ?? 'workspace';
    const cfgTarget = target === 'global'
      ? ConfigurationTarget.Global
      : target === 'workspaceFolder'
        ? ConfigurationTarget.WorkspaceFolder
        : ConfigurationTarget.Workspace;

    const cfg = workspace.getConfiguration(
      CONFIG_SECTION,
      cfgTarget === ConfigurationTarget.WorkspaceFolder ? activeWorkspaceUri() : undefined,
    );
    try {
      // `gitScope` is a logical group surfaced as three flat settings in the
      // manifest. The webview always sends the full nested object; we fan it
      // out into the three concrete keys so VSCode persists each independently.
      if (msg.key === 'gitScope') {
        const next = (msg.value ?? {}) as Partial<{
          includeStaged: boolean;
          includeModified: boolean;
          includeUntracked: boolean;
        }>;
        if ('includeStaged' in next)
          await cfg.update('gitScope.includeStaged', next.includeStaged, cfgTarget);
        if ('includeModified' in next)
          await cfg.update('gitScope.includeModified', next.includeModified, cfgTarget);
        if ('includeUntracked' in next)
          await cfg.update('gitScope.includeUntracked', next.includeUntracked, cfgTarget);
      }
      else {
        const value = coerceSettingValue(msg.key, msg.value);
        await cfg.update(msg.key, value, cfgTarget);
      }
      // Push the freshly resolved config back so the webview reflects whatever
      // VSCode actually persisted (folder-scoped vs workspace-scoped fall-throughs).
      pushConfig();
    }
    catch (err) {
      const runtime = getRuntime();
      runtime.logger.error(
        'updateSetting',
        `failed to update ${String(msg.key)}`,
        err,
      );
      void window.showErrorMessage(
        `Failed to update setting ${String(msg.key)}: ${(err as Error).message}`,
      );
    }
  },

  'formatFiles/runWorkspace': async () => {
    await commands.executeCommand(COMMAND_IDS.workspace);
  },

  'formatFiles/runFromGlob': async () => {
    await commands.executeCommand(COMMAND_IDS.fromGlob);
  },

  'formatFiles/runGitChanged': async () => {
    await commands.executeCommand(COMMAND_IDS.gitChanged);
  },

  'formatFiles/confirmDryRun': (msg) => {
    const runtime = getRuntime();
    const pending = runtime.pendingDryRunDecisions.get(msg.runId);
    if (pending) {
      runtime.pendingDryRunDecisions.delete(msg.runId);
      pending.resolve(msg.proceed);
    }
    else {
      runtime.logger.warn('confirmDryRun', `no pending decision for runId=${msg.runId}`);
    }
  },

  'formatFiles/clearHistory': async () => {
    const runtime = getRuntime();
    await runtime.history.clear();
    pushHistory();
  },

  'formatFiles/openOutputChannel': () => {
    const runtime = getRuntime();
    runtime.logger.show(true);
  },
};

export async function route(msg: WebviewToExtensionMessage, ctx: ExtensionContext): Promise<void> {
  const handler = handlers[msg.type] as Handler<typeof msg.type>;
  if (!handler) {
    try {
      const runtime = getRuntime();
      runtime.logger.warn('route', `no handler registered for message type: ${msg.type}`);
    }
    catch { /* runtime not yet ready */ }
    return;
  }
  try {
    await handler(msg as never, ctx);
  }
  catch (err) {
    try {
      const runtime = getRuntime();
      runtime.logger.error('route', `handler for ${msg.type} threw`, err);
    }
    catch { /* runtime not yet ready */ }
  }
}

/**
 * Wire workspace listeners that the panel relies on for live updates.
 * Called from `activate(context)` so the listeners outlive any single panel.
 */
export function registerPanelStateListeners(context: ExtensionContext): void {
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION))
        pushConfig();
    }),
  );
}
