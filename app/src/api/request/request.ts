import {
  abortedError,
  invalidResponseError,
  networkError,
  toApiError,
  type Endpoint,
} from '@/api/errors/errors';

// Structural, so zod and zod/mini schemas both fit and the client bundle can stay on mini.
export type ResponseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export type RequestOptions<T> = {
  apiBase: string;
  endpoint: Endpoint;
  path: string;
  schema: ResponseSchema<T>;
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export const REQUEST_TIMEOUT_MS = 15_000;

export async function requestJson<T>(options: RequestOptions<T>): Promise<T> {
  const { apiBase, endpoint, path, schema, method = 'GET', body, headers, signal } = options;

  const url = `${apiBase}${path}`;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (thrown) {
    if (signal?.aborted) throw abortedError();
    throw await toApiError(thrown, endpoint);
  }

  if (!response.ok) throw await toApiError(response, endpoint);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    if (signal?.aborted) throw abortedError();
    if (timeout.aborted) throw networkError();
    json = undefined;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw invalidResponseError(response.status);
  return parsed.data;
}
