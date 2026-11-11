import { loadPlanPage } from '@/cms/loadPlanPage/loadPlanPage';
import { PaymentReturn } from '@/components/payment/PaymentReturn/PaymentReturn';
import { getConfig } from '@/config';
import { enabledPairs } from '@/domain/markets/markets';

export default async function PaymentReturnPage() {
  const { API_BASE, ACCOUNT_URL, flags } = getConfig();
  const entries = await Promise.all(
    enabledPairs(flags).map(async (pair) => {
      const { page } = await loadPlanPage(pair, true);
      const titles = Object.fromEntries(
        (page?.cards ?? []).map((card) => [card.planId, card.title]),
      );
      return [`${pair.market}/${pair.locale}`, titles] as const;
    }),
  );
  return (
    <PaymentReturn
      apiBase={API_BASE}
      accountUrl={ACCOUNT_URL}
      reviewStep={flags.reviewStep}
      planTitles={Object.fromEntries(entries)}
    />
  );
}
