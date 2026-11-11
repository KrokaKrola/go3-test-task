import { notFound } from 'next/navigation';
import { loadPlanPage } from '@/cms/loadPlanPage/loadPlanPage';
import { pickEidMessages } from '@/components/eid/eidMessages/eidMessages';
import { pickRetryMessages } from '@/components/RetryPoint/retryMessages/retryMessages';
import { Review } from '@/components/review/Review/Review';
import { pickReviewMessages } from '@/components/review/reviewMessages/reviewMessages';
import { getConfig } from '@/config';
import { enabledPairs } from '@/domain/markets/markets';
import { getMessages } from '@/i18n/messages/messages';

type Params = Promise<{ market: string; locale: string }>;

// Static export needs a path per pair; with `reviewStep` off the page renders the 404 (Q73).
export function generateStaticParams() {
  return enabledPairs(getConfig().flags).map(({ market, locale }) => ({ market, locale }));
}

export default async function ReviewPage({ params }: { params: Params }) {
  const { market, locale } = await params;
  const config = getConfig();
  const pair = enabledPairs(config.flags).find((p) => p.market === market && p.locale === locale);
  if (!pair || !config.flags.reviewStep) notFound();
  const { page } = await loadPlanPage(pair, true);
  if (!page) throw new Error('unreachable: enabled market always yields a page');
  const messages = getMessages(pair.locale);
  return (
    <Review
      pair={pair}
      accountUrl={config.ACCOUNT_URL}
      apiBase={config.API_BASE}
      messages={pickReviewMessages(messages)}
      eidMessages={pickEidMessages(messages)}
      retryMessages={pickRetryMessages(messages)}
      legalText={page.legalText}
      planTitles={Object.fromEntries(page.cards.map((card) => [card.planId, card.title]))}
    />
  );
}
