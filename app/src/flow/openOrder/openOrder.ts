import * as z from 'zod/mini';

// localStorage: shared by every tab and outlives the tab (04 Terms, Q37). Functional, no consent.
const STORAGE_KEY = 'nl_open_order';

const openOrderSchema = z.object({
  orderId: z.string(),
  paymentUrl: z.string(),
  planId: z.string(),
  market: z.string(),
  locale: z.string(),
  // `purchase` snapshot (07): gross value in euros, VAT part, currency, trial shown.
  snapshot: z.object({
    value: z.number(),
    tax: z.number(),
    currency: z.string(),
    trial: z.enum(['true', 'false', 'unknown']),
  }),
});

export type OpenOrder = z.infer<typeof openOrderSchema>;

type Storage_ = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type OpenOrderStore = {
  save(order: OpenOrder): void;
  read(): OpenOrder | null;
  clear(): void;
};

// Lazy: reading `window.localStorage` can itself throw. Any failure means "no open order".
const browserStorage = (): Storage_ => window.localStorage;

export function createOpenOrderStore(storage: () => Storage_ = browserStorage): OpenOrderStore {
  return {
    save(order) {
      try {
        storage().setItem(STORAGE_KEY, JSON.stringify(order));
      } catch {
        // Gate falls back to "no open order"; the server still guards (Q37).
      }
    },
    read() {
      try {
        const raw = storage().getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = openOrderSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    clear() {
      try {
        storage().removeItem(STORAGE_KEY);
      } catch {
        // nothing to clear
      }
    },
  };
}

export const openOrder = createOpenOrderStore();
