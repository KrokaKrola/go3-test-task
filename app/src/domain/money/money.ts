import { intlTag, type Locale } from '@/domain/locale/locale';

export function grossCents(priceNet: number, vatRate: number): number {
  return Math.round(priceNet * (1 + vatRate));
}

export function formatMoney(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(intlTag(locale), { style: 'currency', currency }).format(
    cents / 100,
  );
}
