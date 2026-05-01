import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

const PUBLISHER = 'your-publisher';
const NAME = 'folder-formatter';
const EXTENSION_ID = `${PUBLISHER}.${NAME}`;

const COMMAND_IDS = [
  'formatFiles.start.workspace',
  'formatFiles.start.workspaceFolder',
  'formatFiles.start.fromGlob',
  'formatFiles.start.gitChanged',
  'formatFiles.showPanel',
] as const;

const CONFIG_KEYS = [
  'logLevel',
  'extensionsToInclude',
  'excludedFolders',
  'excludePattern',
  'inheritWorkspaceExcludedFiles',
  'runOrganizeImports',
  'useGitIgnore',
  'gitScope.includeStaged',
  'gitScope.includeModified',
  'gitScope.includeUntracked',
  'dryRunFirst',
  'locale',
] as const;

describe('extension activation', function () {
  this.timeout(30000);

  it('extension is installed and discoverable', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `Extension ${EXTENSION_ID} should be installed`);
  });

  it('activates without error', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    if (!ext.isActive)
      await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  it('registers all 5 formatFiles commands', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    if (ext && !ext.isActive)
      await ext.activate();
    const registered = await vscode.commands.getCommands(true);
    for (const id of COMMAND_IDS)
      assert.ok(registered.includes(id), `Command '${id}' should be registered`);
  });

  it('contributes all configuration keys with the expected defaults', async () => {
    const cfg = vscode.workspace.getConfiguration('folderFormatter');
    for (const key of CONFIG_KEYS) {
      const inspected = cfg.inspect(key);
      assert.ok(inspected, `Setting 'folderFormatter.${key}' should be declared in package.json`);
    }

    // Spot-check defaults to catch accidental schema regressions.
    assert.strictEqual(cfg.get('logLevel'), 'debug');
    assert.strictEqual(cfg.get<boolean>('runOrganizeImports'), true);
    assert.strictEqual(cfg.get<boolean>('useGitIgnore'), true);
    assert.strictEqual(cfg.get<boolean>('inheritWorkspaceExcludedFiles'), true);
    assert.strictEqual(cfg.get<boolean>('gitScope.includeStaged'), true);
    assert.strictEqual(cfg.get<boolean>('gitScope.includeModified'), true);
    assert.strictEqual(cfg.get<boolean>('gitScope.includeUntracked'), true);
    assert.strictEqual(cfg.get<boolean>('dryRunFirst'), false);
    assert.strictEqual(cfg.get<string>('locale'), 'auto');

    const folders = cfg.get<string[]>('excludedFolders');
    assert.ok(Array.isArray(folders));
    assert.deepStrictEqual(folders, ['node_modules', '.vscode', '.git', 'dist', '.chrome']);
  });

  it('ships package.nls.json (English) and package.nls.zh-CN.json (Simplified Chinese)', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, 'extension must be installed');
    const root = ext.extensionPath;
    assert.ok(fs.existsSync(path.join(root, 'package.nls.json')), 'package.nls.json must exist');
    assert.ok(fs.existsSync(path.join(root, 'package.nls.zh-CN.json')), 'package.nls.zh-CN.json must exist');

    const en = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf-8')) as Record<string, string>;
    const zh = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.zh-CN.json'), 'utf-8')) as Record<string, string>;
    // Sanity check: the Chinese bundle should declare every key used by the English bundle.
    for (const key of Object.keys(en))
      assert.ok(key in zh, `zh-CN bundle is missing key '${key}'`);
  });

  it('executing showPanel opens the webview without throwing', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    if (ext && !ext.isActive)
      await ext.activate();
    await vscode.commands.executeCommand('formatFiles.showPanel');
    assert.ok(true, 'command executed without throwing');
  });
});

describe('vscode API surface', function () {
  this.timeout(10000);

  it('window API is available', () => {
    assert.ok(vscode.window);
  });

  it('commands API is available', () => {
    assert.ok(vscode.commands);
  });

  it('extensions API is available', () => {
    assert.ok(vscode.extensions);
  });

  it('workspace.findFiles is available (used by file-query)', () => {
    assert.strictEqual(typeof vscode.workspace.findFiles, 'function');
  });

  it('built-in vscode.git extension is reachable (used by gitChanged mode)', () => {
    const git = vscode.extensions.getExtension('vscode.git');
    assert.ok(git, 'built-in Git extension must be available');
  });
});
