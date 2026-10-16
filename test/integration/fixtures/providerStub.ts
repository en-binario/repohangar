// A local HTTP server that every provider request of the test VS Code goes to (REPOHANGAR_HTTP_STUB), as
// `<stub>/<host><path>`, so no test reaches GitLab or GitHub. Without routes it answers 404 to everything; the
// integration tests answer with their own fetch override, the UI tests pass routes.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubRequest {
  method: string;
  host: string;
  path: string;
  authorization?: string;
  body?: unknown;
}

/** `delayMs` holds the answer back, for the states a UI shows while a request runs. */
export type StubRoute = (request: StubRequest) => { status?: number; body: unknown; delayMs?: number } | undefined;

export async function startProviderStub(
  routes: StubRoute[] = [],
): Promise<{ url: string; requests: StubRequest[]; close(): Promise<void> }> {
  const requests: StubRequest[] = [];
  const server: Server = createServer((incoming, response) => {
    let text = '';
    incoming.on('data', (chunk) => (text += chunk));
    incoming.on('end', () => {
      const [, host = '', ...rest] = (incoming.url ?? '/').split('/');
      const request: StubRequest = {
        method: incoming.method ?? 'GET',
        host,
        path: `/${rest.join('/')}`,
        ...(incoming.headers.authorization ? { authorization: incoming.headers.authorization } : {}),
        ...(text ? { body: JSON.parse(text) as unknown } : {}),
      };
      requests.push(request);
      const answer = routes.map((route) => route(request)).find((a) => a !== undefined) ?? { status: 404, body: { message: '404 Not Found' } };
      setTimeout(() => {
        response.writeHead(answer.status ?? 200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(answer.body));
      }, answer.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
