export type Locale = 'et' | 'lv' | 'lt' | 'en';

// `en` alone gives US style; en-150 gives European style (Q48).
export function intlTag(locale: Locale): string {
  return locale === 'en' ? 'en-150' : locale;
}
