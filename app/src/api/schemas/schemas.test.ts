import { describe, expect, test } from 'vitest';
import {
  createOrderResponseSchema,
  identitySessionResponseSchema,
  meResponseSchema,
  orderResponseSchema,
  plansResponseSchema,
} from './schemas';

const samples = {
  plans: {
    schema: plansResponseSchema,
    body: {
      market: 'EE',
      plans: [
        { id: 'plan_std_m', name: 'Standard', priceNet: 899, vatRate: 0.24, currency: 'EUR' },
      ],
    },
  },
  identity: {
    schema: identitySessionResponseSchema,
    body: { sessionId: 's1', redirectUrl: 'http://localhost:4010/mock-eid/s1' },
  },
  me: {
    schema: meResponseSchema,
    body: { customerId: 'c1', activeSubscription: null, trialEligible: true },
  },
  meSubscribed: {
    schema: meResponseSchema,
    body: {
      customerId: 'c1',
      activeSubscription: {
        planId: 'plan_std_m',
        status: 'active',
        renewsAt: '2026-12-01T00:00:00.000Z',
      },
      trialEligible: false,
    },
  },
  createOrder: {
    schema: createOrderResponseSchema,
    body: { orderId: 'o1', paymentUrl: 'http://localhost:4010/mock-pay/o1' },
  },
  order: {
    schema: orderResponseSchema,
    body: {
      orderId: 'o1',
      planId: 'plan_std_m',
      status: 'pending',
      createdAt: '2026-11-11T10:00:00.000Z',
    },
  },
  orderRequiresAction: {
    schema: orderResponseSchema,
    body: {
      orderId: 'o1',
      planId: 'plan_std_m',
      status: 'requires_action',
      createdAt: '2026-11-11T10:00:00.000Z',
      actionUrl: 'http://localhost:4010/mock-pay/o1/challenge',
    },
  },
};

describe('schemas', () => {
  test('parses mock sample body per endpoint', () => {
    for (const { schema, body } of Object.values(samples)) {
      expect(schema.safeParse(body).success).toBe(true);
    }
  });

  test('rejects drift (missing field, wrong type)', () => {
    const missing = {
      ...samples.plans.body,
      plans: [{ id: 'x', name: 'n', vatRate: 0.2, currency: 'EUR' }],
    };
    expect(plansResponseSchema.safeParse(missing).success).toBe(false);
    expect(meResponseSchema.safeParse({ ...samples.me.body, trialEligible: 'yes' }).success).toBe(
      false,
    );
    expect(
      orderResponseSchema.safeParse({ ...samples.order.body, status: 'refunded' }).success,
    ).toBe(false);
    expect(createOrderResponseSchema.safeParse({ orderId: 'o1' }).success).toBe(false);
  });
});
