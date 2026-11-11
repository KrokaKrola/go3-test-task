import { describe, expect, it } from 'vitest';
import { createOpenOrderStore, type OpenOrder } from './openOrder';

const order: OpenOrder = {
  orderId: 'o1',
  paymentUrl: 'http://pay.test/o1',
  planId: 'plan_std_m',
  market: 'ee',
  locale: 'et',
  snapshot: { value: 11.15, tax: 1.85, currency: 'EUR', trial: 'true' },
};

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

describe('openOrder', () => {
  it('save, read, clear in localStorage', () => {
    window.localStorage.clear();
    const store = createOpenOrderStore();
    expect(store.read()).toBeNull();
    store.save(order);
    expect(store.read()).toEqual(order);
    expect(window.localStorage.getItem('nl_open_order')).not.toBeNull();
    store.clear();
    expect(store.read()).toBeNull();
    expect(window.localStorage.getItem('nl_open_order')).toBeNull();
  });

  it('written by one store instance, read by another (second tab)', () => {
    const shared = memoryStorage();
    const tabA = createOpenOrderStore(() => shared);
    const tabB = createOpenOrderStore(() => shared);
    tabA.save(order);
    expect(tabB.read()).toEqual(order);
    tabB.clear();
    expect(tabA.read()).toBeNull();
  });

  it('storage throwing → treated as no open order', () => {
    const throwing = () => {
      throw new Error('blocked');
    };
    const store = createOpenOrderStore(throwing);
    expect(() => store.save(order)).not.toThrow();
    expect(store.read()).toBeNull();
    expect(() => store.clear()).not.toThrow();

    const brokenMethods = createOpenOrderStore(() => ({
      getItem: throwing,
      setItem: throwing,
      removeItem: throwing,
    }));
    expect(() => brokenMethods.save(order)).not.toThrow();
    expect(brokenMethods.read()).toBeNull();
  });

  it('corrupt or foreign JSON → no open order', () => {
    const storage = memoryStorage();
    storage.setItem('nl_open_order', '{"orderId":1}');
    expect(createOpenOrderStore(() => storage).read()).toBeNull();
    storage.setItem('nl_open_order', 'not json');
    expect(createOpenOrderStore(() => storage).read()).toBeNull();
  });
});
