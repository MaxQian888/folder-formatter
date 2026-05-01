import { confirmYesNo } from './confirm-yes-no';

export async function confirmStart(fileCount: number): Promise<void> {
  await confirmYesNo({
    placeHolder: `Format ${fileCount} file${fileCount === 1 ? '' : 's'}?`,
    yesLabel: 'Do it!',
    noLabel: 'Nevermind',
    abortReason: 'User declined the format prompt.',
  });
}
