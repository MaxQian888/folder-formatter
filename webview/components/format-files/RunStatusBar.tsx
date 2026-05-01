import { MODE_KEY } from '@shared/i18n';

import { useT } from '@/i18n/I18nProvider';

import type { RunStatus } from '@/hooks/useFormatFilesState';
import type { DictKey } from '@shared/i18n';
import type { RunHistoryEntry } from '@shared/messages';

interface Props {
  run: RunStatus;
}

const STATUS_LABEL_KEY: Record<RunHistoryEntry['status'], DictKey> = {
  completed: 'run.completed.completed',
  aborted: 'run.completed.aborted',
  failed: 'run.completed.failed',
};

export function RunStatusBar({ run }: Props) {
  const t = useT();

  if (!run.isRunning && !run.lastEntry) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span>{t('run.idle.label')}</span>
        <span>{t('run.idle.hint')}</span>
      </div>
    );
  }

  if (run.isRunning) {
    const percent = run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;
    const modeLabel = run.mode ? t(MODE_KEY[run.mode]) : '';
    return (
      <div className="space-y-2 rounded-md border bg-muted/30 px-4 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            {t('run.running.prefix')}
            {' '}
            {modeLabel}
            {' '}
            {t('run.running.suffix')}
          </span>
          <span className="font-mono text-muted-foreground">
            {run.processed}
            {' / '}
            {run.total}
            {' · '}
            {percent}
            %
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
        {run.currentFile && (
          <div className="truncate font-mono text-muted-foreground" title={run.currentFile}>
            {run.currentFile}
          </div>
        )}
      </div>
    );
  }

  const e = run.lastEntry!;
  const status = t(STATUS_LABEL_KEY[e.status]);
  const summary = t('run.completed.summary', {
    processed: e.processed,
    total: e.fileCount,
    seconds: (e.durationMs / 1000).toFixed(1),
  });
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-4 py-2 text-xs lg:flex-row lg:items-center lg:justify-between">
      <span className="font-semibold">
        {status}
        {' · '}
        {t(MODE_KEY[e.mode])}
      </span>
      <span className="text-muted-foreground">
        {summary}
        {e.errorMessage ? ` · ${e.errorMessage}` : ''}
      </span>
    </div>
  );
}
