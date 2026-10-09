import { defineConfig } from '@playwright/test';

// Playwright drives a real VS Code window (Electron) with the extension under development; see test/ui/vscode.ts.
export default defineConfig({
  testDir: 'test/ui',
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: 'test-results',
});
