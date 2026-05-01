export const COMMAND_IDS = {
  workspace: 'formatFiles.start.workspace',
  workspaceFolder: 'formatFiles.start.workspaceFolder',
  fromGlob: 'formatFiles.start.fromGlob',
  gitChanged: 'formatFiles.start.gitChanged',
  showPanel: 'formatFiles.showPanel',
} as const;

/**
 * Static whitelist of file extensions known to ship with at least one
 * formatter in stock VSCode or via popular extensions (Prettier, ESLint).
 * Used by the dry-run report to surface a "no known formatter" warning for
 * extensions outside this set. Advisory only — the run is never blocked.
 */
export const KNOWN_FORMATTABLE_EXTENSIONS: readonly string[] = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.md',
  '.mdx',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.htm',
  '.vue',
  '.svelte',
  '.yaml',
  '.yml',
  '.xml',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.cs',
  '.kt',
  '.swift',
  '.rb',
  '.php',
  '.sh',
  '.toml',
  '.graphql',
  '.gql',
];

export const OUTPUT_CHANNEL_NAME = 'Format Files';

export const CONFIG_SECTION = 'folderFormatter';

// History bookkeeping
export const HISTORY_STATE_KEY = 'formatFiles.history';

// Safety net for very large workspaces. The original extension had no
// such guard; this port adds a confirmation prompt above this threshold.
export const LARGE_RUN_THRESHOLD = 5000;

export const PANEL_VIEW_TYPE = 'formatFiles.panel';
export const PANEL_TITLE = 'Format Files';
