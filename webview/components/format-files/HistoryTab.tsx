import { formatDuration, formatYmdHms } from '@shared/format-time';
import { MODE_KEY } from '@shared/i18n';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/I18nProvider';

import type { DictKey } from '@shared/i18n';
import type { FileResultEntry, FileResultStatus, RunHistoryEntry } from '@shared/messages';

interface Props {
  history: RunHistoryEntry[];
  onClear: () => void;
}

const STATUS_VARIANT: Record<RunHistoryEntry['status'], 'default' | 'secondary' | 'destructive'> = {
  completed: 'default',
  aborted: 'secondary',
  failed: 'destructive',
};

const FILE_STATUS_VARIANT: Record<FileResultStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ok: 'default',
  unchanged: 'secondary',
  failed: 'destructive',
  skipped: 'outline',
};

const FILE_STATUS_KEY: Record<FileResultStatus, DictKey> = {
  ok: 'history.fileStatus.ok',
  unchanged: 'history.fileStatus.unchanged',
  failed: 'history.fileStatus.failed',
  skipped: 'history.fileStatus.skipped',
};

function summarize(results: FileResultEntry[] | undefined): { ok: number; unchanged: number; failed: number; skipped: number } {
  const acc = { ok: 0, unchanged: 0, failed: 0, skipped: 0 };
  if (!results)
    return acc;
  for (const r of results)
    acc[r.status]++;
  return acc;
}

function FileResultsTable({ results }: { results: FileResultEntry[] | undefined }) {
  const t = useT();
  if (!results || results.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-muted-foreground">
        {t('history.results.noFileResults')}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto border-t bg-muted/20">
      <table className="w-full text-xs">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('history.results.col.status')}</th>
            <th className="px-3 py-2 font-medium">{t('history.results.col.path')}</th>
            <th className="px-3 py-2 font-medium text-right">{t('history.results.col.duration')}</th>
            <th className="px-3 py-2 font-medium">{t('history.results.col.error')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {results.map((r, i) => (
            <tr key={`${r.uri}-${i}`} className="hover:bg-muted/40">
              <td className="px-3 py-1.5">
                <Badge variant={FILE_STATUS_VARIANT[r.status]} className="text-[10px]">
                  {t(FILE_STATUS_KEY[r.status])}
                </Badge>
              </td>
              <td className="px-3 py-1.5 truncate font-mono" title={r.relativePath}>
                {r.relativePath}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                {formatDuration(r.durationMs)}
              </td>
              <td className="px-3 py-1.5 text-destructive">
                {r.errorMessage ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryRow({ entry }: { entry: RunHistoryEntry }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const summary = summarize(entry.fileResults);
  const hasResults = !!entry.fileResults && entry.fileResults.length > 0;

  return (
    <>
      <tr className="hover:bg-muted/40">
        <td className="px-3 py-2">
          <button
            type="button"
            className="flex items-center gap-1 rounded p-0.5 hover:bg-muted disabled:opacity-40"
            aria-label={t('history.expandToggle')}
            onClick={() => setExpanded(v => !v)}
            disabled={!hasResults}
          >
            {expanded
              ? <ChevronDown className="size-3.5" />
              : <ChevronRight className="size-3.5" />}
          </button>
        </td>
        <td className="px-3 py-2 font-mono text-xs">{formatYmdHms(entry.timestamp)}</td>
        <td className="px-3 py-2">
          <Badge variant="outline">{t(MODE_KEY[entry.mode])}</Badge>
        </td>
        <td className="px-3 py-2">
          <Badge variant={STATUS_VARIANT[entry.status]}>{entry.status}</Badge>
        </td>
        <td className="px-3 py-2 text-right">
          {`${entry.processed} / ${entry.fileCount}`}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">{formatDuration(entry.durationMs)}</td>
        <td className="px-3 py-2 truncate text-xs text-muted-foreground" title={entry.workspaceFolder}>
          {entry.workspaceFolder ?? t('common.unknown')}
        </td>
      </tr>
      {expanded && hasResults && (
        <tr>
          <td colSpan={7} className="p-0">
            <div className="border-l-2 border-primary/40 bg-muted/10">
              <p className="px-3 py-1 text-[11px] text-muted-foreground">
                {t('history.results.summary', summary)}
              </p>
              <FileResultsTable results={entry.fileResults} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function HistoryTab({ history, onClear }: Props) {
  const t = useT();
  const plural = history.length === 1 ? '' : 's';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t('history.title')}</CardTitle>
          <CardDescription>
            {t('history.description', { n: history.length, plural })}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          disabled={history.length === 0}
        >
          <Trash2 className="mr-2 size-4" />
          {t('history.clear')}
        </Button>
      </CardHeader>
      <CardContent>
        {history.length === 0
          ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t('history.empty')}
              </p>
            )
          : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 px-3 py-2 font-medium" />
                      <th className="px-3 py-2 font-medium">{t('history.col.when')}</th>
                      <th className="px-3 py-2 font-medium">{t('history.col.mode')}</th>
                      <th className="px-3 py-2 font-medium">{t('history.col.status')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('history.col.files')}</th>
                      <th className="px-3 py-2 font-medium text-right">{t('history.col.duration')}</th>
                      <th className="px-3 py-2 font-medium">{t('history.col.workspace')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {history.map(entry => (
                      <HistoryRow key={entry.id} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </CardContent>
    </Card>
  );
}
