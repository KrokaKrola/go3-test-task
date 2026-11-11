import * as z from 'zod/mini';
import { requestJson } from '@/api/request/request';

// zod/mini: the Plans page ships this to the browser (08 JS budget).
export const meResponseSchema = z.object({
  customerId: z.string(),
  activeSubscription: z.nullable(
    z.object({ planId: z.string(), status: z.string(), renewsAt: z.string() }),
  ),
  trialEligible: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const fetchMe = (apiBase: string, signal?: AbortSignal) =>
  requestJson({ apiBase, endpoint: 'me', path: '/v1/me', signal, schema: meResponseSchema });
