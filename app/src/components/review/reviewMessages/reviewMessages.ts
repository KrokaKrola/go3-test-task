import type { MessageKey, Messages } from '@/i18n/messages/messages';

type ReviewKey = Extract<MessageKey, `review.${string}`>;
export type ReviewMessages = Pick<Messages, ReviewKey>;

export function pickReviewMessages(messages: Messages): ReviewMessages {
  const picked: Partial<Record<ReviewKey, string>> = {};
  for (const key of Object.keys(messages) as MessageKey[])
    if (key.startsWith('review.')) picked[key as ReviewKey] = messages[key];
  return picked as ReviewMessages;
}
