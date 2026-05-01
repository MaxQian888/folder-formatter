import ignore from 'ignore';
import { RelativePattern, Uri, workspace } from 'vscode';

import { getWorkspaceFilesExclude } from './config';
import {
  buildIncludeGlob,
  composeExcludeGlob,
  folderToGlob,
  isPathUnder,
} from './config-utils';
import { projectScope, readGitChanges } from './git-api';

import type { FormatFilesConfig } from './config';
import type { FormatFilesLogger } from './logger';
import type { Ignore } from 'ignore';
import type { CancellationToken, GlobPattern, WorkspaceFolder } from 'vscode';

export type QueryMode = 'workspace' | 'folder' | 'glob' | 'gitChanged';

export interface QueryArgs {
  mode: QueryMode;
  workspaceFolder: WorkspaceFolder;
  /** Required for `mode='folder'`. Defaults to `workspaceFolder.uri` otherwise. */
  folderUri?: Uri;
  /** Required for `mode='glob'`. */
  globs?: string[];
  config: FormatFilesConfig;
  /** When `true`, no exclude/gitignore filtering is applied. */
  skipExcludes: boolean;
  token?: CancellationToken;
  logger?: FormatFilesLogger;
}

export interface QueryResult {
  files: Uri[];
  /** Number of files dropped by the .gitignore post-filter (diagnostic). */
  ignoredByGit: number;
  /** Effective include glob used by the search (diagnostic). */
  includeGlob: string;
  /** Effective exclude glob used by the search, or `null` if none (diagnostic). */
  excludeGlob: string | null;
}

/**
 * Compute the base URI the file walk roots at.
 */
function resolveSearchBase(args: QueryArgs): Uri {
  if (args.mode === 'folder' && args.folderUri)
    return args.folderUri;
  return args.workspaceFolder.uri;
}

/**
 * Build the merged exclude pattern. Returns `null` when caller asked for
 * `skipExcludes` or when the merged list is empty.
 */
export function buildExcludePattern(args: QueryArgs): string | null {
  if (args.skipExcludes)
    return null;

  const parts: string[] = [];

  // 1. User-supplied glob patterns (folderFormatter.excludePattern).
  for (const p of args.config.excludePattern) {
    if (p)
      parts.push(p);
  }

  // 2. Folder-name shortcuts (folderFormatter.excludedFolders).
  for (const folder of args.config.excludedFolders) {
    const glob = folderToGlob(folder);
    if (glob)
      parts.push(glob);
  }

  // 3. Optional inheritance from workspace `files.exclude`.
  if (args.config.inheritWorkspaceExcludedFiles) {
    for (const pattern of getWorkspaceFilesExclude(args.workspaceFolder.uri))
      parts.push(pattern);
  }

  return composeExcludeGlob(parts);
}

async function collectGitignoreFiles(
  root: Uri,
  logger?: FormatFilesLogger,
): Promise<Array<{ dir: string; rules: string }>> {
  const out: Array<{ dir: string; rules: string }> = [];
  const decoder = new TextDecoder('utf-8');

  async function walk(current: Uri, relDir: string): Promise<void> {
    let entries: [string, number][];
    try {
      entries = (await workspace.fs.readDirectory(current)) as [string, number][];
    }
    catch (err) {
      logger?.warn('gitignore-walk', `failed to read ${current.fsPath}`, err);
      return;
    }

    const dirs: Array<{ name: string; uri: Uri }> = [];
    const fileReads: Promise<void>[] = [];
    for (const [name, type] of entries) {
      // FileType: 1=File, 2=Directory, 64=SymbolicLink (bitwise combinable).
      // Skip symlinks defensively to avoid loops.
      const isDir = (type & 2) !== 0;
      const isFile = (type & 1) !== 0;
      const isSymlink = (type & 64) !== 0;
      if (isSymlink)
        continue;

      if (isFile && name === '.gitignore') {
        fileReads.push((async () => {
          try {
            const bytes = await workspace.fs.readFile(Uri.joinPath(current, name));
            out.push({ dir: relDir, rules: decoder.decode(bytes) });
          }
          catch (err) {
            logger?.warn('gitignore-walk', `failed to read .gitignore at ${relDir || '<root>'}`, err);
          }
        })());
      }
      else if (isDir && name !== '.git') {
        dirs.push({ name, uri: Uri.joinPath(current, name) });
      }
    }

    await Promise.all([
      ...fileReads,
      ...dirs.map(child => walk(child.uri, relDir ? `${relDir}/${child.name}` : child.name)),
    ]);
  }

  await walk(root, '');
  return out;
}

/**
 * Build a path-predicate that returns `true` when a given absolute path is
 * gitignored. The matcher honors per-directory `.gitignore` semantics: rules
 * from `<dir>/.gitignore` only apply to paths under `<dir>`.
 */
export async function loadGitignoreFilter(
  workspaceRoot: Uri,
  logger?: FormatFilesLogger,
): Promise<(absPath: string) => boolean> {
  const files = await collectGitignoreFiles(workspaceRoot, logger);
  if (files.length === 0)
    return () => false;

  // Order by directory depth ascending so the workspace root .gitignore is
  // applied first, then each nested .gitignore on top.
  files.sort((a, b) => a.dir.split('/').length - b.dir.split('/').length);

  // Pair each ignore engine with the directory prefix it scopes to.
  const matchers: Array<{ prefix: string; ig: Ignore }> = files.map(f => ({
    prefix: f.dir,
    ig: ignore().add(f.rules),
  }));

  const rootPath = workspaceRoot.fsPath;

  return (absPath: string): boolean => {
    if (!isPathUnder(rootPath, absPath))
      return false;
    let rel = absPath.slice(rootPath.length).replace(/^[/\\]+/, '');
    if (rel === '')
      return false;
    // The `ignore` package expects POSIX-style paths.
    rel = rel.split(/[/\\]/).join('/');

    for (const { prefix, ig } of matchers) {
      if (prefix === '') {
        if (ig.ignores(rel))
          return true;
      }
      else if (rel === prefix || rel.startsWith(`${prefix}/`)) {
        const subPath = rel.slice(prefix.length).replace(/^\/+/, '');
        if (subPath && ig.ignores(subPath))
          return true;
      }
    }
    return false;
  };
}

/**
 * Build the include `RelativePattern` used by `vscode.workspace.findFiles`.
 *
 * Notes on `mode === 'folder'`:
 *   - We anchor `RelativePattern` to `folderUri` directly so the search is
 *     scoped to that subtree. VSCode 1.116 supports `RelativePattern` against
 *     any `Uri`, not just `WorkspaceFolder`.
 */
export function buildIncludePattern(args: QueryArgs): { pattern: RelativePattern; raw: string } {
  const base = resolveSearchBase(args);
  const raw = buildIncludeGlob({
    extensions: args.config.extensionsToInclude,
    globs: args.mode === 'glob' ? args.globs : undefined,
  });
  return { pattern: new RelativePattern(base, raw), raw };
}

/**
 * Apply the same extension / exclude / .gitignore filters used by the regular
 * file walk to a precomputed URI list. Used for `mode='gitChanged'`, where
 * `findFiles` is bypassed entirely.
 */
async function filterUriList(
  uris: Uri[],
  args: QueryArgs,
  includeGlob: string,
  excludeGlob: string | null,
): Promise<{ files: Uri[]; ignoredByGit: number }> {
  const exts = args.config.extensionsToInclude.map(e => e.toLowerCase());
  const extensionMatch = (uri: Uri): boolean => {
    if (exts.length === 0)
      return true;
    const lower = uri.fsPath.toLowerCase();
    return exts.some(ext => lower.endsWith(ext.startsWith('.') ? ext : `.${ext}`));
  };

  // The `ignore` library understands the exact glob shapes `composeExcludeGlob`
  // emits (e.g. `**/node_modules/**`, `**/*.min.js`), so a single matcher
  // covers both anchored and unanchored entries.
  let excludeMatcher: ((relPath: string) => boolean) | null = null;
  if (excludeGlob) {
    const parts = excludeGlob.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    if (parts.length > 0) {
      const ig = ignore().add(parts);
      excludeMatcher = (relPath: string) => ig.ignores(relPath.split(/[/\\]/).join('/'));
    }
  }

  const rootPath = args.workspaceFolder.uri.fsPath;
  let candidates = uris.filter(uri => isPathUnder(rootPath, uri.fsPath));
  candidates = candidates.filter(extensionMatch);

  if (excludeMatcher) {
    candidates = candidates.filter((uri) => {
      const rel = uri.fsPath.slice(rootPath.length).replace(/^[/\\]+/, '');
      return !excludeMatcher!(rel);
    });
  }

  // .gitignore post-filter (mirrors the regular mode).
  let ignoredByGit = 0;
  if (!args.skipExcludes && args.config.useGitIgnore) {
    const gitFilter = await loadGitignoreFilter(args.workspaceFolder.uri, args.logger);
    candidates = candidates.filter((uri) => {
      if (gitFilter(uri.fsPath)) {
        ignoredByGit++;
        return false;
      }
      return true;
    });
  }

  args.logger?.info(
    'queryFiles',
    `mode=gitChanged input=${uris.length} kept=${candidates.length} ignoredByGit=${ignoredByGit} include=${includeGlob} exclude=${excludeGlob ?? '(none)'}`,
  );

  return { files: candidates, ignoredByGit };
}

/**
 * Run the file walk for the chosen scope. Honors `excludePattern`,
 * `excludedFolders`, `inheritWorkspaceExcludedFiles`, and (when enabled)
 * `useGitIgnore` via post-filtering with the `ignore` package.
 */
export async function queryFiles(args: QueryArgs): Promise<QueryResult> {
  // Git-changed mode: source the URI list from the Git extension and apply
  // the standard post-filters in-memory (no `findFiles` call).
  if (args.mode === 'gitChanged') {
    const includeGlob = buildIncludeGlob({ extensions: args.config.extensionsToInclude });
    const excludeGlob = buildExcludePattern(args);
    const snapshot = await readGitChanges(args.workspaceFolder);
    const projected = projectScope(snapshot, args.config.gitScope);
    const { files, ignoredByGit } = await filterUriList(projected, args, includeGlob, excludeGlob);
    return { files, ignoredByGit, includeGlob, excludeGlob };
  }

  const { pattern: includePattern, raw: includeGlob } = buildIncludePattern(args);
  const excludeGlob = buildExcludePattern(args);

  const exclude: GlobPattern | null = excludeGlob
    ? new RelativePattern(args.workspaceFolder, excludeGlob)
    : null;

  args.logger?.debug(
    'queryFiles',
    `mode=${args.mode} include=${includeGlob} exclude=${excludeGlob ?? '(none)'} skipExcludes=${args.skipExcludes}`,
  );

  let raw: Uri[];
  try {
    // findFiles signature: (include, exclude, maxResults, token) — passing
    // `null` (not `undefined`) for `exclude` is what disables it.
    raw = await workspace.findFiles(
      includePattern,
      exclude ?? null,
      undefined,
      args.token,
    );
  }
  catch (err) {
    args.logger?.error('queryFiles', 'findFiles threw', err);
    throw err;
  }

  // Defensive scope filter for `mode='folder'`: keep only results inside the
  // chosen subtree even if VSCode returns a wider set.
  let scoped = raw;
  if (args.mode === 'folder' && args.folderUri) {
    const folderPath = args.folderUri.fsPath;
    scoped = raw.filter(uri => isPathUnder(folderPath, uri.fsPath));
  }

  // Apply gitignore post-filter when enabled and not in `skipExcludes` mode.
  let ignoredByGit = 0;
  let files = scoped;
  if (!args.skipExcludes && args.config.useGitIgnore) {
    const gitFilter = await loadGitignoreFilter(args.workspaceFolder.uri, args.logger);
    files = scoped.filter((uri) => {
      if (gitFilter(uri.fsPath)) {
        ignoredByGit++;
        return false;
      }
      return true;
    });
  }

  args.logger?.info(
    'queryFiles',
    `found ${files.length} files (raw=${raw.length}, scoped=${scoped.length}, ignoredByGit=${ignoredByGit})`,
  );

  return { files, ignoredByGit, includeGlob, excludeGlob };
}
