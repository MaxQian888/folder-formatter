import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n/I18nProvider';

import type { FormatFilesConfigShape, FormatFilesLogLevel, GitScopeConfig } from '@shared/messages';
import type { ReactNode } from 'react';

function SwitchRow(props: {
  id: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={props.id}>{props.label}</Label>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
      <Switch id={props.id} checked={props.checked} onCheckedChange={props.onChange} />
    </div>
  );
}

interface Props {
  config: FormatFilesConfigShape;
  onUpdate: <K extends keyof FormatFilesConfigShape>(key: K, value: FormatFilesConfigShape[K]) => void;
  onUpdateGitScope: (patch: Partial<GitScopeConfig>) => void;
}

/** Generic debounced text-field bound to a comma-joined config string. */
function CommaListField(props: {
  id: string;
  label: string;
  description: string;
  placeholder?: string;
  values: string[];
  onCommit: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState(props.values.join(','));
  const lastCommittedRef = useRef(props.values.join(','));

  useEffect(() => {
    const incoming = props.values.join(',');
    if (incoming !== lastCommittedRef.current) {
      setDraft(incoming);
      lastCommittedRef.current = incoming;
    }
  }, [props.values]);

  function commit(): void {
    const next = draft.split(',').map(s => s.trim()).filter(Boolean);
    const joined = next.join(',');
    if (joined === lastCommittedRef.current)
      return;
    lastCommittedRef.current = joined;
    props.onCommit(next);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter')
            commit();
        }}
        placeholder={props.placeholder}
      />
      <p className="text-xs text-muted-foreground">{props.description}</p>
    </div>
  );
}

function FolderListField(props: {
  values: string[];
  onCommit: (next: string[]) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState('');

  function add(): void {
    const trimmed = draft.trim();
    if (!trimmed)
      return;
    if (props.values.includes(trimmed)) {
      setDraft('');
      return;
    }
    props.onCommit([...props.values, trimmed]);
    setDraft('');
  }

  function remove(idx: number): void {
    props.onCommit(props.values.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="excludedFolders">{t('settings.filters.foldersLabel')}</Label>
      <div className="flex flex-wrap gap-2">
        {props.values.length === 0 && (
          <span className="text-xs text-muted-foreground">{t('settings.filters.foldersEmpty')}</span>
        )}
        {props.values.map((folder, i) => (
          <Badge key={`${folder}-${i}`} variant="secondary" className="gap-1 pr-1">
            <span className="font-mono text-xs">{folder}</span>
            <button
              type="button"
              aria-label={t('settings.filters.foldersRemove', { name: folder })}
              className="ml-1 rounded p-0.5 hover:bg-destructive/20"
              onClick={() => remove(i)}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id="excludedFolders"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('settings.filters.foldersPlaceholder')}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
          <Plus className="size-4" />
          {t('settings.filters.foldersAdd')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('settings.filters.foldersHelpBefore')}
        {' '}
        <code className="rounded bg-muted px-1">**/&lt;name&gt;/**</code>
        {' '}
        {t('settings.filters.foldersHelpAfter')}
      </p>
    </div>
  );
}

export function SettingsTab({ config, onUpdate, onUpdateGitScope }: Props) {
  const t = useT();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.filters.title')}</CardTitle>
          <CardDescription>{t('settings.filters.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CommaListField
            id="extensionsToInclude"
            label={t('settings.filters.extensionsLabel')}
            placeholder={t('settings.filters.extensionsPlaceholder')}
            description={t('settings.filters.extensionsHelp')}
            values={config.extensionsToInclude.map(e => e.replace(/^\./, ''))}
            onCommit={next => onUpdate('extensionsToInclude', next.map(e => e.startsWith('.') ? e : `.${e}`))}
          />
          <Separator />
          <FolderListField
            values={config.excludedFolders}
            onCommit={next => onUpdate('excludedFolders', next)}
          />
          <Separator />
          <CommaListField
            id="excludePattern"
            label={t('settings.filters.globLabel')}
            placeholder={t('settings.filters.globPlaceholder')}
            description={t('settings.filters.globHelp')}
            values={config.excludePattern}
            onCommit={next => onUpdate('excludePattern', next)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.behavior.title')}</CardTitle>
          <CardDescription>{t('settings.behavior.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SwitchRow
            id="runOrganizeImports"
            label={t('settings.behavior.organizeImportsLabel')}
            description={(
              <>
                {t('settings.behavior.organizeImportsHelpBefore')}
                {' '}
                <code className="rounded bg-muted px-1">editor.action.organizeImports</code>
                {' '}
                {t('settings.behavior.organizeImportsHelpAfter')}
              </>
            )}
            checked={config.runOrganizeImports}
            onChange={v => onUpdate('runOrganizeImports', v)}
          />
          <Separator />
          <SwitchRow
            id="useGitIgnore"
            label={t('settings.behavior.gitignoreLabel')}
            description={(
              <>
                {t('settings.behavior.gitignoreHelpBefore')}
                {' '}
                <code className="rounded bg-muted px-1">.gitignore</code>
                {' '}
                {t('settings.behavior.gitignoreHelpAfter')}
              </>
            )}
            checked={config.useGitIgnore}
            onChange={v => onUpdate('useGitIgnore', v)}
          />
          <Separator />
          <SwitchRow
            id="inheritWorkspaceExcludedFiles"
            label={t('settings.behavior.inheritLabel')}
            description={(
              <>
                {t('settings.behavior.inheritHelpBefore')}
                {' '}
                <code className="rounded bg-muted px-1">files.exclude</code>
                {' '}
                {t('settings.behavior.inheritHelpAfter')}
              </>
            )}
            checked={config.inheritWorkspaceExcludedFiles}
            onChange={v => onUpdate('inheritWorkspaceExcludedFiles', v)}
          />
          <Separator />
          <SwitchRow
            id="dryRunFirst"
            label={t('settings.behavior.dryRunLabel')}
            description={t('settings.behavior.dryRunHelp')}
            checked={config.dryRunFirst}
            onChange={v => onUpdate('dryRunFirst', v)}
          />
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="logLevel">{t('settings.behavior.logLevelLabel')}</Label>
            <Select
              value={config.logLevel}
              onValueChange={v => onUpdate('logLevel', v as FormatFilesLogLevel)}
            >
              <SelectTrigger id="logLevel" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debug">debug</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.behavior.logLevelHelpBefore')}
              {' '}
              <strong>{t('app.footer.outputChannelName')}</strong>
              {' '}
              {t('settings.behavior.logLevelHelpAfter')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.git.title')}</CardTitle>
          <CardDescription>{t('settings.git.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SwitchRow
            id="gitScopeStaged"
            label={t('settings.git.includeStagedLabel')}
            description={t('settings.git.includeStagedHelp')}
            checked={config.gitScope.includeStaged}
            onChange={v => onUpdateGitScope({ includeStaged: v })}
          />
          <Separator />
          <SwitchRow
            id="gitScopeModified"
            label={t('settings.git.includeModifiedLabel')}
            description={t('settings.git.includeModifiedHelp')}
            checked={config.gitScope.includeModified}
            onChange={v => onUpdateGitScope({ includeModified: v })}
          />
          <Separator />
          <SwitchRow
            id="gitScopeUntracked"
            label={t('settings.git.includeUntrackedLabel')}
            description={t('settings.git.includeUntrackedHelp')}
            checked={config.gitScope.includeUntracked}
            onChange={v => onUpdateGitScope({ includeUntracked: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance.title')}</CardTitle>
          <CardDescription>{t('settings.appearance.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="locale">{t('settings.appearance.localeLabel')}</Label>
          <Select
            value={config.locale}
            onValueChange={v => onUpdate('locale', v as FormatFilesConfigShape['locale'])}
          >
            <SelectTrigger id="locale" className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('settings.appearance.localeAuto')}</SelectItem>
              <SelectItem value="en">{t('settings.appearance.localeEn')}</SelectItem>
              <SelectItem value="zh-CN">{t('settings.appearance.localeZhCn')}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
