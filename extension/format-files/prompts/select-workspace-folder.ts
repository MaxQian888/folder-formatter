import { window, workspace } from 'vscode';

import { isPathUnder } from '../config-utils';
import { OperationAborted } from '../errors';

import type { Uri, WorkspaceFolder } from 'vscode';

/**
 * Resolve which workspace folder a Format Files invocation targets.
 *
 *   - 0 folders: throw `OperationAborted` (caller surfaces a friendly error).
 *   - 1 folder: auto-pick.
 *   - N folders + `inFolder` provided: prefix-match each folder's `fsPath`
 *     against `inFolder.fsPath` (covers the case where a user right-clicked
 *     a nested folder in the explorer).
 *   - N folders, no hint: present a QuickPick keyed by folder name.
 */
export async function selectWorkspaceFolder(inFolder?: Uri): Promise<WorkspaceFolder> {
  const folders = workspace.workspaceFolders;
  if (!folders || folders.length === 0)
    throw new OperationAborted('No workspace folder is open.');

  if (folders.length === 1)
    return folders[0]!;

  if (inFolder) {
    const target = inFolder.fsPath;
    // Prefer the longest matching prefix in case workspace folders nest.
    let best: WorkspaceFolder | undefined;
    let bestLen = -1;
    for (const folder of folders) {
      const root = folder.uri.fsPath;
      if (isPathUnder(root, target) && root.length > bestLen) {
        best = folder;
        bestLen = root.length;
      }
    }
    if (best)
      return best;
  }

  const picked = await window.showQuickPick(
    folders.map(f => ({ label: f.name, description: f.uri.fsPath, folder: f })),
    {
      placeHolder: 'Select a workspace folder to format',
      ignoreFocusOut: true,
    },
  );
  if (!picked)
    throw new OperationAborted('Workspace folder selection cancelled.');
  return picked.folder;
}
