import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlanCardData } from '@/cms/parsePlanPage/parsePlanPage';
import { PlansContext } from '@/components/PlansController/plansContext';
import { PlanCard } from './PlanCard';

const text = { choose: 'Choose', perMonth: '/ month', trial: '30-day free trial' };
const card = (planKey: PlanCardData['planKey'], title: string): PlanCardData => ({
  planKey,
  planId: `id_${planKey}`,
  title,
  bullets: ['one'],
  badge: null,
  priceText: '11,15 €',
  priceNet: 900,
  vatRate: 0.24,
  currency: 'EUR',
});

const renderCard = (
  data: PlanCardData,
  { showTrial = false, trialHidden = false, select = vi.fn() } = {},
) =>
  render(
    <PlansContext.Provider value={{ trialHidden, select }}>
      <PlanCard card={data} text={text} showTrial={showTrial} />
    </PlansContext.Provider>,
  );

describe('PlanCard', () => {
  it('price is one text node', () => {
    renderCard(card('standard', 'Standard'));
    const price = screen.getByText((_, el) => el?.textContent === '11,15 €' && el.tagName === 'P');
    expect(price.childElementCount).toBe(0);
    expect(price.childNodes).toHaveLength(1);
  });

  it('button name includes plan title', () => {
    const select = vi.fn();
    renderCard(card('standard', 'Standard'), { select });
    const button = screen.getByRole('button', { name: 'Choose Standard' });
    expect(button).toBeEnabled();
    button.click();
    expect(select).toHaveBeenCalledWith('id_standard');
  });

  it('is an article with title heading', () => {
    renderCard(card('premium', 'Premium'));
    const article = screen.getByRole('article', { name: 'Premium' });
    expect(article.querySelector('h2')).toHaveTextContent('Premium');
  });

  it('trial line on standard/premium, none on basic', () => {
    for (const key of ['standard', 'premium'] as const) {
      const { unmount } = renderCard(card(key, key), { showTrial: true });
      expect(screen.getByText(text.trial)).toBeVisible();
      unmount();
    }
    renderCard(card('basic', 'Basic'), { showTrial: false });
    expect(screen.queryByText(text.trial)).toBeNull();
  });

  it('identified + not trialEligible → visibility hidden, space kept', () => {
    renderCard(card('standard', 'Standard'), { showTrial: true, trialHidden: true });
    const line = screen.getByText(text.trial);
    expect(line).toBeInTheDocument();
    expect(line).toHaveStyle({ visibility: 'hidden' });
  });
});
