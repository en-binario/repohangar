// Launches VS Code with RepoHangar under development on a fixture workspace, for the Playwright UI tests.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { _electron as electron, expect, type ElectronApplication, type FrameLocator, type Page } from '@playwright/test';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import type { Fixture } from '../integration/fixtures/repos';

export interface VsCode {
  app: ElectronApplication;
  page: Page;
  fixture: Fixture;
  /** The user settings.json of this window */
  settingsFile: string;
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
 * `settings` are written to the user settings before the launch.
 */
export async function launch(
  fixture: Fixture,
  options: { trusted?: boolean; installed?: boolean; settings?: Record<string, unknown>; env?: Record<string, string> } = {},
): Promise<VsCode> {
  const executablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION ?? 'stable');
  const profile = mkdtempSync(join(tmpdir(), 'repohangar-ui-'));
  if (options.settings) {
    mkdirSync(join(profile, 'user-data', 'User'), { recursive: true });
    writeFileSync(join(profile, 'user-data', 'User', 'settings.json'), JSON.stringify(options.settings, null, 2));
  }
  const env = { ...process.env } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, options.env ?? {});
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
  const settingsFile = join(profile, 'user-data', 'User', 'settings.json');
  return { app, page, fixture, settingsFile, close: () => app.close() };
}

/** Runs a command from the command palette by its title. */
export async function runCommand(page: Page, title: string): Promise<void> {
  const input = page.locator('.quick-input-widget input');
  await page.keyboard.press('F1');
  // F1 can be lost while focus moves into or out of a webview; press it again once.
  if (!(await input.isVisible())) {
    await page.waitForTimeout(500);
    if (!(await input.isVisible())) await page.keyboard.press('F1');
  }
  await expect(input).toBeVisible();
  await input.fill(`>${title}`);
  const match = page.locator('.quick-input-list .monaco-list-row', { hasText: title }).first();
  await expect(match).toBeVisible();
  // The list can still be moving while it filters; the focused best match runs with Enter.
  if (await match.evaluate((e) => e.classList.contains('focused'))) await input.press('Enter');
  else await match.click();
}

/** Dismisses the first-run hosts panel with `Open dashboard →` when the dashboard shows it. */
export async function dismissFirstRun(frame: FrameLocator): Promise<void> {
  const firstRun = frame.locator('.first-run-done');
  await expect(frame.locator('.dashboard[data-first-run-pending="false"]').or(firstRun)).toBeVisible({ timeout: 60_000 });
  if (await firstRun.isVisible()) await firstRun.click();
}

/** The dashboard's document inside VS Code's webview frames. */
export function dashboard(page: Page): FrameLocator {
  return page.frameLocator('iframe.webview.ready').frameLocator('iframe#active-frame');
}

/**
 * Opens the dashboard and waits until it shows the row of `repo`. The first-run hosts panel, which a fixture with a
 * GitLab or GitHub repository shows once, is dismissed with `Open dashboard →`, as a user would.
 */
export async function openDashboard(page: Page, repo = 'billing-api'): Promise<FrameLocator> {
  await runCommand(page, 'RepoHangar: Open Dashboard');
  const frame = dashboard(page);
  await dismissFirstRun(frame);
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

/** Gives keyboard focus to the Repository cell of a row, clicking beside the name, which runs an action. */
export async function focusRow(frame: FrameLocator, repo: string): Promise<void> {
  const cell = row(frame, repo).locator('[data-col="repository"]');
  const box = await cell.boundingBox();
  await cell.click(box ? { position: { x: box.width - 4, y: box.height / 2 } } : {});
  await cell.focus();
}

/** Merges `settings` into the user settings.json; VS Code applies the change without a reload. */
export function writeSettings(vscode: VsCode, settings: Record<string, unknown>): void {
  const current = existsSync(vscode.settingsFile) ? (JSON.parse(readFileSync(vscode.settingsFile, 'utf8')) as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete current[key];
    else current[key] = value;
  }
  mkdirSync(dirname(vscode.settingsFile), { recursive: true });
  writeFileSync(vscode.settingsFile, JSON.stringify(current, null, 2));
}

/** The repository selected in the Source Control Repositories view. */
export function selectedRepository(page: Page) {
  return page.locator('.part.sidebar .monaco-list-row[aria-label="Git"][aria-selected="true"]');
}

/** Clicks an item of the open context menu (`window.menuStyle` custom). */
export async function chooseMenuItem(page: Page, label: string): Promise<void> {
  await menuItem(page, label).click();
}

/** An item of the open context menu; its accessible name may end with the keybinding. */
export function menuItem(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('.context-view').getByRole('menuitem', { name: new RegExp(`^${escaped}(\\s|$)`) });
}

/** The Explorer row named `name` (the last path segment). */
export function explorerRow(page: Page, name: string) {
  return page.locator('.explorer-folders-view .monaco-list-row').filter({ has: page.locator('.label-name', { hasText: new RegExp(`^${name}$`) }) });
}

/** The VS Code notification toast that contains `text`. */
export function notification(page: Page, text: string) {
  return page.locator('.notification-toast', { hasText: text });
}
