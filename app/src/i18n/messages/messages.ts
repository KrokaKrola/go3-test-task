import type { Locale } from '@/domain/locale/locale';
import { en } from './en';
import { et } from './et';
import { lt } from './lt';
import { lv } from './lv';

export type Messages = Record<keyof typeof en, string>;
export type MessageKey = keyof Messages;

export const catalogs: Record<Locale, Messages> = { et, lv, lt, en };

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}
