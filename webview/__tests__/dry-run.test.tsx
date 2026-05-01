import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DryRunPanel } from '../components/format-files/DryRunPanel';
import { I18nProvider } from '../i18n/I18nProvider';

import type { DryRunReport } from '@shared/messages';

const sampleReport: DryRunReport = {
  runId: 'r-123',
  mode: 'workspace',
  total: 5,
  byExtension: { '.ts': 3, '.md': 1, '.xyz': 1 },
  etaMs: 1500,
  unknownFormatterExtensions: ['.xyz'],
  firstFiles: ['src/a.ts', 'src/b.ts', 'docs/README.md', 'tools/c.xyz'],
};

function renderPanel(onConfirm: (proceed: boolean) => void) {
  return render(
    <I18nProvider locale="en">
      <DryRunPanel report={sampleReport} onConfirm={onConfirm} />
    </I18nProvider>,
  );
}

describe('dryRunPanel', () => {
  it('renders the totals, mode, and first-files list', () => {
    renderPanel(() => {});
    expect(screen.getByText(/dry-run preview/i)).toBeInTheDocument();
    // Total count
    expect(screen.getByText('5')).toBeInTheDocument();
    // Each first-file path is shown
    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('docs/README.md')).toBeInTheDocument();
  });

  it('surfaces unknown-formatter extensions', () => {
    renderPanel(() => {});
    expect(screen.getByText(/no known formatter/i)).toBeInTheDocument();
  });

  it('confirm button calls onConfirm(true)', () => {
    const onConfirm = vi.fn();
    renderPanel(onConfirm);
    fireEvent.click(screen.getByTestId('dry-run-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('cancel button calls onConfirm(false)', () => {
    const onConfirm = vi.fn();
    renderPanel(onConfirm);
    fireEvent.click(screen.getByTestId('dry-run-cancel'));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('renders Chinese labels under zh-CN locale', () => {
    const onConfirm = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <DryRunPanel report={sampleReport} onConfirm={onConfirm} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Dry-run 预览/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /正式运行/ })).toBeInTheDocument();
  });
});
