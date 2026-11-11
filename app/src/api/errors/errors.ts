export const API_ERROR_KINDS = [
  'network',
  'server',
  'unauthenticated',
  'alreadySubscribed',
  'conflict',
  'invalidPlan',
  'orderNotFound',
  'rateLimited',
  'badRequest',
] as const;

export type ApiErrorKind = (typeof API_ERROR_KINDS)[number];

export type Endpoint = 'plans' | 'identitySession' | 'me' | 'createOrder' | 'getOrder';

export type ApiError = {
  status: number;
  code: string;
  // Diagnostics only: UI copy comes from `kind`, never render this.
  message: string;
  retryAfterSec?: number;
  kind: ApiErrorKind;
};

const DEFAULT_RETRY_AFTER_SEC = 30;

const CODE_BY_STATUS: Record<number, string> = {
  400: 'invalid_request',
  401: 'unauthenticated',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
};

const codeFromStatus = (status: number): string =>
  CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'request_failed');

export function kindOf(endpoint: Endpoint, status: number, code: string): ApiErrorKind {
  if (status === 0) return 'network';
  if (status >= 500) return 'server';
  if (status === 401) return 'unauthenticated';
  if (status === 409) return code === 'already_subscribed' ? 'alreadySubscribed' : 'conflict';
  if (status === 400 && code === 'invalid_plan') return 'invalidPlan';
  if (status === 404 && endpoint === 'getOrder') return 'orderNotFound';
  if (status === 429) return endpoint === 'identitySession' ? 'rateLimited' : 'server';
  return 'badRequest';
}

function parseRetryAfterSec(header: string | null): number {
  const seconds = header !== null && /^\d+$/.test(header.trim()) ? Number(header) : NaN;
  return Number.isFinite(seconds) ? seconds : DEFAULT_RETRY_AFTER_SEC;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function firstErrorEntry(body: unknown): { code: string; message: string } | undefined {
  if (!isRecord(body) || !Array.isArray(body.errors)) return undefined;
  const first: unknown = body.errors[0];
  if (!isRecord(first) || typeof first.code !== 'string') return undefined;
  return {
    code: first.code,
    message: typeof first.message === 'string' ? first.message : first.code,
  };
}

export function networkError(): ApiError {
  return { status: 0, code: 'network', message: 'Network error', kind: 'network' };
}

export async function toApiError(source: unknown, endpoint: Endpoint): Promise<ApiError> {
  if (!(source instanceof Response)) return networkError();

  const { status } = source;
  const body = await readBody(source);
  const entry = firstErrorEntry(body);
  const code = entry?.code ?? codeFromStatus(status);
  const message =
    entry?.message ??
    (isRecord(body) && typeof body.error === 'string' ? body.error : undefined) ??
    code;

  const error: ApiError = { status, code, message, kind: kindOf(endpoint, status, code) };
  if (error.kind === 'rateLimited')
    error.retryAfterSec = parseRetryAfterSec(source.headers.get('Retry-After'));
  return error;
}

export function abortedError(): ApiError {
  return { status: 0, code: 'aborted', message: 'Request aborted', kind: 'network' };
}

export function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    typeof value.status === 'number' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.kind === 'string'
  );
}

export function invalidResponseError(status: number): ApiError {
  return { status, code: 'invalid_response', message: 'Invalid response', kind: 'server' };
}
