import { randomBytes } from 'node:crypto';

import getWebviewHtml from 'virtual:vscode';

import { route } from './messages';

import type { WebviewToExtensionMessage } from '@shared/messages';
import type { Disposable, ExtensionContext, Webview } from 'vscode';

function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

function buildCspMeta(webview: Webview, nonce: string, devServerUrl: string | undefined): string {
  const cspSource = webview.cspSource;
  const dev = !!devServerUrl;
  const csp = [
    'default-src \'none\'',
    `img-src ${cspSource} https: data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    dev
      ? `script-src 'nonce-${nonce}' ${devServerUrl} 'unsafe-eval'`
      : `script-src 'nonce-${nonce}' 'unsafe-eval'`,
    dev
      ? `connect-src ${cspSource} ${devServerUrl} ws: wss:`
      : `connect-src ${cspSource}`,
    // Dev mode: @tomjs/vite-plugin-vscode wraps the dev server in an iframe; allow it.
    dev ? `frame-src ${devServerUrl}` : null,
    `font-src ${cspSource} data:`,
  ].filter((d): d is string => d !== null).join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
}

function rewriteCspAndNonce(html: string, cspMeta: string, nonce: string): string {
  // Strip any bundled CSP meta first — multiple CSP metas are intersected by
  // the browser, and the bundled one carries a different nonce than ours.
  let out = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  out = out.replace(/<head>/i, `<head>${cspMeta}`);
  out = out.replace(/<script(?![^>]*\snonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`);
  return out;
}

export class WebviewHelper {
  static setupHtml(webview: Webview, context: ExtensionContext): string {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    const baseHtml = getWebviewHtml({ serverUrl: devServerUrl, webview, context });
    // Reuse the nonce already attached by getWebviewHtml's bundled template
    // so our CSP and the existing <script nonce="..."> tags agree. In dev
    // mode the iframe template carries no nonce yet — fall back to a fresh one.
    const existingNonce = baseHtml.match(/<script[^>]*\snonce=["']([^"']+)["']/i)?.[1];
    const nonce = existingNonce ?? generateNonce();
    const cspMeta = buildCspMeta(webview, nonce, devServerUrl);
    return rewriteCspAndNonce(baseHtml, cspMeta, nonce);
  }

  static setupHooks(webview: Webview, context: ExtensionContext, disposables: Disposable[]): void {
    webview.onDidReceiveMessage(
      (msg: WebviewToExtensionMessage) => {
        void route(msg, context);
      },
      undefined,
      disposables,
    );
  }
}
