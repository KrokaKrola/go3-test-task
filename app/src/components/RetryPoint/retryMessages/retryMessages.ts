import type { MessageKey, Messages } from '@/i18n/messages/messages';

type RetryKey = Extract<MessageKey, `retry.${string}`>;
export type RetryMessages = Pick<Messages, RetryKey>;

// Only these keys reach the client bundle of the Plans page.
export function pickRetryMessages(messages: Messages): RetryMessages {
  const picked: Partial<Record<RetryKey, string>> = {};
  for (const key of Object.keys(messages) as MessageKey[])
    if (key.startsWith('retry.')) picked[key as RetryKey] = messages[key];
  return picked as RetryMessages;
}
