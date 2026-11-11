import * as z from 'zod/mini';
import { requestJson } from '@/api/request/request';

// zod/mini and no client.ts import: the Plans page ships this to the browser (08 JS budget).
export const identitySessionSchema = z.object({
  sessionId: z.string(),
  redirectUrl: z.string(),
});

export const createIdentitySession = (apiBase: string, returnUrl: string) =>
  requestJson({
    apiBase,
    endpoint: 'identitySession',
    path: '/v1/identity/sessions',
    method: 'POST',
    body: { returnUrl },
    schema: identitySessionSchema,
  });
