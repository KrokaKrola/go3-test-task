'use client';

import { useEffect, type ReactNode } from 'react';
import { brandName } from '@/brand';
import styles from './StepScreen.module.css';

export type StepAction = { label: string; onClick: () => void; disabled?: boolean };

// One screen of the flow: unique title, one h1, actions with a 44px target (08).
export function StepScreen({
  title,
  actions = [],
  children,
}: {
  title: string;
  actions?: StepAction[];
  children?: ReactNode;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${brandName}`;
    // Leaving the screen restores the page's own title (Plans after Change plan).
    return () => {
      document.title = previous;
    };
  }, [title]);
  return (
    <main className={styles.screen}>
      <h1>{title}</h1>
      {children}
      {actions.length > 0 && (
        <div className={styles.actions}>
          {actions.map(({ label, onClick, disabled }) => (
            <button
              key={label}
              type="button"
              className={styles.action}
              onClick={onClick}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
