import { register as registerShowPanel } from './commands/formatFilesShowPanel';
import { registerStartCommands } from './commands/registerStartCommands';
import { disposeRuntime, initRuntime } from './format-files/runtime';
import { registerPanelStateListeners } from './views/messages';

import type { ExtensionContext } from 'vscode';

export function activate(context: ExtensionContext): void {
  const runtime = initRuntime(context);
  runtime.logger.info('activate', 'Format Files extension activating');

  registerStartCommands(context);
  registerShowPanel(context);
  registerPanelStateListeners(context);

  context.subscriptions.push({
    dispose: () => {
      runtime.logger.info('deactivate', 'Format Files extension shutting down');
      disposeRuntime();
    },
  });
}

export function deactivate(): void {
  // Subscriptions registered above handle teardown.
}
