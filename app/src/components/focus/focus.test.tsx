import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFocusHeadingOnStepChange } from './focus';

function Step({ step }: { step: string }) {
  useFocusHeadingOnStepChange(step);
  return (
    <main>
      <button>before</button>
      <h1>{step}</h1>
    </main>
  );
}

describe('focus', () => {
  it('moves focus to h1 on step change', () => {
    const { rerender, getByRole } = render(<Step step="plans" />);
    expect(getByRole('heading', { level: 1 })).not.toHaveFocus();
    rerender(<Step step="review" />);
    const h1 = getByRole('heading', { level: 1, name: 'review' });
    expect(h1).toHaveFocus();
    expect(h1).toHaveAttribute('tabindex', '-1');
  });
});
