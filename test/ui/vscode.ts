// Launches VS Code with RepoHangar under development on a fixture workspace, for the Playwright UI tests.

import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, type ElectronApplication, type FrameLocator, type Page } from '@playwright/test';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import type { Fixture } from '../integration/fixtures/repos';

export interface VsCode {
  app: ElectronApplication;
  page: Page;
  fixture: Fixture;
  close(): Promise<void>;
}

const ROOT = resolve(__dirname, '../..');

/** Packages the extension and installs the VSIX into an extensions folder, as a user would get it. */
function installVsix(executablePath: string, extensionsDir: string, env: Record<string, string>): void {
  const vsix = join(ROOT, 'out', 'repohangar-ui-test.vsix');
  const pack = spawnSync('npx', ['vsce', 'package', '--no-dependencies', '--out', vsix], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (pack.status !== 0) throw new Error(`vsce package failed: ${pack.stderr}`);
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executablePath);
  const install = spawnSync(cli as string, [...cliArgs, '--extensions-dir', extensionsDir, '--install-extension', vsix], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env,
  });
  if (install.status !== 0) throw new Error(`install failed: ${install.stderr}${install.stdout}`);
}

/**
 * Launches VS Code on the fixture. By default RepoHangar runs from this folder as the extension under development;
 * `installed: true` installs the packaged VSIX instead, which VS Code subjects to Workspace Trust like any user install.
 */
export async function launch(fixture: Fixture, options: { trusted?: boolean; installed?: boolean } = {}): Promise<VsCode> {
  const executablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION ?? 'stable');
  const profile = mkdtempSync(join(tmpdir(), 'repohangar-ui-'));
  const env = { ...process.env } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  if (options.installed) installVsix(executablePath, join(profile, 'extensions'), env);
  const app = await electron.launch({
    executablePath,
    env,
    args: [
      fixture.workspaceFile,
      ...(options.installed ? [] : [`--extensionDevelopmentPath=${ROOT}`]),
      `--user-data-dir=${join(profile, 'user-data')}`,
      `--extensions-dir=${join(profile, 'extensions')}`,
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-telemetry',
      ...(options.trusted === false ? [] : ['--disable-workspace-trust']),
    ],
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  return { app, page, fixture, close: () => app.close() };
}

/** Runs a command from the command palette by its title. */
export async function runCommand(page: Page, title: string): Promise<void> {
  await page.keyboard.press('F1');
  const input = page.locator('.quick-input-widget input');
  await expect(input).toBeVisible();
  await input.fill(`>${title}`);
  await page.locator('.quick-input-list .monaco-list-row', { hasText: title }).first().click();
}

/** The dashboard's document inside VS Code's webview frames. */
export function dashboard(page: Page): FrameLocator {
  return page.frameLocator('iframe.webview.ready').frameLocator('iframe#active-frame');
}

/** Opens the dashboard and waits until it shows the row of `repo`. */
export async function openDashboard(page: Page, repo = 'billing-api'): Promise<FrameLocator> {
  await runCommand(page, 'RepoHangar: Open Dashboard');
  const frame = dashboard(page);
  await expect(frame.locator(`[data-repo="${repo}"]`)).toBeVisible({ timeout: 60_000 });
  return frame;
}

export function row(frame: FrameLocator, repo: string) {
  return frame.locator(`[data-repo="${repo}"]`);
}

/** The data-key of the item that holds keyboard focus in the grid, or null. */
export async function focusedKey(frame: FrameLocator): Promise<string | null> {
  return frame.locator('body').evaluate(() => document.activeElement?.closest('[data-key]')?.getAttribute('data-key') ?? null);
}

/** Gives keyboard focus to the Repository cell of a row. */
export async function focusRow(frame: FrameLocator, repo: string): Promise<void> {
  await row(frame, repo).locator('[data-col="repository"]').click();
  await row(frame, repo).locator('[data-col="repository"]').focus();
}
