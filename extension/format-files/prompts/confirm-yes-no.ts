import { window } from 'vscode';

import { OperationAborted } from '../errors';

interface YesNoOptions {
  placeHolder: string;
  yesLabel?: string;
  noLabel?: string;
  /** Thrown if the user cancels (Esc) or selects the "no" entry. */
  abortReason: string;
  /** When `true`, picking "no" returns `false` instead of throwing. */
  nonAbortingNo?: boolean;
}

/**
 * Two-choice QuickPick used by every prompt that needs a Yes/No confirmation.
 * Pressing Esc always throws `OperationAborted`. Picking the "no" label
 * throws by default; pass `nonAbortingNo: true` to return `false` instead.
 */
export async function confirmYesNo(opts: YesNoOptions): Promise<boolean> {
  const yes = opts.yesLabel ?? 'Yes';
  const no = opts.noLabel ?? 'No';
  const choice = await window.showQuickPick([yes, no], {
    placeHolder: opts.placeHolder,
    ignoreFocusOut: true,
  });
  if (!choice)
    throw new OperationAborted(opts.abortReason);
  if (choice === no) {
    if (opts.nonAbortingNo)
      return false;
    throw new OperationAborted(opts.abortReason);
  }
  return true;
}
