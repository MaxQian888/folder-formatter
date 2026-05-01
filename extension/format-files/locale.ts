import { env } from 'vscode';

import type { FormatFilesConfigShape, Locale } from '@shared/messages';

/**
 * Resolve the active webview locale from the user's config and VSCode's
 * display language. `auto` (the default) maps Chinese display languages to
 * `zh-CN`; everything else falls back to `en`.
 *
 * The host calls this once at the start of each run (so config changes apply
 * on the next run) and on every panel push.
 */
export function resolveLocale(configValue: FormatFilesConfigShape['locale'] | undefined): Locale {
  if (configValue === 'en' || configValue === 'zh-CN')
    return configValue;
  // 'auto' (or any unexpected value) — use the VSCode display language.
  const lang = (env.language ?? 'en').toLowerCase();
  if (lang.startsWith('zh'))
    return 'zh-CN';
  return 'en';
}
