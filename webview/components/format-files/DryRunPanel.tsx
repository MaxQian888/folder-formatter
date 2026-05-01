import { formatDuration } from '@shared/format-time';
import { MODE_KEY } from '@shared/i18n';
import { AlertTriangle, FileSearch, Play, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/I18nProvider';

import type { DryRunReport } from '@shared/messages';

interface Props {
  report: DryRunReport;
  onConfirm: (proceed: boolean) => void;
}

export function DryRunPanel({ report, onConfirm }: Props) {
  const t = useT();
  const sortedExtensions = Object.entries(report.byExtension).sort((a, b) => b[1] - a[1]);

  return (
    <Card data-testid="dry-run-panel" className="border-primary/40 bg-primary/[0.03]">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <FileSearch className="mt-1 size-5 text-primary" />
          <div>
            <CardTitle>{t('dryRun.title')}</CardTitle>
            <CardDescription>{t('dryRun.subtitle')}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfirm(false)}
            data-testid="dry-run-cancel"
          >
            <X className="mr-2 size-4" />
            {t('dryRun.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(true)}
            data-testid="dry-run-confirm"
          >
            <Play className="mr-2 size-4" />
            {t('dryRun.confirm')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('dryRun.totalLabel')}</div>
            <div className="font-mono text-lg">{report.total}</div>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('dryRun.modeLabel')}</div>
            <div className="font-mono text-sm">{t(MODE_KEY[report.mode])}</div>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('dryRun.etaLabel')}</div>
            <div className="font-mono text-sm">{formatDuration(report.etaMs)}</div>
          </div>
        </div>

        {sortedExtensions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{t('dryRun.byExtensionTitle')}</h4>
            <div className="flex flex-wrap gap-1.5">
              {sortedExtensions.map(([ext, count]) => (
                <Badge key={ext} variant="secondary" className="font-mono text-xs">
                  {ext}
                  <span className="ml-1 text-muted-foreground">·</span>
                  <span className="ml-1">{count}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {report.unknownFormatterExtensions.length > 0 && (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-3">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
              <div className="space-y-1">
                <div className="font-medium">{t('dryRun.unknownFormatterTitle')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {report.unknownFormatterExtensions.map(ext => (
                    <Badge key={ext} variant="outline" className="font-mono text-xs">
                      {ext}
                    </Badge>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{t('dryRun.unknownFormatterHint')}</div>
              </div>
            </div>
          </div>
        )}

        {report.firstFiles.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{t('dryRun.firstFilesTitle')}</h4>
            <ul className="rounded-md border bg-card p-2 font-mono text-xs">
              {report.firstFiles.map(path => (
                <li key={path} className="truncate" title={path}>{path}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
