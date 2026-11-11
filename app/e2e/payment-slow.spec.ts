import {
  chooseAndVerify,
  expect,
  heading,
  payFromReview,
  pollUntilVisible,
  test,
} from './support/fixtures';

test.describe('payment_slow', () => {
  test('still confirming then confirmed', async ({ page, flow }) => {
    await flow.useScenario('payment_slow');
    await page.goto('/ee/en/');
    await flow.checkScreen();

    await chooseAndVerify(page, flow, 'Standard');
    await flow.checkScreen();

    await payFromReview(page);
    await page.getByRole('link', { name: 'Pay now' }).click();
    await page.waitForURL('**/payment/return/**');
    const status = page.getByRole('status');
    await expect(status).toHaveText('Confirming your payment…');
    await flow.checkScreen();

    await page.clock.runFor(20_000);
    await expect(status).toHaveText(
      'Still confirming your payment. This can take a little longer.',
    );

    await pollUntilVisible(page, heading(page).filter({ hasText: 'Payment confirmed' }));
    await flow.checkScreen({ focusMoves: true });
    expect(await flow.orderCount()).toBe(1);
  });
});
