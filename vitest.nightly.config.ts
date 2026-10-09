import { defineConfig } from 'vitest/config';

// The nightly GitLab compatibility job (PROPOSAL.md §14): a GitLab CE 17.10.0 container, started by the global setup
// unless REPOHANGAR_GITLAB_URL and REPOHANGAR_GITLAB_TOKEN point to an instance. Not part of `npm test`.
export default defineConfig({
  test: {
    include: ['test/nightly/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/nightly/setup.ts'],
    hookTimeout: 20 * 60_000,
    testTimeout: 60_000,
  },
});
