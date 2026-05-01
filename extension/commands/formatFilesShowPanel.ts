import { commands } from 'vscode';

import { COMMAND_IDS } from '../format-files/constants';
import { MainPanel } from '../views/panel';

import type { ExtensionContext } from 'vscode';

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand(COMMAND_IDS.showPanel, () => {
      MainPanel.render(context);
    }),
  );
}
