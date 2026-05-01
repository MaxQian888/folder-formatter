// Pure helpers extracted so they can be unit-tested without pulling in the
// `vscode` module. `config.ts` consumes these and adds the workspace lookup.

import type { FormatFilesLogLevel } from '@shared/messages';

/**
 * Returns true when `child` is the same as `parent` or lives below it. Accepts
 * both POSIX (`/`) and Windows (`\`) separators so it is safe to call with raw
 * `Uri.fsPath` values on either platform.
 */
export function isPathUnder(parent: string, child: string): boolean {
  return child === parent
    || child.startsWith(`${parent}/`)
    || child.startsWith(`${parent}\\`);
}

const VALID_LOG_LEVELS: readonly FormatFilesLogLevel[] = ['debug', 'info', 'warn', 'error'];

export function normalizeLogLevel(value: unknown, fallback: FormatFilesLogLevel = 'debug'): FormatFilesLogLevel {
  return typeof value === 'string' && (VALID_LOG_LEVELS as readonly string[]).includes(value)
    ? (value as FormatFilesLogLevel)
    : fallback;
}

/**
 * Parse the comma-separated `extensionsToInclude` setting:
 *   - splits on commas
 *   - trims whitespace
 *   - strips back-compat brace wrappers like `{ts,js}` (recursively for nested)
 *   - drops empty entries
 *   - prefixes a `.` if missing
 *   - dedupes preserving order
 *
 * Examples:
 *   "ts, tsx, js"        -> [".ts", ".tsx", ".js"]
 *   "{ts,js}"            -> [".ts", ".js"]
 *   ".md , .md, .txt"    -> [".md", ".txt"]
 *   ""                   -> []
 */
export function parseExtensions(raw: unknown): string[] {
  if (typeof raw !== 'string')
    return [];

  // Strip wrapping braces of any nesting depth: "{ts,js}" or "{{ts,js}}".
  let working = raw.trim();
  while (working.startsWith('{') && working.endsWith('}'))
    working = working.slice(1, -1);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of working.split(',')) {
    const trimmed = part.trim().replace(/^\{|\}$/g, '').trim();
    if (!trimmed)
      continue;
    const normalized = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

/**
 * Parse a comma-separated glob list (used by `excludePattern`).
 * Trims, drops empties, dedupes preserving order.
 */
export function parseGlobList(raw: unknown): string[] {
  if (typeof raw !== 'string')
    return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed))
      continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Normalize `excludedFolders` array setting: keep only non-empty trimmed strings,
 * dedupe, preserve order. Each entry stays as-is (folder name or relative path);
 * conversion to a glob pattern happens in the file-query layer.
 */
export function normalizeFolderList(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) {
    return [...fallback];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string')
      continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed))
      continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Convert an `excludedFolders` entry to a `**\/<entry>/**` glob fragment.
 * Handles both bare names ("node_modules") and relative paths ("packages/foo").
 * Strips any leading/trailing slashes to keep the resulting glob normalized.
 */
export function folderToGlob(folder: string): string {
  const trimmed = folder.replace(/^[/\\]+|[/\\]+$/g, '');
  if (!trimmed)
    return '';
  // Already a glob pattern? Pass through unchanged.
  if (trimmed.includes('*') || trimmed.includes('?'))
    return trimmed;
  return `**/${trimmed}/**`;
}

/**
 * Compose a single VSCode-compatible exclude glob from the merged pattern list.
 * VSCode's `findFiles` accepts a single GlobPattern, so we fold many entries
 * into one `{a,b,c}` brace-expansion. Returns `null` if there is nothing to
 * exclude (caller passes `null` to bypass the exclude argument).
 */
export function composeExcludeGlob(patterns: readonly string[]): string | null {
  const cleaned = patterns.map(p => p.trim()).filter(Boolean);
  if (cleaned.length === 0)
    return null;
  if (cleaned.length === 1)
    return cleaned[0]!;
  return `{${cleaned.join(',')}}`;
}

/**
 * Build the include glob for the file walk based on the chosen mode.
 *
 *   - When `extensionsToInclude` has entries:  `**\/*.{ts,tsx,...}`
 *   - When user-supplied globs are provided:   `{glob1,glob2,...}` (passthrough)
 *   - Otherwise:                                `**\/*` (everything)
 */
export function buildIncludeGlob(args: {
  extensions: readonly string[];
  globs?: readonly string[];
}): string {
  if (args.globs && args.globs.length > 0) {
    const cleaned = args.globs.map(g => g.trim()).filter(Boolean);
    if (cleaned.length === 1)
      return cleaned[0]!;
    if (cleaned.length > 1)
      return `{${cleaned.join(',')}}`;
  }
  if (args.extensions.length === 0)
    return '**/*';
  // Strip leading dots for the brace fragment: ".ts" -> "ts"
  const exts = args.extensions.map(e => e.replace(/^\./, ''));
  if (exts.length === 1)
    return `**/*.${exts[0]}`;
  return `**/*.{${exts.join(',')}}`;
}
