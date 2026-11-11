import {
  chooseAndVerify,
  expect,
  heading,
  payAndCheckPolling,
  pollUntilVisible,
  test,
} from './support/fixtures';

// Needs an app built with the flag off: `npm run e2e:review-off`.
const reviewStepOff = process.env.NEXT_PUBLIC_FLAG_REVIEW_STEP === 'false';

test.describe('reviewStep off', () => {
  test.skip(!reviewStepOff, 'runs only with NEXT_PUBLIC_FLAG_REVIEW_STEP=false');

  test('eID → order straight away → payment → confirmed (Q32)', async ({ page, flow }) => {
    await page.goto('/ee/en/');
    await flow.checkScreen();

    // Hold the order POST so the handoff screen on Plans can be checked (Q77).
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/v1/orders', async (route) => {
      await held;
      await route.continue();
    });
    await chooseAndVerify(page, flow, 'Standard', '/ee/en/?plan=standard');
    await expect(heading(page)).toHaveText('Opening payment…');
    await expect(page.getByRole('button', { name: 'Choose Standard' })).toBeHidden();
    await expect(page.getByRole('navigation')).toBeHidden();

    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/v1/orders'),
    );
    release();
    await (await response).finished();
    await page.clock.runFor(500);
    await page.waitForURL('**/mock-pay/**', { waitUntil: 'commit' });

    await payAndCheckPolling(page, flow);
    await pollUntilVisible(page, heading(page).filter({ hasText: 'Payment confirmed' }));
    await flow.checkScreen({ focusMoves: true });

    expect(await flow.orderCount()).toBe(1);
  });
});
