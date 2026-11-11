import type { z } from 'zod';
import { getConfig } from '@/config';
import type { Market } from '@/domain/markets/markets';
import { fetchMe } from '@/api/me/me';
import { REQUEST_TIMEOUT_MS, requestJson, type RequestOptions } from '@/api/request/request';
import {
  createOrderResponseSchema,
  identitySessionResponseSchema,
  orderResponseSchema,
  plansResponseSchema,
} from '@/api/schemas/schemas';

export { REQUEST_TIMEOUT_MS };

const apiMarket = (market: Market) => market.toUpperCase();

export const request = <S extends z.ZodType>(
  options: Omit<RequestOptions<z.infer<S>>, 'apiBase' | 'schema'> & { schema: S },
): Promise<z.infer<S>> => requestJson({ ...options, apiBase: getConfig().API_BASE });

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

export const getMe = (signal?: AbortSignal) => fetchMe(getConfig().API_BASE, signal);

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
