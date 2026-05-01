import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { HistoryTab } from '../components/format-files/HistoryTab';
import { LogsTab } from '../components/format-files/LogsTab';

import { mockVsCodeApi } from './setup';

function dispatchMessage(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

const READY_STATE = {
  type: 'formatFiles/state',
  config: {
    logLevel: 'debug',
    extensionsToInclude: ['.ts'],
    excludedFolders: ['node_modules', '.git'],
    excludePattern: ['**/*.min.js'],
    inheritWorkspaceExcludedFiles: true,
    runOrganizeImports: true,
    useGitIgnore: true,
    gitScope: { includeStaged: true, includeModified: true, includeUntracked: true },
    dryRunFirst: false,
    locale: 'auto',
  },
  history: [],
  version: '0.1.0',
  isRunning: false,
  locale: 'en',
};

const READY_STATE_ZH = {
  ...READY_STATE,
  locale: 'zh-CN',
};

describe('app shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main title and version badge', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /format files/i })).toBeInTheDocument();
    act(() => dispatchMessage(READY_STATE));
    await waitFor(() => expect(screen.getByText('v0.1.0')).toBeInTheDocument());
  });

  it('sends webview/ready and formatFiles/getState on mount', () => {
    render(<App />);
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'webview/ready' });
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'formatFiles/getState' });
  });

  it('triggers a workspace run when the header button is clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /run on workspace/i }));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'formatFiles/runWorkspace' });
  });

  it('triggers a glob run when the glob button is clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /run from glob/i }));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'formatFiles/runFromGlob' });
  });

  it('triggers a Git-changes run when the new header button is clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /run on git changes/i }));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'formatFiles/runGitChanged' });
  });

  it('switches the visible language when locale changes', async () => {
    render(<App />);
    act(() => dispatchMessage(READY_STATE_ZH));
    // Workspace run button label flips to Chinese.
    await screen.findByRole('button', { name: /格式化整个工作区/ });
  });

  it('updates a setting via the Switch and posts the change', async () => {
    render(<App />);
    act(() => dispatchMessage(READY_STATE));

    const organizeSwitch = await screen.findByLabelText(/Run Organize Imports/i);
    fireEvent.click(organizeSwitch);

    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'formatFiles/updateSetting',
        key: 'runOrganizeImports',
        value: false,
      }),
    );
  });

  it('toggling a Git-scope switch posts a gitScope update', async () => {
    render(<App />);
    act(() => dispatchMessage(READY_STATE));

    const stagedSwitch = await screen.findByLabelText(/include staged/i);
    fireEvent.click(stagedSwitch);

    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'formatFiles/updateSetting',
        key: 'gitScope',
        value: expect.objectContaining({ includeStaged: false }),
      }),
    );
  });
});

describe('logsTab component', () => {
  it('renders an empty-state message when there are no logs', () => {
    render(
      <LogsTab logs={[]} onClearLogs={() => {}} onOpenOutputChannel={() => {}} />,
    );
    expect(screen.getByText(/no log entries yet/i)).toBeInTheDocument();
  });

  it('renders a log entry message verbatim', () => {
    render(
      <LogsTab
        logs={[{ level: 'info', source: 'test', message: 'hello-from-extension', timestamp: Date.now() }]}
        onClearLogs={() => {}}
        onOpenOutputChannel={() => {}}
      />,
    );
    expect(screen.getByText('hello-from-extension')).toBeInTheDocument();
  });
});

describe('historyTab component', () => {
  it('renders the empty state when there is no history', () => {
    render(<HistoryTab history={[]} onClear={() => {}} />);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });

  it('renders a row for each history entry', () => {
    render(
      <HistoryTab
        history={[
          {
            id: 'r1',
            timestamp: Date.now(),
            mode: 'workspace',
            fileCount: 12,
            processed: 12,
            durationMs: 4321,
            status: 'completed',
            workspaceFolder: 'demo',
          },
        ]}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('12 / 12')).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
  });

  it('expands a row to show per-file results when available', () => {
    render(
      <HistoryTab
        history={[
          {
            id: 'r2',
            timestamp: Date.now(),
            mode: 'gitChanged',
            fileCount: 3,
            processed: 2,
            durationMs: 1500,
            status: 'completed',
            workspaceFolder: 'demo',
            fileResults: [
              { uri: 'file:///a.ts', relativePath: 'src/a.ts', status: 'ok', durationMs: 200 },
              { uri: 'file:///b.ts', relativePath: 'src/b.ts', status: 'unchanged', durationMs: 300 },
              { uri: 'file:///c.xyz', relativePath: 'tools/c.xyz', status: 'failed', durationMs: 100, errorMessage: 'no formatter' },
            ],
          },
        ]}
        onClear={() => {}}
      />,
    );

    const expandButtons = screen.getAllByRole('button', { name: /toggle file results/i });
    fireEvent.click(expandButtons[0]);

    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('tools/c.xyz')).toBeInTheDocument();
    expect(screen.getByText('no formatter')).toBeInTheDocument();
  });
});

describe('app integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a logs counter badge when log entries arrive', async () => {
    render(<App />);
    act(() => dispatchMessage(READY_STATE));

    act(() =>
      dispatchMessage({
        type: 'formatFiles/log',
        entry: {
          level: 'info',
          source: 'test',
          message: 'hello-from-extension',
          timestamp: Date.now(),
        },
      }),
    );

    const logsTab = await screen.findByRole('tab', { name: /logs/i });
    await waitFor(() => expect(logsTab.textContent).toMatch(/1/));
  });

  it('updates the History badge when runCompleted arrives', async () => {
    render(<App />);
    act(() => dispatchMessage(READY_STATE));
    act(() =>
      dispatchMessage({
        type: 'formatFiles/runCompleted',
        runId: 'r1',
        entry: {
          id: 'r1',
          timestamp: Date.now(),
          mode: 'workspace',
          fileCount: 7,
          processed: 7,
          durationMs: 1234,
          status: 'completed',
          workspaceFolder: 'demo',
        },
      }),
    );
    const historyTab = await screen.findByRole('tab', { name: /history/i });
    await waitFor(() => expect(historyTab.textContent).toMatch(/1/));
  });

  it('renders the dry-run panel when a report arrives and confirms send back to host', async () => {
    render(<App />);
    act(() => dispatchMessage(READY_STATE));

    act(() => dispatchMessage({
      type: 'formatFiles/dryRunReport',
      report: {
        runId: 'r99',
        mode: 'gitChanged',
        total: 4,
        byExtension: { '.ts': 3, '.md': 1 },
        etaMs: 800,
        unknownFormatterExtensions: [],
        firstFiles: ['src/a.ts', 'src/b.ts', 'README.md'],
      },
    }));

    expect(await screen.findByTestId('dry-run-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dry-run-confirm'));

    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'formatFiles/confirmDryRun',
      runId: 'r99',
      proceed: true,
    });
  });
});
