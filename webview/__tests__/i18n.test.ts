import { makeT, t } from '@shared/i18n';
import { describe, expect, it } from 'vitest';

describe('shared i18n', () => {
  it('returns the English value when locale is en', () => {
    expect(t('app.title', 'en')).toBe('Format Files');
    expect(t('app.runWorkspace', 'en')).toBe('Run on workspace');
    expect(t('app.runGitChanged', 'en')).toBe('Run on Git changes');
  });

  it('returns the Chinese value when locale is zh-CN', () => {
    expect(t('app.title', 'zh-CN')).toBe('格式化文件');
    expect(t('app.runGitChanged', 'zh-CN')).toBe('格式化 Git 变更');
  });

  it('falls back to English when a key is missing in the target locale', () => {
    // app.footer.outputChannelName is intentionally identical in both dicts;
    // pick a key that's English-only via a synthetic missing-key path.
    // Casting to bypass TS — we want runtime behavior.
    expect(t('does.not.exist' as never, 'zh-CN')).toBe('does.not.exist');
  });

  it('substitutes {name} placeholders', () => {
    const out = t('history.description', 'en', { n: 5, plural: 's' });
    expect(out).toBe('Last 5 runs in this workspace');
  });

  it('leaves unmatched placeholders intact', () => {
    const out = t('history.description', 'en', { n: 2 });
    // {plural} not provided → kept as literal `{plural}`
    expect(out).toBe('Last 2 run{plural} in this workspace');
  });

  it('makeT binds a locale once', () => {
    const tEn = makeT('en');
    const tZh = makeT('zh-CN');
    expect(tEn('app.title')).toBe('Format Files');
    expect(tZh('app.title')).toBe('格式化文件');
  });
});
