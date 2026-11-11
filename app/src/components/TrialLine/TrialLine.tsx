'use client';

import { usePlans } from '@/components/PlansController/plansContext';
import styles from '@/components/PlanCard/PlanCard.module.css';

// Hidden, not removed: keeps its space so /v1/me moves nothing (04 Trial).
export function TrialLine({ text }: { text: string }) {
  const { trialHidden } = usePlans();
  return (
    <p className={styles.trial} style={{ visibility: trialHidden ? 'hidden' : 'visible' }}>
      {text}
    </p>
  );
}
