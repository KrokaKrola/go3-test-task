'use client';

import { usePlans } from '@/components/PlansController/plansContext';
import styles from '@/components/PlanCard/PlanCard.module.css';

export function SelectButton({ planId, label }: { planId: string; label: string }) {
  const { select } = usePlans();
  return (
    <button type="button" className={styles.select} onClick={() => select(planId)}>
      {label}
    </button>
  );
}
