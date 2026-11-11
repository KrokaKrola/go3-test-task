import type { z } from 'zod';
import { getConfig } from '@/config';
import type { Market } from '@/domain/markets/markets';
import {
  abortedError,
  invalidResponseError,
  networkError,
  toApiError,
  type Endpoint,
} from '@/api/errors/errors';
import {
  createOrderResponseSchema,
  identitySessionResponseSchema,
  meResponseSchema,
  orderResponseSchema,
  plansResponseSchema,
} from '@/api/schemas/schemas';

type RequestOptions<S extends z.ZodType> = {
  endpoint: Endpoint;
  path: string;
  schema: S;
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export const REQUEST_TIMEOUT_MS = 15_000;

const apiMarket = (market: Market) => market.toUpperCase();

export async function request<S extends z.ZodType>(
  options: RequestOptions<S>,
): Promise<z.infer<S>> {
  const { endpoint, path, schema, method = 'GET', body, headers, signal } = options;

  const url = `${getConfig().API_BASE}${path}`;
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

export const getPlans = (market: Market, signal?: AbortSignal) =>
  request({
    endpoint: 'plans',
    path: `/v1/plans?market=${apiMarket(market)}`,
    signal,
    schema: plansResponseSchema,
  });

export const createIdentitySession = (returnUrl: string) =>
  request({
    endpoint: 'identitySession',
    path: '/v1/identity/sessions',
    method: 'POST',
    body: { returnUrl },
    schema: identitySessionResponseSchema,
  });

export const getMe = (signal?: AbortSignal) =>
  request({ endpoint: 'me', path: '/v1/me', signal, schema: meResponseSchema });

// No signal on purpose: aborting a POST leaves it unknown whether the order exists (Q34).
export const createOrder = (body: { planId: string; market: Market; returnUrl: string }) =>
  request({
    endpoint: 'createOrder',
    path: '/v1/orders',
    method: 'POST',
    body: { ...body, market: apiMarket(body.market) },
    schema: createOrderResponseSchema,
  });

export const getOrder = (orderId: string, signal?: AbortSignal) =>
  request({
    endpoint: 'getOrder',
    path: `/v1/orders/${encodeURIComponent(orderId)}`,
    signal,
    schema: orderResponseSchema,
  });
