import { t } from '@shared/i18n';
import { workspace } from 'vscode';

import { CONFIG_SECTION } from './constants';
import { resolveLocale } from './locale';

import type { DictKey, Locale } from '@shared/i18n';
import type { Disposable, Uri } from 'vscode';

let cached: Locale | undefined;
let watcher: Disposable | undefined;

function compute(scope: Uri | undefined): Locale {
  const cfgScope = scope ?? workspace.workspaceFolders?.[0]?.uri;
  const cfg = workspace.getConfiguration(CONFIG_SECTION, cfgScope);
  const value = cfg.get<string>('locale') ?? 'auto';
  return resolveLocale(value === 'en' || value === 'zh-CN' ? value : 'auto');
}

function ensureWatcher(): void {
  if (watcher)
    return;
  watcher = workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(`${CONFIG_SECTION}.locale`))
      cached = undefined;
  });
}

/**
 * Host-side `t()` helper. The resolved locale is cached and invalidated on
 * the next config change. When `scope` is supplied (e.g. a multi-root folder
 * URI) the cache is bypassed because per-folder overrides may differ.
 */
export function ht(
  key: DictKey,
  params?: Record<string, string | number>,
  scope?: Uri,
): string {
  if (scope)
    return t(key, compute(scope), params);
  ensureWatcher();
  if (cached === undefined)
    cached = compute(undefined);
  return t(key, cached, params);
}
