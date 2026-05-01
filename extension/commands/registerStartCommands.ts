import { commands, Uri } from 'vscode';

import { COMMAND_IDS } from '../format-files/constants';
import { runFormatFiles } from '../format-files/run';
import { getRuntime } from '../format-files/runtime';

import type { FormatFilesRunMode } from '@shared/messages';
import type { ExtensionContext } from 'vscode';

interface CommandSpec {
  id: string;
  mode: FormatFilesRunMode;
  /** When `true`, the command receives a Uri argument from the explorer menu. */
  acceptsUri?: boolean;
}

const SPECS: CommandSpec[] = [
  { id: COMMAND_IDS.workspace, mode: 'workspace' },
  { id: COMMAND_IDS.workspaceFolder, mode: 'folder', acceptsUri: true },
  { id: COMMAND_IDS.fromGlob, mode: 'glob' },
  { id: COMMAND_IDS.gitChanged, mode: 'gitChanged' },
];

/**
 * The explorer context menu sometimes hands back URI-shaped objects (e.g.
 * `{ scheme, path, fsPath }`) instead of a real `Uri` instance. Coerce so
 * downstream code can rely on `Uri.joinPath` etc.
 */
function coerceUri(uri: unknown): Uri | undefined {
  if (uri instanceof Uri)
    return uri;
  if (uri && typeof uri === 'object' && 'fsPath' in uri && typeof (uri as { fsPath: unknown }).fsPath === 'string')
    return Uri.file((uri as { fsPath: string }).fsPath);
  return undefined;
}

export function registerStartCommands(context: ExtensionContext): void {
  for (const spec of SPECS) {
    context.subscriptions.push(
      commands.registerCommand(spec.id, async (uriArg?: unknown) => {
        const runtime = getRuntime();
        runtime.isRunning = true;
        try {
          await runFormatFiles(
            { mode: spec.mode, inFolder: spec.acceptsUri ? coerceUri(uriArg) : undefined },
            {
              context,
              logger: runtime.logger,
              history: runtime.history,
              notify: runtime.panelNotify,
            },
          );
        }
        finally {
          runtime.isRunning = false;
        }
      }),
    );
  }
}
