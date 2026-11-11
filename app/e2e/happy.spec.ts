import {
  chooseAndVerify,
  expect,
  heading,
  payAndCheckPolling,
  payFromReview,
  pollUntilVisible,
  test,
} from './support/fixtures';

test.describe('happy', () => {
  test('anonymous full path', async ({ page, flow }) => {
    await page.goto('/ee/en/');
    await flow.checkScreen();

    await chooseAndVerify(page, flow, 'Standard');
    await expect(heading(page)).toHaveText('Review your order');
    await expect(page.getByText('Your 30-day free trial is included.')).toBeVisible();
    await flow.checkScreen();

    await payFromReview(page);
    await payAndCheckPolling(page, flow);
    await pollUntilVisible(page, heading(page).filter({ hasText: 'Payment confirmed' }));
    await expect(page.getByText(/ord_\w+/)).toBeVisible();
    await flow.checkScreen({ focusMoves: true });

    expect(await flow.orderCount()).toBe(1);
  });
});
