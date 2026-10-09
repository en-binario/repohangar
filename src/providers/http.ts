// Requests to GitLab and GitHub (hosting-providers design D-1): the credential only for its own host, no redirects
// followed, a 15 s timeout, ETags, and rate limits turned into errors. No vscode import; the extension host's `fetch`
// follows VS Code's proxy and certificate settings.

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export const REQUEST_TIMEOUT_MS = 15_000;

export type HttpErrorKind = 'status' | 'network' | 'timeout' | 'redirect' | 'rateLimited';

export class HttpError extends Error {
  constructor(
    readonly kind: HttpErrorKind,
    message: string,
    readonly status?: number,
    /** Epoch ms before which the host takes no request (rate limits) */
    readonly untilMs?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

/** A token and the host (`URL.host`, with port) of the API it belongs to. */
export interface Credential {
  token: string;
  apiHost: string;
}

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  credential?: Credential;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send `If-None-Match` with the ETag of the previous answer for this URL, and keep the new one */
  etag?: boolean;
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  json: T;
  headers: Headers;
}

export interface HttpPort {
  fetch?: FetchFn;
  /** One line per request, at the trace level: method, URL, status and duration; never headers or bodies */
  trace?: (line: string) => void;
  now?: () => number;
}

export class Http {
  private readonly etags = new Map<string, { etag: string; json: unknown }>();

  constructor(private readonly port: HttpPort = {}) {}

  /** Replaced by the integration tests, which answer from recorded fixtures. */
  fetchOverride: FetchFn | undefined;

  private now(): number {
    return this.port.now ? this.port.now() : Date.now();
  }

  async request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
    const method = request.method ?? 'GET';
    const url = new URL(request.url);
    const headers: Record<string, string> = { Accept: 'application/json', ...request.headers };
    if (request.credential && request.credential.apiHost === url.host) {
      headers.Authorization = `Bearer ${request.credential.token}`;
    }
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    const cached = request.etag ? this.etags.get(request.url) : undefined;
    if (cached) headers['If-None-Match'] = cached.etag;

    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = this.now();
    const fetchFn = this.fetchOverride ?? this.port.fetch ?? ((u: string, i: RequestInit) => globalThis.fetch(u, i));
    let response: Response;
    try {
      response = await fetchFn(request.url, {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      });
    } catch (error) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted;
      this.port.trace?.(`${method} ${request.url} → ${timedOut ? 'timeout' : 'network error'} after ${this.now() - started} ms`);
      if (timedOut) throw new HttpError('timeout', `timed out after ${Math.round(timeoutMs / 1000)} s`);
      throw new HttpError('network', errorMessage(error));
    }
    clearTimeout(timer);
    this.port.trace?.(`${method} ${request.url} → ${response.status} in ${this.now() - started} ms`);

    if (response.status === 304 && cached) return { status: 304, json: cached.json as T, headers: response.headers };
    if (response.status >= 300 && response.status < 400) {
      throw new HttpError('redirect', `redirected to ${response.headers.get('location') ?? 'another URL'}`, response.status);
    }
    const json = await readJson(response);
    const limited = rateLimitUntil(response, this.now());
    if (limited !== undefined) throw new HttpError('rateLimited', `rate limited (${response.status})`, response.status, limited, json);
    if (response.status >= 400) throw new HttpError('status', statusMessage(response.status, json), response.status, undefined, json);
    const etag = response.headers.get('etag');
    if (request.etag && etag) this.etags.set(request.url, { etag, json });
    return { status: response.status, json: json as T, headers: response.headers };
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The end of a rate limit: `Retry-After` (seconds), else `X-RateLimit-Reset` (epoch seconds) when none remain. */
export function rateLimitUntil(response: Pick<Response, 'status' | 'headers'>, now: number): number | undefined {
  const { status, headers } = response;
  const remaining = headers.get('x-ratelimit-remaining');
  if (status !== 429 && !(status === 403 && remaining === '0')) return undefined;
  const retryAfter = Number(headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return now + retryAfter * 1000;
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) return reset * 1000;
  return now + 60_000;
}

function statusMessage(status: number, json: unknown): string {
  const message = (json as { message?: unknown; error?: unknown } | undefined)?.message ?? (json as { error?: unknown } | undefined)?.error;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map(String).join('; ');
  return `HTTP ${status}`;
}

function errorMessage(error: unknown): string {
  const cause = (error as { cause?: { message?: string; code?: string } } | undefined)?.cause;
  return cause?.message ?? cause?.code ?? (error instanceof Error ? error.message : String(error));
}
