import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFormatFilesState } from '@/hooks/useFormatFilesState';

import { mockVsCodeApi } from '../setup';

import type {
  ExtensionToWebviewMessage,
  FormatFilesConfigShape,
  RunHistoryEntry,
} from '@shared/messages';

const BASE_CONFIG: FormatFilesConfigShape = {
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
};

function dispatch(msg: ExtensionToWebviewMessage | unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

function makeHistoryEntry(id: string, processed = 4): RunHistoryEntry {
  return {
    id,
    timestamp: Date.now(),
    mode: 'workspace',
    fileCount: 4,
    processed,
    durationMs: 100,
    status: 'completed',
    workspaceFolder: 'demo',
  };
}

describe('useFormatFilesState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts not-ready and posts the handshake on mount', () => {
    const { result } = renderHook(() => useFormatFilesState());
    expect(result.current.ready).toBe(false);
    expect(result.current.version).toBe('0.0.0');
    expect(result.current.locale).toBe('en');
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'webview/ready' });
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'formatFiles/getState' });
  });

  it('skipHandshake suppresses webview/ready and getState', () => {
    renderHook(() => useFormatFilesState({ skipHandshake: true }));
    expect(mockVsCodeApi.postMessage).not.toHaveBeenCalled();
  });

  it('formatFiles/state hydrates ready=true with config/history/version/locale', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => dispatch({
      type: 'formatFiles/state',
      config: BASE_CONFIG,
      history: [makeHistoryEntry('h1')],
      version: '1.2.3',
      isRunning: true,
      locale: 'zh-CN',
    }));
    expect(result.current.ready).toBe(true);
    expect(result.current.version).toBe('1.2.3');
    expect(result.current.locale).toBe('zh-CN');
    expect(result.current.run.isRunning).toBe(true);
    expect(result.current.history).toHaveLength(1);
  });

  it('configChanged merges into defaults and updates locale', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => dispatch({
      type: 'formatFiles/configChanged',
      config: { ...BASE_CONFIG, runOrganizeImports: false },
      locale: 'zh-CN',
    }));
    expect(result.current.config.runOrganizeImports).toBe(false);
    expect(result.current.locale).toBe('zh-CN');
  });

  it('historyChanged replaces the history list', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => dispatch({
      type: 'formatFiles/historyChanged',
      history: [makeHistoryEntry('a'), makeHistoryEntry('b')],
    }));
    expect(result.current.history.map(e => e.id)).toEqual(['a', 'b']);
  });

  it('drives the run lifecycle: started → progress → fileDone → completed', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));

    act(() => dispatch({
      type: 'formatFiles/runStarted',
      runId: 'r1',
      mode: 'workspace',
      timestamp: 1000,
      totalFiles: 3,
    }));
    expect(result.current.run).toMatchObject({
      isRunning: true,
      runId: 'r1',
      mode: 'workspace',
      processed: 0,
      total: 3,
      startedAt: 1000,
      liveFileResults: [],
    });

    act(() => dispatch({
      type: 'formatFiles/runProgress',
      runId: 'r1',
      processed: 1,
      total: 3,
      currentFile: 'src/a.ts',
    }));
    expect(result.current.run.processed).toBe(1);
    expect(result.current.run.currentFile).toBe('src/a.ts');

    act(() => dispatch({
      type: 'formatFiles/runFileDone',
      runId: 'r1',
      result: { uri: 'file:///a.ts', relativePath: 'src/a.ts', status: 'ok', durationMs: 5 },
    }));
    expect(result.current.run.liveFileResults).toHaveLength(1);

    const entry = makeHistoryEntry('r1', 3);
    act(() => dispatch({ type: 'formatFiles/runCompleted', runId: 'r1', entry }));
    expect(result.current.run.isRunning).toBe(false);
    expect(result.current.run.lastEntry?.id).toBe('r1');
    expect(result.current.history[0].id).toBe('r1');
  });

  it('ignores stale runProgress and runFileDone from a different runId', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => dispatch({
      type: 'formatFiles/runStarted',
      runId: 'cur',
      mode: 'glob',
      timestamp: 0,
      totalFiles: 2,
    }));

    act(() => dispatch({
      type: 'formatFiles/runProgress',
      runId: 'old',
      processed: 9,
      total: 9,
      currentFile: 'ghost',
    }));
    expect(result.current.run.processed).toBe(0);

    act(() => dispatch({
      type: 'formatFiles/runFileDone',
      runId: 'old',
      result: { uri: 'file:///x', relativePath: 'x', status: 'ok', durationMs: 1 },
    }));
    expect(result.current.run.liveFileResults).toHaveLength(0);
  });

  it('collapses no-op runProgress events to the same state object', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => dispatch({
      type: 'formatFiles/runStarted',
      runId: 'r1',
      mode: 'workspace',
      timestamp: 0,
      totalFiles: 2,
    }));
    act(() => dispatch({
      type: 'formatFiles/runProgress',
      runId: 'r1',
      processed: 1,
      total: 2,
      currentFile: 'x.ts',
    }));
    const before = result.current.run;
    act(() => dispatch({
      type: 'formatFiles/runProgress',
      runId: 'r1',
      processed: 1,
      total: 2,
      currentFile: 'x.ts',
    }));
    expect(result.current.run).toBe(before);
  });

  it('dryRunReport message stores the report; confirmDryRun posts it and clears', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    const report = {
      runId: 'dr1',
      mode: 'workspace' as const,
      total: 2,
      byExtension: { '.ts': 2 },
      etaMs: 100,
      unknownFormatterExtensions: [],
      firstFiles: ['a.ts', 'b.ts'],
    };
    act(() => dispatch({ type: 'formatFiles/dryRunReport', report }));
    expect(result.current.pendingDryRun).toEqual(report);

    act(() => result.current.confirmDryRun(true));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'formatFiles/confirmDryRun',
      runId: 'dr1',
      proceed: true,
    });
    expect(result.current.pendingDryRun).toBeUndefined();
  });

  it('confirmDryRun is a no-op when there is no pending report', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => result.current.confirmDryRun(false));
    expect(mockVsCodeApi.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'formatFiles/confirmDryRun' }),
    );
  });

  it('log messages append to the logs array; clearLogs empties them', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => dispatch({
      type: 'formatFiles/log',
      entry: { level: 'info', source: 's', message: 'first', timestamp: 1 },
    }));
    act(() => dispatch({
      type: 'formatFiles/log',
      entry: { level: 'warn', source: 's', message: 'second', timestamp: 2 },
    }));
    expect(result.current.logs.map(l => l.message)).toEqual(['first', 'second']);

    act(() => result.current.clearLogs());
    expect(result.current.logs).toEqual([]);
  });

  it('updateSetting optimistically patches config and posts to extension', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => result.current.updateSetting('runOrganizeImports', false));
    expect(result.current.config.runOrganizeImports).toBe(false);
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'formatFiles/updateSetting',
      key: 'runOrganizeImports',
      value: false,
    });
  });

  it('updateGitScope merges patch over current scope and posts the merged value', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => dispatch({
      type: 'formatFiles/state',
      config: BASE_CONFIG,
      history: [],
      version: '1.0.0',
      isRunning: false,
      locale: 'en',
    }));
    act(() => result.current.updateGitScope({ includeStaged: false }));
    expect(result.current.config.gitScope.includeStaged).toBe(false);
    expect(result.current.config.gitScope.includeModified).toBe(true);
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'formatFiles/updateSetting',
        key: 'gitScope',
        value: expect.objectContaining({ includeStaged: false, includeModified: true }),
      }),
    );
  });

  it('runWorkspace / runFromGlob / runGitChanged / clearHistory / openOutputChannel post the right messages', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    act(() => result.current.runWorkspace());
    act(() => result.current.runFromGlob());
    act(() => result.current.runGitChanged());
    act(() => result.current.clearHistory());
    act(() => result.current.openOutputChannel());
    const types = mockVsCodeApi.postMessage.mock.calls.map(c => (c[0] as { type: string }).type);
    expect(types).toEqual([
      'formatFiles/runWorkspace',
      'formatFiles/runFromGlob',
      'formatFiles/runGitChanged',
      'formatFiles/clearHistory',
      'formatFiles/openOutputChannel',
    ]);
  });

  it('ignores messages without a string type and unknown types', () => {
    const { result } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    const before = result.current;
    act(() => dispatch(undefined));
    act(() => dispatch({ type: 42 }));
    act(() => dispatch({ type: 'theme/changed', kind: 'dark' }));
    expect(result.current).toBe(before);
  });

  it('removes its window message listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useFormatFilesState({ skipHandshake: true }));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    removeSpy.mockRestore();
  });
});
