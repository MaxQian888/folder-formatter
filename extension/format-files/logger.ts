import { formatHms } from '@shared/format-time';
import { LOG_LEVEL_RANK } from '@shared/messages';
import { window, workspace } from 'vscode';

import { normalizeLogLevel } from './config-utils';
import { CONFIG_SECTION, OUTPUT_CHANNEL_NAME } from './constants';

import type { FormatFilesLogLevel, LogEntry } from '@shared/messages';
import type { Disposable, OutputChannel } from 'vscode';

const LEVEL_LABEL: Record<FormatFilesLogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

export type LogSink = (entry: LogEntry) => void;

export interface FormatFilesLogger {
  debug: (source: string, message: string) => void;
  info: (source: string, message: string) => void;
  warn: (source: string, message: string, error?: unknown) => void;
  error: (source: string, message: string, error?: unknown) => void;
  appendDivider: () => void;
  show: (preserveFocus?: boolean) => void;
  channel: OutputChannel;
  setLevel: (level: FormatFilesLogLevel) => void;
  getLevel: () => FormatFilesLogLevel;
  addSink: (sink: LogSink) => () => void;
  dispose: () => void;
}

function appendError(channel: OutputChannel, error: unknown): void {
  if (!error)
    return;
  if (error instanceof Error) {
    channel.appendLine(error.stack ?? `${error.name}: ${error.message}`);
    return;
  }
  try {
    channel.appendLine(JSON.stringify(error));
  }
  catch {
    channel.appendLine(String(error));
  }
}

export function createFormatFilesLogger(): FormatFilesLogger {
  const channel = window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  let level: FormatFilesLogLevel = normalizeLogLevel(
    workspace.getConfiguration(CONFIG_SECTION).get<string>('logLevel'),
  );
  const sinks = new Set<LogSink>();

  const configWatcher: Disposable = workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(`${CONFIG_SECTION}.logLevel`)) {
      level = normalizeLogLevel(
        workspace.getConfiguration(CONFIG_SECTION).get<string>('logLevel'),
      );
    }
  });

  function emit(entryLevel: FormatFilesLogLevel, source: string, message: string, error?: unknown): void {
    if (LOG_LEVEL_RANK[entryLevel] < LOG_LEVEL_RANK[level])
      return;
    const now = new Date();
    const line = `[${formatHms(now)} ${LEVEL_LABEL[entryLevel]}] (${source}) ${message}`;
    channel.appendLine(line);
    if (error !== undefined)
      appendError(channel, error);

    if (sinks.size > 0) {
      const entry: LogEntry = {
        level: entryLevel,
        source,
        message: error instanceof Error
          ? `${message}\n${error.stack ?? error.message}`
          : error !== undefined
            ? `${message}\n${typeof error === 'string' ? error : JSON.stringify(error)}`
            : message,
        timestamp: now.getTime(),
      };
      for (const sink of sinks) {
        try {
          sink(entry);
        }
        catch {
          // sink isolation — never let a misbehaving listener break logging
        }
      }
    }
  }

  return {
    debug: (source, message) => emit('debug', source, message),
    info: (source, message) => emit('info', source, message),
    warn: (source, message, error) => emit('warn', source, message, error),
    error: (source, message, error) => emit('error', source, message, error),
    appendDivider: () => channel.appendLine(':'),
    show: (preserveFocus = true) => channel.show(preserveFocus),
    channel,
    setLevel: (newLevel) => {
      level = newLevel;
    },
    getLevel: () => level,
    addSink: (sink) => {
      sinks.add(sink);
      return () => {
        sinks.delete(sink);
      };
    },
    dispose: () => {
      configWatcher.dispose();
      channel.dispose();
      sinks.clear();
    },
  };
}
