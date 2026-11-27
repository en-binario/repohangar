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
  const match = page.locator('.quick-input-list .monaco-list-row', { hasText: title }).first();
  // On a fresh window the extension host may still be registering commands, or F1 may be lost while focus leaves a webview.
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await page.keyboard.press('F1');
      if (!(await input.isVisible())) {
        await page.waitForTimeout(300);
        if (!(await input.isVisible())) await page.keyboard.press('F1');
      }
      await expect(input).toBeVisible({ timeout: 2_000 });
      await input.fill(`>${title}`);
      await expect(match).toBeVisible({ timeout: 5_000 });
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }
  // The list can still be moving while it filters; the focused best match runs with Enter.
  if (await match.evaluate((e) => e.classList.contains('focused'))) await page.keyboard.press('Enter');
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

/** Gives keyboard focus to the Repository cell of a row, clicking in its padding beside the name button. */
export async function focusRow(frame: FrameLocator, repo: string): Promise<void> {
  const item = row(frame, repo);
  const cell = item.locator('[data-col="repository"]');
  await cell.click({ position: { x: 2, y: 2 } });
  await expect(item).toHaveClass(/\bfocused\b/);
  await cell.focus();
  await expect(cell).toBeFocused();
}

/**
 * Arms a one-shot watch on the next `contextmenu` event in the dashboard and returns a reader of whether the dashboard
 * suppressed VS Code's Cut / Copy / Paste menu (null until the event happened). VS Code shows that menu from a bubble
 * listener on the frame's window unless the default is prevented; a listener on the document runs just before it.
 */
export async function watchContextMenu(frame: FrameLocator): Promise<() => Promise<boolean | null>> {
  await frame.locator('body').evaluate(() => {
    const w = window as unknown as { rhSuppressed?: boolean | null };
    w.rhSuppressed = null;
    const onDocument = (e: Event) => (w.rhSuppressed = e.defaultPrevented);
    document.addEventListener('contextmenu', onDocument, { once: true });
    const afterAll = () =>
      setTimeout(() => {
        document.removeEventListener('contextmenu', onDocument);
        // Propagation stopped before the document, so VS Code's window listener did not see the event either.
        if (w.rhSuppressed === null) w.rhSuppressed = true;
      });
    window.addEventListener('contextmenu', afterAll, { capture: true, once: true });
  });
  return () => frame.locator('body').evaluate(() => (window as unknown as { rhSuppressed?: boolean | null }).rhSuppressed ?? null);
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

/** Chooses an item of the open context menu (`window.menuStyle` custom) by keyboard. */
export async function chooseMenuItem(page: Page, label: string): Promise<void> {
  const item = menuItem(page, label);
  await expect(item).toBeVisible();
  for (let i = 0; i < 40; i++) {
    if (await item.evaluate((el) => el.classList.contains('focused') || !!el.closest('.focused') || el === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
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
