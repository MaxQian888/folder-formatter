import { extensions } from 'vscode';

import { isPathUnder } from './config-utils';

import type { GitScopeConfig } from '@shared/messages';
import type { Disposable, Uri, WorkspaceFolder } from 'vscode';

// ----------------------------------------------------------------------------
// Minimal type surface for the built-in Git extension. We avoid taking a hard
// dependency on `@types/vscode-extension-git` (not part of the standard
// distribution) by typing only the bits we actually call. Mirrors the relevant
// portions of `extensions/git/src/api/git.d.ts` in the VSCode source tree.
// ----------------------------------------------------------------------------

export const GitStatus = {
  INDEX_MODIFIED: 0,
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  INDEX_COPIED: 4,
  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
  IGNORED: 8,
  INTENT_TO_ADD: 9,
  INTENT_TO_RENAME: 10,
  TYPE_CHANGED: 11,
  ADDED_BY_US: 12,
  ADDED_BY_THEM: 13,
  DELETED_BY_US: 14,
  DELETED_BY_THEM: 15,
  BOTH_ADDED: 16,
  BOTH_DELETED: 17,
  BOTH_MODIFIED: 18,
} as const;
export type GitStatusValue = typeof GitStatus[keyof typeof GitStatus];

interface GitChange {
  readonly uri: Uri;
  readonly originalUri: Uri;
  readonly renameUri?: Uri;
  readonly status: GitStatusValue;
}

interface GitRepositoryState {
  readonly workingTreeChanges: ReadonlyArray<GitChange>;
  readonly indexChanges: ReadonlyArray<GitChange>;
}

interface GitRepository {
  readonly rootUri: Uri;
  readonly state: GitRepositoryState;
}

interface GitAPI {
  readonly repositories: ReadonlyArray<GitRepository>;
  getRepository: (uri: Uri) => GitRepository | null;
  onDidOpenRepository: (listener: (repo: GitRepository) => void) => Disposable;
}

interface GitExtension {
  readonly enabled: boolean;
  getAPI: (version: 1) => GitAPI;
}

export class GitNotAvailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitNotAvailable';
  }
}

/**
 * Lazily activate the built-in Git extension and return its API surface.
 * Throws `GitNotAvailable` if the extension is missing, disabled, or has not
 * been activated yet (a rare race only if some other extension explicitly
 * disables it).
 */
async function loadGitApi(): Promise<GitAPI> {
  const ext = extensions.getExtension<GitExtension>('vscode.git');
  if (!ext)
    throw new GitNotAvailable('Built-in Git extension (vscode.git) is not available.');
  const exports = ext.isActive ? ext.exports : await ext.activate();
  if (!exports?.enabled)
    throw new GitNotAvailable('Built-in Git extension is disabled.');
  return exports.getAPI(1);
}

/**
 * Pick the repository that hosts the given workspace folder. Falls back to the
 * longest-prefix match against `api.repositories` when `getRepository` returns
 * null (e.g. the folder is itself nested below the repo root).
 */
function findRepository(api: GitAPI, folder: WorkspaceFolder): GitRepository | null {
  const direct = api.getRepository(folder.uri);
  if (direct)
    return direct;

  const folderPath = folder.uri.fsPath;
  let best: { repo: GitRepository; len: number } | null = null;
  for (const repo of api.repositories) {
    const root = repo.rootUri.fsPath;
    if (isPathUnder(root, folderPath) && (!best || root.length > best.len))
      best = { repo, len: root.length };
  }
  return best?.repo ?? null;
}

/**
 * Wait briefly for the Git extension to scan the workspace if it hasn't yet.
 * The extension activates synchronously but its initial repository discovery
 * is asynchronous; on cold workspaces `api.repositories` may be empty for a
 * tick.
 */
async function waitForRepositories(api: GitAPI, folder: WorkspaceFolder, timeoutMs: number): Promise<GitRepository | null> {
  const initial = findRepository(api, folder);
  if (initial)
    return initial;
  return await new Promise<GitRepository | null>((resolve) => {
    let sub: Disposable | undefined;
    const timer = setTimeout(() => {
      sub?.dispose();
      resolve(findRepository(api, folder));
    }, timeoutMs);
    sub = api.onDidOpenRepository(() => {
      const found = findRepository(api, folder);
      if (found) {
        clearTimeout(timer);
        sub?.dispose();
        resolve(found);
      }
    });
  });
}

export interface GitChangesSnapshot {
  /** Files added to the index (`git add`). */
  staged: Uri[];
  /** Tracked files with unstaged modifications. */
  modified: Uri[];
  /** Files Git has not yet started tracking. */
  untracked: Uri[];
  repoRoot: Uri;
}

/**
 * Read the current working-tree state for the repo hosting `folder` and bucket
 * each change into staged / modified / untracked. Deleted entries are filtered
 * out (no file to format). Renames use `change.uri` (post-rename path).
 *
 * The returned URIs are de-duplicated within each bucket; the full union may
 * still contain the same URI in multiple buckets (e.g. staged AND modified).
 */
export async function readGitChanges(folder: WorkspaceFolder): Promise<GitChangesSnapshot> {
  const api = await loadGitApi();
  const repo = await waitForRepositories(api, folder, 2000);
  if (!repo)
    throw new GitNotAvailable(`No Git repository found for workspace folder "${folder.name}".`);

  const staged: Uri[] = [];
  const modified: Uri[] = [];
  const untracked: Uri[] = [];

  const seenStaged = new Set<string>();
  const seenModified = new Set<string>();
  const seenUntracked = new Set<string>();

  for (const change of repo.state.indexChanges) {
    if (change.status === GitStatus.INDEX_DELETED)
      continue;
    const key = change.uri.toString();
    if (!seenStaged.has(key)) {
      seenStaged.add(key);
      staged.push(change.uri);
    }
  }

  for (const change of repo.state.workingTreeChanges) {
    if (
      change.status === GitStatus.DELETED
      || change.status === GitStatus.IGNORED
      || change.status === GitStatus.DELETED_BY_US
      || change.status === GitStatus.DELETED_BY_THEM
      || change.status === GitStatus.BOTH_DELETED
    ) {
      continue;
    }
    const key = change.uri.toString();
    if (change.status === GitStatus.UNTRACKED) {
      if (!seenUntracked.has(key)) {
        seenUntracked.add(key);
        untracked.push(change.uri);
      }
    }
    else {
      if (!seenModified.has(key)) {
        seenModified.add(key);
        modified.push(change.uri);
      }
    }
  }

  return { staged, modified, untracked, repoRoot: repo.rootUri };
}

/**
 * Project a `GitChangesSnapshot` down to a single ordered URI list per the
 * user's `gitScope` settings. Order is staged → modified → untracked, matching
 * a typical pre-commit mental model.
 */
export function projectScope(snapshot: GitChangesSnapshot, scope: GitScopeConfig): Uri[] {
  const out: Uri[] = [];
  const seen = new Set<string>();

  function push(arr: Uri[]): void {
    for (const u of arr) {
      const key = u.toString();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(u);
      }
    }
  }

  if (scope.includeStaged)
    push(snapshot.staged);
  if (scope.includeModified)
    push(snapshot.modified);
  if (scope.includeUntracked)
    push(snapshot.untracked);

  return out;
}
