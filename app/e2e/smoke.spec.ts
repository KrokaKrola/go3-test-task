import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('mock is up and / has no axe violations', async ({ page, request }) => {
  const mockPort = process.env.E2E_MOCK_PORT ?? '4010';
  const plans = await request.get(`http://localhost:${mockPort}/v1/plans?market=EE`);
  expect(plans.ok()).toBe(true);

  await page.goto('/');
  // TODO: name says "/" but axe runs on the redirect target; see PLAN.md "Deferred from W-07 review".
  await page.waitForURL('**/ee/*/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
});
