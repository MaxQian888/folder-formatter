// ----------------------------------------------------------------------------
// Format Files configuration mirror — kept in `shared/` so both the extension
// host and the React webview can import the same shape without dragging the
// `vscode` module type into the browser bundle.
// ----------------------------------------------------------------------------

export type FormatFilesLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Locale = 'en' | 'zh-CN';

export interface GitScopeConfig {
  includeStaged: boolean;
  includeModified: boolean;
  includeUntracked: boolean;
}

export interface FormatFilesConfigShape {
  logLevel: FormatFilesLogLevel;
  extensionsToInclude: string[];
  excludedFolders: string[];
  excludePattern: string[];
  inheritWorkspaceExcludedFiles: boolean;
  runOrganizeImports: boolean;
  useGitIgnore: boolean;
  gitScope: GitScopeConfig;
  dryRunFirst: boolean;
  locale: 'auto' | Locale;
}

export type FormatFilesRunMode = 'workspace' | 'folder' | 'glob' | 'gitChanged';

export type FileResultStatus = 'ok' | 'failed' | 'skipped' | 'unchanged';

export interface FileResultEntry {
  /** `vscode.Uri.toString()` — stable identifier across hosts. */
  uri: string;
  relativePath: string;
  status: FileResultStatus;
  durationMs: number;
  errorMessage?: string;
}

export interface RunHistoryEntry {
  id: string;
  timestamp: number;
  mode: FormatFilesRunMode;
  fileCount: number;
  processed: number;
  durationMs: number;
  status: 'completed' | 'aborted' | 'failed';
  workspaceFolder?: string;
  errorMessage?: string;
  /** Per-file outcomes captured during the run (capped to 1000 per entry). */
  fileResults?: FileResultEntry[];
}

export interface DryRunReport {
  runId: string;
  mode: FormatFilesRunMode;
  total: number;
  /** Map of `.ext` → file count. Files without an extension are bucketed as `''`. */
  byExtension: Record<string, number>;
  etaMs: number;
  /** Extensions that fall outside the static formatter-availability whitelist. */
  unknownFormatterExtensions: string[];
  /** First N (≤ 20) workspace-relative file paths for preview. */
  firstFiles: string[];
}

export interface LogEntry {
  level: FormatFilesLogLevel;
  source: string;
  message: string;
  timestamp: number;
}

// ----------------------------------------------------------------------------
// Discriminated unions for typed messaging across the extension/webview boundary.
// ----------------------------------------------------------------------------

// Pre-existing skeleton signals are kept first so the panel handshake & error
// forwarding continue to work. Format Files panel-specific messages follow.
export type WebviewToExtensionMessage
  = | { type: 'hello'; data: string }
    | { type: 'log'; level: FormatFilesLogLevel; message: string }
    | { type: 'webview/error'; error: { name: string; message: string; stack?: string } }
    | { type: 'webview/ready' }
    | { type: 'formatFiles/getState' }
    | { type: 'formatFiles/updateSetting'; key: keyof FormatFilesConfigShape; value: unknown; target?: 'workspace' | 'workspaceFolder' | 'global' }
    | { type: 'formatFiles/runWorkspace' }
    | { type: 'formatFiles/runFromGlob' }
    | { type: 'formatFiles/runGitChanged' }
    | { type: 'formatFiles/confirmDryRun'; runId: string; proceed: boolean }
    | { type: 'formatFiles/clearHistory' }
    | { type: 'formatFiles/openOutputChannel' };

export type ExtensionToWebviewMessage
  = | { type: 'hello'; data: string }
    | { type: 'theme/changed'; kind: 'light' | 'dark' | 'high-contrast' }
    | { type: 'state/restore'; payload: unknown }
    | { type: 'formatFiles/state'; config: FormatFilesConfigShape; history: RunHistoryEntry[]; version: string; isRunning: boolean; locale: Locale }
    | { type: 'formatFiles/configChanged'; config: FormatFilesConfigShape; locale: Locale }
    | { type: 'formatFiles/historyChanged'; history: RunHistoryEntry[] }
    | { type: 'formatFiles/runStarted'; runId: string; mode: FormatFilesRunMode; timestamp: number; totalFiles: number }
    | { type: 'formatFiles/runProgress'; runId: string; processed: number; total: number; currentFile: string }
    | { type: 'formatFiles/runFileDone'; runId: string; result: FileResultEntry }
    | { type: 'formatFiles/runCompleted'; runId: string; entry: RunHistoryEntry }
    | { type: 'formatFiles/dryRunReport'; report: DryRunReport }
    | { type: 'formatFiles/log'; entry: LogEntry };

export type MessageOf<T extends string, M extends { type: string }> = Extract<M, { type: T }>;

// ----------------------------------------------------------------------------
// Defaults shared between the extension host and the webview.
// ----------------------------------------------------------------------------

export const DEFAULT_EXCLUDED_FOLDERS: readonly string[] = [
  'node_modules',
  '.vscode',
  '.git',
  'dist',
  '.chrome',
];

export const DEFAULT_FORMAT_FILES_CONFIG: FormatFilesConfigShape = {
  logLevel: 'debug',
  extensionsToInclude: [],
  excludedFolders: [...DEFAULT_EXCLUDED_FOLDERS],
  excludePattern: [],
  inheritWorkspaceExcludedFiles: true,
  runOrganizeImports: true,
  useGitIgnore: true,
  gitScope: {
    includeStaged: true,
    includeModified: true,
    includeUntracked: true,
  },
  dryRunFirst: false,
  locale: 'auto',
};

export const HISTORY_MAX_ENTRIES = 50;

export const LOG_LEVEL_RANK: Record<FormatFilesLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
