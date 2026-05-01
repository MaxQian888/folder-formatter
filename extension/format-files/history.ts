import { HISTORY_MAX_ENTRIES } from '@shared/messages';

import { HISTORY_STATE_KEY } from './constants';

import type { RunHistoryEntry } from '@shared/messages';
import type { Memento } from 'vscode';

/**
 * Tiny persistence wrapper for the run history. Stored in the workspaceState
 * Memento so the panel can show "what happened in this workspace" across
 * sessions. Entries are append-only with a hard cap of `HISTORY_MAX_ENTRIES`
 * (oldest evicted first).
 */
export interface HistoryStore {
  list: () => RunHistoryEntry[];
  add: (entry: RunHistoryEntry) => Promise<RunHistoryEntry[]>;
  clear: () => Promise<void>;
}

function isEntry(value: unknown): value is RunHistoryEntry {
  if (!value || typeof value !== 'object')
    return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string'
    && typeof v.timestamp === 'number'
    && (v.mode === 'workspace' || v.mode === 'folder' || v.mode === 'glob' || v.mode === 'gitChanged')
    && typeof v.fileCount === 'number'
    && typeof v.processed === 'number'
    && typeof v.durationMs === 'number'
    && (v.status === 'completed' || v.status === 'aborted' || v.status === 'failed')
    // `fileResults` is optional. If present it must be an array; we trust the
    // shape of each entry rather than recursing here.
    && (v.fileResults === undefined || Array.isArray(v.fileResults));
}

export function createHistoryStore(memento: Memento): HistoryStore {
  // Deserialized once at construction; mutated in-memory on add/clear so
  // panel refreshes don't re-parse the Memento JSON every state push.
  const initial = memento.get<unknown>(HISTORY_STATE_KEY);
  let cache: RunHistoryEntry[] = Array.isArray(initial) ? initial.filter(isEntry) : [];

  return {
    list() {
      return cache;
    },
    async add(entry) {
      cache = [entry, ...cache].slice(0, HISTORY_MAX_ENTRIES);
      await memento.update(HISTORY_STATE_KEY, cache);
      return cache;
    },
    async clear() {
      cache = [];
      await memento.update(HISTORY_STATE_KEY, []);
    },
  };
}
