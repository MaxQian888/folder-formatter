import { EN_DICT } from './dict-en';
import { ZH_CN_DICT } from './dict-zh-CN';

import type { FormatFilesRunMode, Locale } from '../messages';
import type { EnDict } from './dict-en';

export type DictKey = keyof EnDict;
type AnyDict = Partial<Record<DictKey, string>>;

const DICTS: Record<Locale, AnyDict> = {
  'en': EN_DICT as unknown as AnyDict,
  'zh-CN': ZH_CN_DICT,
};

/**
 * Look up a key in the target locale's dictionary, fall back to English when
 * missing. `{name}` placeholders in the value are substituted with `params[name]`.
 *
 * Usage:
 *   t('app.title', 'en')                                  // → 'Format Files'
 *   t('history.description', 'zh-CN', { n: 5, plural: 's' })
 */
export function t(
  key: DictKey,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const value = DICTS[locale]?.[key] ?? EN_DICT[key] ?? key;
  if (!params)
    return value;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => {
    const replacement = params[name];
    return replacement === undefined ? `{${name}}` : String(replacement);
  });
}

/**
 * Bind `t()` to a fixed locale. Useful for components that read the locale
 * once at render time and need a 1-arg-per-call helper.
 */
export function makeT(locale: Locale): (key: DictKey, params?: Record<string, string | number>) => string {
  return (key, params) => t(key, locale, params);
}

export const MODE_KEY: Record<FormatFilesRunMode, DictKey> = {
  workspace: 'run.mode.workspace',
  folder: 'run.mode.folder',
  glob: 'run.mode.glob',
  gitChanged: 'run.mode.gitChanged',
};

export type { Locale };
