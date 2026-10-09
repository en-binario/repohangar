import { defineConfig } from 'vitest/config';

// Two projects: `unit` (pure logic and webview components; webview tests opt into jsdom with a
// `// @vitest-environment jsdom` comment) and `contract` (provider requests against recorded HTTP fixtures, msw).
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.test.{ts,tsx}'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'contract', include: ['test/contract/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
});
