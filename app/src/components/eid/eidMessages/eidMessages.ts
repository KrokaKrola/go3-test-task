import type { MessageKey, Messages } from '@/i18n/messages/messages';

type EidKey = Extract<MessageKey, `eid.${string}`>;
export type EidMessages = Pick<Messages, EidKey>;

// Only these keys reach the client bundle of the Plans page.
export function pickEidMessages(messages: Messages): EidMessages {
  const picked: Partial<Record<EidKey, string>> = {};
  for (const key of Object.keys(messages) as MessageKey[])
    if (key.startsWith('eid.')) picked[key as EidKey] = messages[key];
  return picked as EidMessages;
}
