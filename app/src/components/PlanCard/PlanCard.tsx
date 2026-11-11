import type { PlanCardData } from '@/cms/parsePlanPage/parsePlanPage';
import { SelectButton } from '@/components/SelectButton/SelectButton';
import { TrialLine } from '@/components/TrialLine/TrialLine';
import styles from './PlanCard.module.css';

export type PlanCardText = { choose: string; perMonth: string; trial: string };

type Props = { card: PlanCardData; text: PlanCardText; showTrial: boolean };

export function PlanCard({ card, text, showTrial }: Props) {
  const titleId = `plan-title-${card.planKey}`;
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      {card.badge && <p className={styles.badge}>{card.badge}</p>}
      <h2 id={titleId}>{card.title}</h2>
      <p className={styles.price}>{card.priceText}</p>
      <p className={styles.perMonth}>{text.perMonth}</p>
      {showTrial && <TrialLine text={text.trial} />}
      {card.bullets.length > 0 && (
        <ul>
          {card.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      <SelectButton planId={card.planId} label={[text.choose, card.title].join(' ')} />
    </article>
  );
}
