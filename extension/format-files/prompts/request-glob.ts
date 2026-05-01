import { window } from 'vscode';

import { OperationAborted } from '../errors';

import { confirmYesNo } from './confirm-yes-no';

export async function requestGlob(): Promise<string[]> {
  const raw = await window.showInputBox({
    prompt: 'Enter one or more glob patterns (comma-separated)',
    placeHolder: '**/*.ts,**/*.tsx',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || !value.trim())
        return 'Please enter at least one glob pattern.';
      return undefined;
    },
  });
  if (!raw)
    throw new OperationAborted('Glob input cancelled.');

  const globs = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (globs.length === 0)
    throw new OperationAborted('No glob patterns provided.');

  await confirmYesNo({
    placeHolder: `Confirm glob patterns: ${globs.join(', ')}`,
    abortReason: 'Glob confirmation declined.',
  });

  return globs;
}
