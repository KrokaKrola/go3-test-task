import { intlTag, type Locale } from '@/domain/locale/locale';

// lt: one/few/other, lv: zero/one/other for integers; callers supply the forms they need.
export function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(intlTag(locale)).select(count);
}

export function pluralForm<T>(
  locale: Locale,
  count: number,
  forms: Partial<Record<Intl.LDMLPluralRule, T>> & { other: T },
): T {
  return forms[pluralCategory(locale, count)] ?? forms.other;
}
