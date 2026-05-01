import { formatHms } from '@shared/format-time';
import { LOG_LEVEL_RANK } from '@shared/messages';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/i18n/I18nProvider';

import type { FormatFilesLogLevel, LogEntry } from '@shared/messages';

interface Props {
  logs: LogEntry[];
  onClearLogs: () => void;
  onOpenOutputChannel: () => void;
}

type LevelFilter = 'all' | FormatFilesLogLevel;

const LEVEL_COLOR: Record<FormatFilesLogLevel, string> = {
  debug: 'text-muted-foreground',
  info: 'text-foreground',
  warn: 'text-yellow-500',
  error: 'text-destructive',
};

// Cache lowercased "source message" haystacks per entry so search keystrokes
// don't re-allocate strings for every log line on every render.
const HAYSTACK_CACHE = new WeakMap<LogEntry, string>();
function haystackOf(entry: LogEntry): string {
  let s = HAYSTACK_CACHE.get(entry);
  if (s === undefined) {
    s = `${entry.source} ${entry.message}`.toLowerCase();
    HAYSTACK_CACHE.set(entry, s);
  }
  return s;
}

export function LogsTab({ logs, onClearLogs, onOpenOutputChannel }: Props) {
  const t = useT();
  const [filter, setFilter] = useState<LevelFilter>('all');
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const minRank = filter === 'all' ? -1 : LOG_LEVEL_RANK[filter];
    const term = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (entry === undefined)
        return false;
      if (LOG_LEVEL_RANK[entry.level] < minRank)
        return false;
      if (term && !haystackOf(entry).includes(term))
        return false;
      return true;
    });
  }, [logs, filter, search]);

  // Auto-scroll to bottom when new logs arrive (unless user scrolled up).
  const stickyRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickyRef.current)
      return;
    el.scrollTop = el.scrollHeight;
  }, [filtered]);

  function onScroll(): void {
    const el = scrollRef.current;
    if (!el)
      return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickyRef.current = distanceFromBottom < 32;
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-col gap-3 space-y-0 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>{t('logs.title')}</CardTitle>
          <CardDescription>
            {t('logs.descriptionBefore', { n: logs.length })}
            {' '}
            <strong>{t('app.footer.outputChannelName')}</strong>
            {' '}
            {t('logs.descriptionAfter')}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={v => setFilter(v as LevelFilter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('logs.filterAll')}</SelectItem>
              <SelectItem value="debug">{t('logs.filterDebug')}</SelectItem>
              <SelectItem value="info">{t('logs.filterInfo')}</SelectItem>
              <SelectItem value="warn">{t('logs.filterWarn')}</SelectItem>
              <SelectItem value="error">{t('logs.filterError')}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('logs.searchPlaceholder')}
            className="w-48"
          />
          <Button variant="outline" size="sm" onClick={onClearLogs} disabled={logs.length === 0}>
            <Trash2 className="mr-2 size-4" />
            {t('logs.clear')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenOutputChannel}>
            <ExternalLink className="mr-2 size-4" />
            {t('logs.openOutputChannel')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="max-h-[60vh] min-h-[16rem] overflow-y-auto border-t bg-card font-mono text-xs"
        >
          {filtered.length === 0
            ? (
                <p className="p-6 text-center text-muted-foreground">
                  {logs.length > 0 ? t('logs.emptyFiltered') : t('logs.emptyAll')}
                </p>
              )
            : (
                <ul className="divide-y">
                  {filtered.map((entry, i) => (
                    <li key={`${entry.timestamp}-${i}`} className="flex gap-2 px-3 py-1">
                      <span className="shrink-0 text-muted-foreground">{formatHms(entry.timestamp)}</span>
                      <span className={`shrink-0 uppercase ${LEVEL_COLOR[entry.level]}`}>
                        {entry.level}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        (
                        {entry.source}
                        )
                      </span>
                      <span className="break-all whitespace-pre-wrap">{entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </CardContent>
    </Card>
  );
}
