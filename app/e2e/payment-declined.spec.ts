import {
  chooseAndVerify,
  expect,
  heading,
  payAndCheckPolling,
  payFromReview,
  pollUntilVisible,
  test,
} from './support/fixtures';

test.describe('payment_declined', () => {
  test('retry creates second order', async ({ page, flow }) => {
    await flow.useScenario('payment_declined');
    await page.goto('/ee/en/');
    await flow.checkScreen();

    await chooseAndVerify(page, flow, 'Standard');
    await flow.checkScreen();

    await payFromReview(page);
    const firstPayPageUrl = page.url();
    await payAndCheckPolling(page, flow);
    await pollUntilVisible(page, page.getByText('Payment was declined'));
    await expect(heading(page)).toHaveText('Review your order');
    await flow.checkScreen({ revisit: true });
    expect(await flow.orderCount()).toBe(1);

    await payFromReview(page);
    await expect(page.getByRole('link', { name: 'Pay now' })).toBeVisible();
    expect(page.url()).not.toBe(firstPayPageUrl);
    expect(await flow.orderCount()).toBe(2);
  });
});
