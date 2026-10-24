import { fetch } from 'expo/fetch';

import type { DemoUser } from './types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const PASSWORD = process.env.EXPO_PUBLIC_API_PASSWORD;

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never reached the server. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.status === 0;
  }
}

type QueryValue = string | number | boolean | null | undefined;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** Extra query parameters; `null`/`undefined` values are omitted. `user` is always appended. */
  params?: Record<string, QueryValue>;
  signal?: AbortSignal;
};

function buildUrl(user: DemoUser, path: string, params: Record<string, QueryValue> = {}) {
  const entries: [string, QueryValue][] = Object.entries({ ...params, user });
  const query = entries
    .filter((entry): entry is [string, string | number | boolean] => entry[1] != null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${BASE_URL}${path}?${query}`;
}

export async function apiRequest<T>(user: DemoUser, path: string, { method = 'GET', body, params, signal }: RequestOptions = {}): Promise<T> {
  if (!BASE_URL || !PASSWORD) {
    throw new ApiError('API is not configured. Set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_API_PASSWORD in .env.local.', -1);
  }

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(buildUrl(user, path, params), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${PASSWORD}`,
        ...(body === undefined ? null : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('You appear to be offline. Check your connection and try again.', 0);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ApiError(messageFor(response.status, payload?.detail), response.status);
  }

  return (await response.json()) as T;
}

function messageFor(status: number, detail: unknown) {
  // FastAPI answers unknown routes with this exact detail, which means the deployment predates the endpoint.
  if (status === 404 && detail === 'Not Found') {
    return 'This feature isn’t available on the deployed student API yet. The backend needs to be redeployed.';
  }
  if (status === 401) return 'BU One could not authenticate with the student API. Check EXPO_PUBLIC_API_PASSWORD.';
  if (typeof detail === 'string') return detail;
  if (status === 422 && Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (typeof first?.msg === 'string') return first.msg.replace(/^Value error, /, '');
  }
  if (status === 404) return 'That item was not found.';
  if (status === 409) return 'This changed on the server. Reload and try again.';
  if (status >= 500) return 'The student API is having trouble right now.';
  return `Request failed (${status}).`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
