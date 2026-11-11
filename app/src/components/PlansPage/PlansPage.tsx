import type { PlanPageData } from '@/cms/parsePlanPage/parsePlanPage';
import { PlanCard, type PlanCardText } from '@/components/PlanCard/PlanCard';
import {
  PlansController,
  type PlansControllerProps,
} from '@/components/PlansController/PlansController';
import { isTrialPlan } from '@/domain/plans/plans';
import styles from './PlansPage.module.css';

export type PlansText = PlanCardText & { faqHeading: string };

type Props = {
  page: PlanPageData;
  text: PlansText;
  controller: Omit<PlansControllerProps, 'children'>;
};

export function PlansPage({ page, text, controller }: Props) {
  return (
    <PlansController {...controller}>
      <main className={styles.page}>
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
