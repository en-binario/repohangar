import { defineConfig } from 'vitest/config';

// Webview component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
