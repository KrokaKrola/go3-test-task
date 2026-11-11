import { z } from 'zod';

export const plansResponseSchema = z.object({
  market: z.string(),
  plans: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      priceNet: z.number().int().nonnegative(),
      vatRate: z.number(),
      currency: z.string(),
    }),
  ),
});

export const identitySessionResponseSchema = z.object({
  sessionId: z.string(),
  redirectUrl: z.string(),
});

export const meResponseSchema = z.object({
  customerId: z.string(),
  activeSubscription: z
    .object({ planId: z.string(), status: z.string(), renewsAt: z.string() })
    .nullable(),
  trialEligible: z.boolean(),
});

export const createOrderResponseSchema = z.object({
  orderId: z.string(),
  paymentUrl: z.string(),
});

export const orderStatusSchema = z.enum(['pending', 'paid', 'failed', 'requires_action']);

export const orderResponseSchema = z.object({
  orderId: z.string(),
  planId: z.string(),
  status: orderStatusSchema,
  createdAt: z.string(),
  actionUrl: z.string().optional(),
});

export type PlansResponse = z.infer<typeof plansResponseSchema>;
export type IdentitySessionResponse = z.infer<typeof identitySessionResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
export type OrderResponse = z.infer<typeof orderResponseSchema>;
