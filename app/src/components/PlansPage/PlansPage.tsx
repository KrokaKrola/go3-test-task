import type { PlanPageData } from '@/cms/parsePlanPage/parsePlanPage';
import { PlanCard, type PlanCardText } from '@/components/PlanCard/PlanCard';
import {
  PlansController,
  type PlansControllerProps,
} from '@/components/PlansController/PlansController';
import { isTrialPlan } from '@/domain/plans/plans';
import stepStyles from '@/components/eid/StepScreen/StepScreen.module.css';
import styles from './PlansPage.module.css';

export type PlansText = PlanCardText & { faqHeading: string; handoff: string };

type Props = {
  page: PlanPageData;
  text: PlansText;
  controller: Omit<PlansControllerProps, 'children' | 'planTitles' | 'planPrices'>;
};

const planTitles = (page: PlanPageData) =>
  Object.fromEntries(page.cards.map((card) => [card.planId, card.title]));

const planPrices = (page: PlanPageData) =>
  Object.fromEntries(
    page.cards.map(({ planId, priceNet, vatRate, currency }) => [
      planId,
      { id: planId, priceNet, vatRate, currency },
    ]),
  );

export function PlansPage({ page, text, controller }: Props) {
  return (
    <PlansController {...controller} planTitles={planTitles(page)} planPrices={planPrices(page)}>
      {/* Shown only during the payment handoff (Q77); static so it paints before hydration. */}
      <main data-handoff-screen="" hidden className={stepStyles.screen}>
        <h1>{text.handoff}</h1>
        <p role="status">{text.handoff}</p>
      </main>
      <main data-handoff-hidden="" className={styles.page}>
        <h1>{page.headline}</h1>
        {page.subhead && <p>{page.subhead}</p>}
        <div className={styles.cards}>
          {page.cards.map((card) => (
            <PlanCard
              key={card.planKey}
              card={card}
              text={text}
              showTrial={isTrialPlan(card.planKey)}
            />
          ))}
        </div>
        <section>
          {page.legalText.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
        {page.faq.length > 0 && (
          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading">{text.faqHeading}</h2>
            <dl>
              {page.faq.map(({ question, answer }) => (
                <div key={question}>
                  <dt>{question}</dt>
                  <dd>{answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </main>
    </PlansController>
  );
}
