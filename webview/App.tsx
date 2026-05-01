import { Code2, FolderTree, GitBranch, History, Play, ScrollText, Settings as SettingsIcon, Wand2 } from 'lucide-react';

import { DryRunPanel } from '@/components/format-files/DryRunPanel';
import { HistoryTab } from '@/components/format-files/HistoryTab';
import { LogsTab } from '@/components/format-files/LogsTab';
import { RunStatusBar } from '@/components/format-files/RunStatusBar';
import { SettingsTab } from '@/components/format-files/SettingsTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFormatFilesState } from '@/hooks/useFormatFilesState';
import { I18nProvider, useT } from '@/i18n/I18nProvider';

import './index.css';

function AppContent() {
  const {
    ready,
    version,
    locale,
    config,
    history,
    logs,
    run,
    pendingDryRun,
    updateSetting,
    updateGitScope,
    runWorkspace,
    runFromGlob,
    runGitChanged,
    confirmDryRun,
    clearHistory,
    openOutputChannel,
    clearLogs,
  } = useFormatFilesState();

  return (
    <I18nProvider locale={locale}>
      <AppShell
        ready={ready}
        version={version}
        config={config}
        history={history}
        logs={logs}
        run={run}
        pendingDryRun={pendingDryRun}
        updateSetting={updateSetting}
        updateGitScope={updateGitScope}
        runWorkspace={runWorkspace}
        runFromGlob={runFromGlob}
        runGitChanged={runGitChanged}
        confirmDryRun={confirmDryRun}
        clearHistory={clearHistory}
        openOutputChannel={openOutputChannel}
        clearLogs={clearLogs}
      />
    </I18nProvider>
  );
}

type AppShellProps = Omit<ReturnType<typeof useFormatFilesState>, 'locale'>;

function AppShell(props: AppShellProps) {
  const t = useT();
  const {
    ready,
    version,
    config,
    history,
    logs,
    run,
    pendingDryRun,
    updateSetting,
    updateGitScope,
    runWorkspace,
    runFromGlob,
    runGitChanged,
    confirmDryRun,
    clearHistory,
    openOutputChannel,
    clearLogs,
  } = props;

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Wand2 className="size-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">{t('app.title')}</h1>
            <p className="text-xs text-muted-foreground">
              {t('app.subtitle')}
            </p>
          </div>
          <Badge variant="outline" className="ml-2 font-mono text-xs">
            {`v${version}`}
          </Badge>
          {!ready && (
            <Badge variant="secondary" className="ml-1 text-xs">{t('app.connecting')}</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runWorkspace} disabled={run.isRunning}>
            <Play className="mr-2 size-4" />
            {t('app.runWorkspace')}
          </Button>
          <Button variant="secondary" onClick={runGitChanged} disabled={run.isRunning}>
            <GitBranch className="mr-2 size-4" />
            {t('app.runGitChanged')}
          </Button>
          <Button variant="secondary" onClick={runFromGlob} disabled={run.isRunning}>
            <FolderTree className="mr-2 size-4" />
            {t('app.runFromGlob')}
          </Button>
        </div>
      </header>

      <Separator />

      {pendingDryRun && (
        <DryRunPanel report={pendingDryRun} onConfirm={confirmDryRun} />
      )}

      <RunStatusBar run={run} />

      <Tabs defaultValue="settings" className="flex-1">
        <TabsList>
          <TabsTrigger value="settings">
            <SettingsIcon className="mr-1 size-4" />
            {t('app.tab.settings')}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1 size-4" />
            {t('app.tab.history')}
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {history.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="mr-1 size-4" />
            {t('app.tab.logs')}
            {logs.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {logs.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab config={config} onUpdate={updateSetting} onUpdateGitScope={updateGitScope} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab history={history} onClear={clearHistory} />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsTab logs={logs} onClearLogs={clearLogs} onOpenOutputChannel={openOutputChannel} />
        </TabsContent>
      </Tabs>

      <footer className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Code2 className="size-3" />
          {t('app.footer.inspiredBy')}
        </span>
        <span>
          {t('app.footer.outputChannel')}
          {' '}
          <strong>{t('app.footer.outputChannelName')}</strong>
        </span>
      </footer>
    </main>
  );
}

export default AppContent;
