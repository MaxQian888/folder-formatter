import { Uri, ViewColumn, window } from 'vscode';

import { PANEL_TITLE, PANEL_VIEW_TYPE } from '../format-files/constants';
import { getRuntime } from '../format-files/runtime';

import { WebviewHelper } from './helper';

import type { RunNotification } from '../format-files/run';
import type { ExtensionToWebviewMessage, LogEntry } from '@shared/messages';
import type { Disposable, ExtensionContext, WebviewPanel } from 'vscode';

const KIND_TO_MESSAGE_TYPE: Record<RunNotification['kind'], ExtensionToWebviewMessage['type']> = {
  started: 'formatFiles/runStarted',
  progress: 'formatFiles/runProgress',
  fileDone: 'formatFiles/runFileDone',
  completed: 'formatFiles/runCompleted',
  dryRun: 'formatFiles/dryRunReport',
};

export class MainPanel {
  static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  private readonly _context: ExtensionContext;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = WebviewHelper.setupHtml(this._panel.webview, context);
    WebviewHelper.setupHooks(this._panel.webview, context, this._disposables);

    try {
      const runtime = getRuntime();
      runtime.panelNotify = (event: RunNotification) => {
        this.forwardRunEvent(event);
      };
      const removeSink = runtime.logger.addSink((entry: LogEntry) => {
        void this.post({ type: 'formatFiles/log', entry });
      });
      this._disposables.push({
        dispose: () => {
          removeSink();
          if (runtime.panelNotify)
            runtime.panelNotify = undefined;
          // Without the panel the user has no way to confirm a parked dry-run,
          // so resolve any pending decisions with `proceed=false`.
          for (const [, deferred] of runtime.pendingDryRunDecisions)
            deferred.resolve(false);
          runtime.pendingDryRunDecisions.clear();
        },
      });
    }
    catch {
      // Runtime may not be initialized in tests / preview mode.
    }
  }

  static render(context: ExtensionContext): MainPanel {
    if (MainPanel.currentPanel) {
      MainPanel.currentPanel._panel.reveal(ViewColumn.One);
      return MainPanel.currentPanel;
    }
    const dev = !!process.env.VITE_DEV_SERVER_URL;
    const distRoot = Uri.joinPath(context.extensionUri, 'dist');
    const panel = window.createWebviewPanel(PANEL_VIEW_TYPE, PANEL_TITLE, ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: dev ? undefined : [distRoot],
    });
    panel.iconPath = {
      light: Uri.joinPath(context.extensionUri, 'assets', 'panel-icon-light.svg'),
      dark: Uri.joinPath(context.extensionUri, 'assets', 'panel-icon-dark.svg'),
    };
    MainPanel.currentPanel = new MainPanel(panel, context);
    return MainPanel.currentPanel;
  }

  post(msg: ExtensionToWebviewMessage): Thenable<boolean> {
    return this._panel.webview.postMessage(msg);
  }

  private forwardRunEvent(event: RunNotification): void {
    const { kind, ...rest } = event as RunNotification & { kind: RunNotification['kind'] };
    const type = KIND_TO_MESSAGE_TYPE[kind];
    void this.post({ type, ...rest } as ExtensionToWebviewMessage);
  }

  dispose(): void {
    MainPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}
