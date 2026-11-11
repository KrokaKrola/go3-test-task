import { notFound } from 'next/navigation';
import { loadPlanPage } from '@/cms/loadPlanPage/loadPlanPage';
import { pickEidMessages } from '@/components/eid/eidMessages/eidMessages';
import { PlansPage } from '@/components/PlansPage/PlansPage';
import { getConfig } from '@/config';
import { ALL_PAIRS, enabledPairs } from '@/domain/markets/markets';
import { getMessages } from '@/i18n/messages/messages';

type Params = Promise<{ market: string; locale: string }>;

// Disabled pairs are not generated, but their CMS entry is still validated (06 Build gate).
export async function generateStaticParams() {
  const enabled = enabledPairs(getConfig().flags);
  for (const pair of ALL_PAIRS.filter((p) => !enabled.includes(p))) {
    const { warnings } = await loadPlanPage(pair, false);
    for (const warning of warnings) console.warn(`[cms] ${pair.market}/${pair.locale}: ${warning}`);
  }
  return enabled.map(({ market, locale }) => ({ market, locale }));
}

export default async function PairPage({ params }: { params: Params }) {
  const { market, locale } = await params;
  const pair = enabledPairs(getConfig().flags).find(
    (p) => p.market === market && p.locale === locale,
  );
  if (!pair) notFound();
  const { page, warnings } = await loadPlanPage(pair, true);
  if (!page) throw new Error('unreachable: enabled market always yields a page');
  for (const warning of warnings) console.warn(`[cms] ${pair.market}/${pair.locale}: ${warning}`);
  const messages = getMessages(pair.locale);
  const config = getConfig();
  return (
    <PlansPage
      page={page}
      controller={{
        pair,
        reviewStep: config.flags.reviewStep,
        accountUrl: config.ACCOUNT_URL,
        apiBase: config.API_BASE,
        eidMessages: pickEidMessages(messages),
      }}
      text={{
        choose: messages['plans.choose'],
        perMonth: messages['plans.perMonth'],
        trial: messages['plans.trial'],
        faqHeading: messages['plans.faqHeading'],
      }}
    />
  );
}
