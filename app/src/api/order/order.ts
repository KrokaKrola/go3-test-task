import * as z from 'zod/mini';
import { requestJson } from '@/api/request/request';

// zod/mini: the Plans page ships this to the browser (08 JS budget). Mirrors orderResponseSchema.
const orderSchema = z.object({
  orderId: z.string(),
  planId: z.string(),
  status: z.enum(['pending', 'paid', 'failed', 'requires_action']),
  createdAt: z.string(),
  actionUrl: z.optional(z.string()),
});

export const fetchOrder = (apiBase: string, orderId: string, signal?: AbortSignal) =>
  requestJson({
    apiBase,
    endpoint: 'getOrder',
    path: `/v1/orders/${encodeURIComponent(orderId)}`,
    signal,
    schema: orderSchema,
  });
