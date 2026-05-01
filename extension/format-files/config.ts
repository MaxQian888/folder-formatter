import { DEFAULT_EXCLUDED_FOLDERS, DEFAULT_FORMAT_FILES_CONFIG } from '@shared/messages';
import { workspace } from 'vscode';

import {
  normalizeFolderList,
  normalizeLogLevel,
  parseExtensions,
  parseGlobList,
} from './config-utils';
import { CONFIG_SECTION } from './constants';

import type { FormatFilesConfigShape } from '@shared/messages';
import type { ConfigurationScope, Uri } from 'vscode';

export type FormatFilesConfig = FormatFilesConfigShape;

export const DEFAULT_CONFIG: FormatFilesConfig = DEFAULT_FORMAT_FILES_CONFIG;

/**
 * Load the resolved Format Files configuration for a given scope.
 *
 * `scope` should be a workspace folder URI in multi-root setups so that
 * per-folder `.vscode/settings.json` overrides apply (the contributions
 * declare `scope: "resource"` to enable this).
 */
export function loadConfig(scope: ConfigurationScope | undefined): FormatFilesConfig {
  const cfg = workspace.getConfiguration(CONFIG_SECTION, scope);
  return {
    logLevel: normalizeLogLevel(cfg.get<string>('logLevel'), DEFAULT_CONFIG.logLevel),
    extensionsToInclude: parseExtensions(cfg.get<string>('extensionsToInclude', '')),
    excludedFolders: normalizeFolderList(
      cfg.get<unknown>('excludedFolders'),
      DEFAULT_EXCLUDED_FOLDERS,
    ),
    excludePattern: parseGlobList(cfg.get<string>('excludePattern', '')),
    inheritWorkspaceExcludedFiles: cfg.get<boolean>(
      'inheritWorkspaceExcludedFiles',
      DEFAULT_CONFIG.inheritWorkspaceExcludedFiles,
    ),
    runOrganizeImports: cfg.get<boolean>(
      'runOrganizeImports',
      DEFAULT_CONFIG.runOrganizeImports,
    ),
    useGitIgnore: cfg.get<boolean>(
      'useGitIgnore',
      DEFAULT_CONFIG.useGitIgnore,
    ),
    gitScope: {
      includeStaged: cfg.get<boolean>(
        'gitScope.includeStaged',
        DEFAULT_CONFIG.gitScope.includeStaged,
      ),
      includeModified: cfg.get<boolean>(
        'gitScope.includeModified',
        DEFAULT_CONFIG.gitScope.includeModified,
      ),
      includeUntracked: cfg.get<boolean>(
        'gitScope.includeUntracked',
        DEFAULT_CONFIG.gitScope.includeUntracked,
      ),
    },
    dryRunFirst: cfg.get<boolean>('dryRunFirst', DEFAULT_CONFIG.dryRunFirst),
    locale: normalizeLocaleConfig(cfg.get<string>('locale')),
  };
}

function normalizeLocaleConfig(value: string | undefined): FormatFilesConfig['locale'] {
  if (value === 'en' || value === 'zh-CN' || value === 'auto')
    return value;
  return 'auto';
}

/**
 * Read the workspace's `files.exclude` setting and return only the patterns
 * whose value is `true`. Patterns flipped to `false` are explicit re-includes
 * and must NOT be added to the exclude set.
 */
export function getWorkspaceFilesExclude(scope: Uri | undefined): string[] {
  const cfg = workspace.getConfiguration('files', scope);
  const raw = cfg.get<Record<string, boolean>>('exclude') ?? {};
  return Object.entries(raw)
    .filter(([, enabled]) => enabled === true)
    .map(([pattern]) => pattern);
}
