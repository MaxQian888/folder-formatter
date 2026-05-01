# Folder Formatter

[![CI](https://github.com/AstroAir/folder-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/AstroAir/folder-formatter/actions/workflows/ci.yml)

Batch-format every file in a workspace, a folder, only your **Git changes**, or matching a glob pattern. A modernized port of [`jbockle/format-files`](https://github.com/jbockle/format-files) (MIT) built on **VSCode 1.116+ APIs**, with a **React 19 + shadcn/ui + Tailwind v4** webview panel for settings, run history, live logs, and a Dry-run preview gate. UI is bilingual (English / 简体中文).

## Features

- **Five commands** for every batching scenario:
  - `Format Files: Start Format Files: Workspace`
  - `Format Files: Start Format Files: This Folder` (also in the Explorer right-click menu)
  - `Format Files: Start Format Files: From Glob`
  - `Format Files: Start Format Files: Git Changes` — formats only the files that show up in `git status` (staged / modified / untracked, each independently togglable)
  - `Format Files: Show Panel` — opens the webview
- **Webview panel** with:
  - **Settings** — every formatter setting bound to live VSCode `workspace.update`, including a Git-scope card (3 toggles), a Dry-run toggle, and a UI language picker
  - **History** — the last 50 runs persisted in `workspaceState`; each row is **expandable** to reveal a per-file outcome table (status badge, duration, error message)
  - **Logs** — a live mirror of the `Format Files` output channel with level filtering and search
  - **Run status bar** with progress bar, current-file display, and end-of-run summary
  - **Dry-run preview** — when `folderFormatter.dryRunFirst` is on, every Run shows an inline confirmation card with file count, extension breakdown, ETA, and a "no known formatter" advisory, before any file is touched
- **Per-file result tracking** — the format loop classifies each file as `ok`, `unchanged`, `failed`, or `skipped` (with the failure reason when applicable), persisted on the history entry and streamed live to the panel
- **Bilingual UI (i18n)** — webview text and command-palette labels both translate; auto-follows VSCode's display language by default, or override via `folderFormatter.locale`
- **Modern file discovery** via `vscode.workspace.findFiles` + `RelativePattern` — no extra crawler dependency
- **Real `.gitignore` support** via the [`ignore`](https://www.npmjs.com/package/ignore) package — fixes a long-standing bug where the upstream extension's `useGitIgnore` setting was declared but never honored
- **Cancellable progress** with a notification-style progress bar; cancellation surfaces as a modal
- **Per-folder settings** — every contribution declares `scope: "resource"` so multi-root workspaces work correctly
- **Safety net** — runs over `5000` files prompt for an extra confirmation
- **Tested** — Vitest (unit + components, including i18n & dry-run flow), Mocha + `@vscode/test-electron` (extension host), Playwright (dev + prod-preview)

## Commands

| Command ID                          | Title                           | Where                                |
| ----------------------------------- | ------------------------------- | ------------------------------------ |
| `formatFiles.start.workspace`       | Start Format Files: Workspace   | Command Palette                      |
| `formatFiles.start.workspaceFolder` | Start Format Files: This Folder | Explorer context (folders) + Palette |
| `formatFiles.start.fromGlob`        | Start Format Files: From Glob   | Command Palette                      |
| `formatFiles.start.gitChanged`      | Start Format Files: Git Changes | Command Palette                      |
| `formatFiles.showPanel`             | Format Files: Show Panel        | Command Palette                      |

## Settings

All keys are scoped to `resource`, so per-workspace-folder overrides apply automatically.

| Key                                             | Type          | Default                                                  | Description                                                                                            |
| ----------------------------------------------- | ------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `folderFormatter.logLevel`                      | enum          | `"debug"`                                                | Severity threshold for the `Format Files` output channel (`debug`/`info`/`warn`/`error`).              |
| `folderFormatter.extensionsToInclude`           | string        | `""`                                                     | Comma-separated extensions (`ts,tsx,js`). Leading dot optional. `{ts,js}` form also accepted.          |
| `folderFormatter.excludedFolders`               | array<string> | `["node_modules", ".vscode", ".git", "dist", ".chrome"]` | Folders to exclude. Each entry expands to `**/<name>/**`.                                              |
| `folderFormatter.excludePattern`                | string        | `""`                                                     | Comma-separated glob patterns to exclude.                                                              |
| `folderFormatter.inheritWorkspaceExcludedFiles` | boolean       | `true`                                                   | Merge enabled keys from the workspace `files.exclude` setting into the exclude list.                   |
| `folderFormatter.runOrganizeImports`            | boolean       | `true`                                                   | Run **Organize Imports** before each file's format. Default flipped from upstream to match its README. |
| `folderFormatter.useGitIgnore`                  | boolean       | `true`                                                   | Skip files matched by any `.gitignore` in the workspace tree.                                          |
| `folderFormatter.gitScope.includeStaged`        | boolean       | `true`                                                   | When `true`, **Run on Git changes** processes files in the index (`git add`).                          |
| `folderFormatter.gitScope.includeModified`      | boolean       | `true`                                                   | When `true`, **Run on Git changes** processes tracked files with unstaged modifications.               |
| `folderFormatter.gitScope.includeUntracked`     | boolean       | `true`                                                   | When `true`, **Run on Git changes** processes new files Git has not yet tracked.                       |
| `folderFormatter.dryRunFirst`                   | boolean       | `false`                                                  | When `true`, every Run shows a confirmation panel listing matched files, extension breakdown, and ETA. |
| `folderFormatter.locale`                        | enum          | `"auto"`                                                 | Panel language: `auto` (follow VSCode), `en`, or `zh-CN`. Command palette always follows VSCode.       |

## Differences vs. upstream `jbockle/format-files`

This is a faithful port plus targeted improvements:

1. **`useGitIgnore` actually works.** The upstream extension declared the setting but its file-query layer never consulted it. This port wires it through the `ignore` library with hierarchical `.gitignore` semantics.
2. **`runOrganizeImports` defaults to `true`**, matching upstream's documented behavior. Upstream's `package.json` shipped `false`, contradicting its README.
3. **`excludedFolders` uses standard globs.** Upstream matched these as path prefixes via `path.resolve(...).startsWith(...)`; we expand each entry to `**/<name>/**` for consistency with the VSCode search API.
4. **`vscode.workspace.findFiles` replaces `fdir`+`micromatch`** as the primary file walker — fewer dependencies, native `RelativePattern` support, plays nicely with the rest of VSCode's search.
5. **A webview panel** (`formatFiles.showPanel`) provides settings, history, and logs in addition to the Command Palette workflow.
6. **Description-text typos fixed** (`seperated` → `separated`); descriptions migrated to `markdownDescription`.
7. **Large-run safety net** — runs over 5000 files require an extra confirmation prompt.
8. **`activationEvents` removed.** The extension auto-activates from `contributes.commands` on engine ≥1.74.

## Getting started

### Prerequisites

- Node.js ≥ 20
- pnpm

### Develop

```bash
pnpm install
pnpm dev          # Vite dev server with HMR
```

Press **F5** in VSCode to launch the Extension Development Host, then trigger any of the four commands from the Command Palette.

### Build / package

```bash
pnpm build        # production build
pnpm package      # produce a .vsix
```

## Project structure

```
extension/                       Node-side code (CommonJS bundle)
  commands/                      One register module per command (5 total)
  format-files/
    config-utils.ts              Pure config parsers (testable without vscode)
    config.ts                    Workspace config loader
    constants.ts                 Command IDs, channel names, defaults, formatter whitelist
    dry-run.ts                   Dry-run report builder (count / ETA / extension breakdown)
    errors.ts                    OperationAborted
    file-query.ts                findFiles + .gitignore filtering + git-changed branch
    format-loop.ts               withProgress + per-file format pipeline + per-file result tracking
    git-api.ts                   Adapter over the built-in vscode.git extension
    history.ts                   workspaceState-backed run history (incl. fileResults)
    host-i18n.ts                 Host-side `t()` helper (reads locale per call)
    locale.ts                    Resolve `auto`/`en`/`zh-CN`
    logger.ts                    Format Files OutputChannel
    prompts/                     QuickPick + InputBox prompts
    run.ts                       Top-level orchestrator (incl. dry-run gate)
    runtime.ts                   Activate-time singleton wiring (incl. pending dry-run map)
  views/                         Webview panel + CSP + message router (locale aware)
  index.ts                       activate/deactivate
shared/messages.ts               Discriminated-union message contract
shared/i18n/                     Locale-agnostic dictionaries + `t()` (used by host & webview)
package.nls.json                 VSCode-native localization for command titles & setting descriptions
package.nls.zh-CN.json           Simplified-Chinese counterpart
webview/                         React 19 + shadcn UI panel
  components/format-files/       SettingsTab, HistoryTab (expandable), LogsTab, RunStatusBar, DryRunPanel
  hooks/useFormatFilesState.ts   Reducer + handshake (locale, pendingDryRun, liveFileResults)
  i18n/I18nProvider.tsx          React Context exposing `useT()`
__tests__/extension/             Mocha + @vscode/test-electron
e2e/                             Playwright (dev + prod-preview)
```

## Scripts

| Command               | Description                              |
| --------------------- | ---------------------------------------- |
| `pnpm dev`            | Vite dev server with HMR                 |
| `pnpm build`          | Production build                         |
| `pnpm typecheck`      | `tsc --noEmit` for both projects         |
| `pnpm lint`           | ESLint (`@antfu` + `@tomjs` presets)     |
| `pnpm test`           | Vitest unit suite                        |
| `pnpm test:extension` | Extension-host integration tests         |
| `pnpm test:e2e`       | Playwright (dev + prod-preview projects) |
| `pnpm test:all`       | All three test layers                    |
| `pnpm package`        | Produce `.vsix`                          |

## License

MIT — same as upstream. Original concept and command shapes © 2018–present jbockle; reimplementation © 2026 contributors.
