import type { Notice } from '@/flow/machine/machine';

export const NOTICE_PARAM = 'notice';

const NOTICES: readonly Notice[] = ['payment_cancelled', 'payment_declined', 'plan_unavailable'];

// Unknown value → no banner (04 Terms).
export const parseNotice = (value: string | null): Notice | null =>
  NOTICES.find((notice) => notice === value) ?? null;

export const noticeFromSearch = (search: string): Notice | null =>
  parseNotice(new URLSearchParams(search).get(NOTICE_PARAM));

// Read once, then removed without a history entry (04 Terms). Other params stay.
export function removeUrlParam(name: string): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', url);
}
