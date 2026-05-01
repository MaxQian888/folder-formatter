import { DEFAULT_FORMAT_FILES_CONFIG, HISTORY_MAX_ENTRIES } from '@shared/messages';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { useVscodeApi } from './useVscodeApi';

import type {
  DryRunReport,
  ExtensionToWebviewMessage,
  FileResultEntry,
  FormatFilesConfigShape,
  FormatFilesRunMode,
  GitScopeConfig,
  Locale,
  LogEntry,
  RunHistoryEntry,
  WebviewToExtensionMessage,
} from '@shared/messages';

const DEFAULT_CONFIG = DEFAULT_FORMAT_FILES_CONFIG;

const MAX_LOG_ENTRIES = 500;
const LIVE_FILE_RESULTS_CAP = 500;

export interface RunStatus {
  isRunning: boolean;
  runId?: string;
  mode?: FormatFilesRunMode;
  processed: number;
  total: number;
  currentFile?: string;
  startedAt?: number;
  lastEntry?: RunHistoryEntry;
  /** Per-file results streamed during the run (capped to {@link LIVE_FILE_RESULTS_CAP}). */
  liveFileResults: FileResultEntry[];
}

interface State {
  ready: boolean;
  version: string;
  locale: Locale;
  config: FormatFilesConfigShape;
  history: RunHistoryEntry[];
  logs: LogEntry[];
  run: RunStatus;
  pendingDryRun?: DryRunReport;
}

const INITIAL_STATE: State = {
  ready: false,
  version: '0.0.0',
  locale: 'en',
  config: DEFAULT_CONFIG,
  history: [],
  logs: [],
  run: { isRunning: false, processed: 0, total: 0, liveFileResults: [] },
  pendingDryRun: undefined,
};

type Action
  = | { type: 'state'; payload: { config: FormatFilesConfigShape; history: RunHistoryEntry[]; version: string; isRunning: boolean; locale: Locale } }
    | { type: 'configChanged'; config: FormatFilesConfigShape; locale: Locale }
    | { type: 'historyChanged'; history: RunHistoryEntry[] }
    | { type: 'runStarted'; runId: string; mode: FormatFilesRunMode; timestamp: number; totalFiles: number }
    | { type: 'runProgress'; runId: string; processed: number; total: number; currentFile: string }
    | { type: 'runFileDone'; runId: string; result: FileResultEntry }
    | { type: 'runCompleted'; runId: string; entry: RunHistoryEntry }
    | { type: 'dryRunReport'; report: DryRunReport }
    | { type: 'clearDryRun' }
    | { type: 'log'; entry: LogEntry }
    | { type: 'clearLogs' }
    | { type: 'optimistic-config'; patch: Partial<FormatFilesConfigShape> };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'state':
      return {
        ...state,
        ready: true,
        config: { ...DEFAULT_CONFIG, ...action.payload.config },
        history: action.payload.history,
        version: action.payload.version,
        locale: action.payload.locale ?? state.locale,
        run: { ...state.run, isRunning: action.payload.isRunning },
      };
    case 'configChanged':
      return {
        ...state,
        config: { ...DEFAULT_CONFIG, ...action.config },
        locale: action.locale ?? state.locale,
      };
    case 'historyChanged':
      return { ...state, history: action.history };
    case 'runStarted':
      return {
        ...state,
        pendingDryRun: undefined,
        run: {
          isRunning: true,
          runId: action.runId,
          mode: action.mode,
          processed: 0,
          total: action.totalFiles,
          currentFile: undefined,
          startedAt: action.timestamp,
          liveFileResults: [],
        },
      };
    case 'runProgress':
      // Ignore stale events from a previous run.
      if (state.run.runId && action.runId !== state.run.runId)
        return state;
      // Skip no-op dispatches — the format loop emits two events per file
      // (start + end) and they collapse to identical state at the run boundary.
      if (
        state.run.isRunning
        && state.run.runId === action.runId
        && state.run.processed === action.processed
        && state.run.total === action.total
        && state.run.currentFile === action.currentFile
      ) {
        return state;
      }
      return {
        ...state,
        run: {
          ...state.run,
          isRunning: true,
          runId: action.runId,
          processed: action.processed,
          total: action.total,
          currentFile: action.currentFile,
        },
      };
    case 'runFileDone': {
      if (state.run.runId && action.runId !== state.run.runId)
        return state;
      const next = state.run.liveFileResults.length >= LIVE_FILE_RESULTS_CAP
        ? state.run.liveFileResults
        : [...state.run.liveFileResults, action.result];
      return { ...state, run: { ...state.run, liveFileResults: next } };
    }
    case 'runCompleted':
      return {
        ...state,
        history: [action.entry, ...state.history].slice(0, HISTORY_MAX_ENTRIES),
        run: {
          isRunning: false,
          runId: action.runId,
          processed: action.entry.processed,
          total: action.entry.fileCount,
          startedAt: state.run.startedAt,
          mode: action.entry.mode,
          currentFile: undefined,
          lastEntry: action.entry,
          liveFileResults: state.run.liveFileResults,
        },
      };
    case 'dryRunReport':
      return { ...state, pendingDryRun: action.report };
    case 'clearDryRun':
      return { ...state, pendingDryRun: undefined };
    case 'log': {
      const next = [...state.logs, action.entry];
      if (next.length > MAX_LOG_ENTRIES)
        next.splice(0, next.length - MAX_LOG_ENTRIES);
      return { ...state, logs: next };
    }
    case 'clearLogs':
      return { ...state, logs: [] };
    case 'optimistic-config':
      return { ...state, config: { ...state.config, ...action.patch } };
    default:
      return state;
  }
}

export interface UseFormatFilesStateReturn {
  ready: boolean;
  version: string;
  locale: Locale;
  config: FormatFilesConfigShape;
  history: RunHistoryEntry[];
  logs: LogEntry[];
  run: RunStatus;
  pendingDryRun?: DryRunReport;
  updateSetting: <K extends keyof FormatFilesConfigShape>(key: K, value: FormatFilesConfigShape[K]) => void;
  updateGitScope: (patch: Partial<GitScopeConfig>) => void;
  runWorkspace: () => void;
  runFromGlob: () => void;
  runGitChanged: () => void;
  confirmDryRun: (proceed: boolean) => void;
  clearHistory: () => void;
  openOutputChannel: () => void;
  clearLogs: () => void;
}

interface UseFormatFilesStateOptions {
  /** Used only in tests/storybook to seed without a vscode message round-trip. */
  initialState?: Partial<State>;
  /** Disable the `webview/ready` handshake (for unit testing). */
  skipHandshake?: boolean;
}

export function useFormatFilesState(options: UseFormatFilesStateOptions = {}): UseFormatFilesStateReturn {
  const api = useVscodeApi();
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL_STATE,
    ...options.initialState,
  });

  const send = useCallback(
    (msg: WebviewToExtensionMessage) => api.postMessage(msg),
    [api],
  );

  // Track whether we have already requested initial state to dedupe.
  const handshakeSentRef = useRef(false);

  useEffect(() => {
    function listener(event: MessageEvent): void {
      const msg = event.data as ExtensionToWebviewMessage | undefined;
      if (!msg || typeof msg.type !== 'string')
        return;
      switch (msg.type) {
        case 'formatFiles/state':
          dispatch({
            type: 'state',
            payload: {
              config: msg.config,
              history: msg.history,
              version: msg.version,
              isRunning: msg.isRunning,
              locale: msg.locale,
            },
          });
          break;
        case 'formatFiles/configChanged':
          dispatch({ type: 'configChanged', config: msg.config, locale: msg.locale });
          break;
        case 'formatFiles/historyChanged':
          dispatch({ type: 'historyChanged', history: msg.history });
          break;
        case 'formatFiles/runStarted':
          dispatch({
            type: 'runStarted',
            runId: msg.runId,
            mode: msg.mode,
            timestamp: msg.timestamp,
            totalFiles: msg.totalFiles,
          });
          break;
        case 'formatFiles/runProgress':
          dispatch({
            type: 'runProgress',
            runId: msg.runId,
            processed: msg.processed,
            total: msg.total,
            currentFile: msg.currentFile,
          });
          break;
        case 'formatFiles/runFileDone':
          dispatch({ type: 'runFileDone', runId: msg.runId, result: msg.result });
          break;
        case 'formatFiles/runCompleted':
          dispatch({
            type: 'runCompleted',
            runId: msg.runId,
            entry: msg.entry,
          });
          break;
        case 'formatFiles/dryRunReport':
          dispatch({ type: 'dryRunReport', report: msg.report });
          break;
        case 'formatFiles/log':
          dispatch({ type: 'log', entry: msg.entry });
          break;
        default:
          // Other message types (hello/theme/state/restore) are not consumed here.
          break;
      }
    }
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  useEffect(() => {
    if (options.skipHandshake)
      return;
    if (handshakeSentRef.current)
      return;
    handshakeSentRef.current = true;
    send({ type: 'webview/ready' });
    send({ type: 'formatFiles/getState' });
  }, [send, options.skipHandshake]);

  const updateSetting = useCallback(
    <K extends keyof FormatFilesConfigShape>(key: K, value: FormatFilesConfigShape[K]) => {
      dispatch({ type: 'optimistic-config', patch: { [key]: value } as Partial<FormatFilesConfigShape> });
      send({ type: 'formatFiles/updateSetting', key, value });
    },
    [send],
  );

  const updateGitScope = useCallback(
    (patch: Partial<GitScopeConfig>) => {
      // Optimistic merge so the toggle visibly flips immediately.
      // The host fans this out into 3 individual `gitScope.includeX` writes.
      dispatch({
        type: 'optimistic-config',
        patch: { gitScope: { ...DEFAULT_CONFIG.gitScope, ...state.config.gitScope, ...patch } },
      });
      send({
        type: 'formatFiles/updateSetting',
        key: 'gitScope',
        value: { ...state.config.gitScope, ...patch },
      });
    },
    [send, state.config.gitScope],
  );

  const runWorkspace = useCallback(() => send({ type: 'formatFiles/runWorkspace' }), [send]);
  const runFromGlob = useCallback(() => send({ type: 'formatFiles/runFromGlob' }), [send]);
  const runGitChanged = useCallback(() => send({ type: 'formatFiles/runGitChanged' }), [send]);
  const confirmDryRun = useCallback(
    (proceed: boolean) => {
      const runId = state.pendingDryRun?.runId;
      if (!runId)
        return;
      dispatch({ type: 'clearDryRun' });
      send({ type: 'formatFiles/confirmDryRun', runId, proceed });
    },
    [send, state.pendingDryRun?.runId],
  );
  const clearHistory = useCallback(() => send({ type: 'formatFiles/clearHistory' }), [send]);
  const openOutputChannel = useCallback(() => send({ type: 'formatFiles/openOutputChannel' }), [send]);
  const clearLogs = useCallback(() => dispatch({ type: 'clearLogs' }), []);

  return useMemo(
    () => ({
      ready: state.ready,
      version: state.version,
      locale: state.locale,
      config: state.config,
      history: state.history,
      logs: state.logs,
      run: state.run,
      pendingDryRun: state.pendingDryRun,
      updateSetting,
      updateGitScope,
      runWorkspace,
      runFromGlob,
      runGitChanged,
      confirmDryRun,
      clearHistory,
      openOutputChannel,
      clearLogs,
    }),
    [
      state,
      updateSetting,
      updateGitScope,
      runWorkspace,
      runFromGlob,
      runGitChanged,
      confirmDryRun,
      clearHistory,
      openOutputChannel,
      clearLogs,
    ],
  );
}
