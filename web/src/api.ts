import { initData } from './tg.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

/**
 * Authenticated fetch against the backend. Inside Telegram it sends the signed
 * initData header; in a plain browser it falls back to the dev bypass header
 * (localStorage.debugUserId), which the backend only honours when AUTH_DEV_BYPASS
 * is on. The server derives the user from the signature — never from the client.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const id = initData();
  if (id) {
    headers['x-telegram-init-data'] = id;
  } else {
    const debug = localStorage.getItem('debugUserId');
    if (debug) headers['x-debug-user-id'] = debug;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (parsed && typeof parsed === 'object' && 'error' in parsed && String(parsed.error)) || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, parsed);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
