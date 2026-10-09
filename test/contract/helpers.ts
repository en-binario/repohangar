// Provider contract tests: an msw server that answers with recorded fixtures and records every request it receives.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupServer, type SetupServer } from 'msw/node';
import type { RequestHandler } from 'msw';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** A recorded answer: `test/contract/fixtures/<host>/<operation>.json`. */
export function fixture<T = unknown>(host: string, operation: string): T {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', host, `${operation}.json`), 'utf8')) as T;
}

export interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Starts an msw server for the test file; `requests` holds every request since the last test. */
export function contractServer(...handlers: RequestHandler[]): { server: SetupServer; requests: Recorded[] } {
  const server = setupServer(...handlers);
  const requests: Recorded[] = [];
  server.events.on('request:start', async ({ request }) => {
    const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // Not JSON: keep the text.
    }
    requests.push({ method: request.method, url: request.url, headers: Object.fromEntries(request.headers.entries()), body });
  });
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    requests.length = 0;
  });
  afterAll(() => server.close());
  return { server, requests };
}
