import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

const mockOrigin = `http://localhost:${process.env.E2E_MOCK_PORT ?? '4010'}`;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

type MockState = { orders: { id: string; status: string }[] };

export type Flow = {
  useScenario: (name: string) => Promise<void>;
  orderCount: () => Promise<number>;
  // Zero axe violations, then records the title; titles must not repeat along the path.
  checkScreen: (options?: { focusMoves?: boolean; revisit?: boolean }) => Promise<void>;
  titles: string[];
};

export const test = base.extend<{ flow: Flow; autoSetup: void }>({
  autoSetup: [
    async ({ request, page }, provide) => {
      await request.post(`${mockOrigin}/__mock/reset`);
      // Provider pages auto-continue after 30 ms at scale 50; frozen timers make tests click.
      // install alone lets time flow; pausing freezes provider timers and gives runFor control.
      await page.clock.install();
      await page.clock.pauseAt(Date.now() + 1_000);
      await provide();
    },
    { auto: true },
  ],
  flow: async ({ page, request, context }, provide) => {
    const titles: string[] = [];
    await provide({
      titles,
      useScenario: (value) =>
        context.addCookies([{ name: 'nl_scenario', value, domain: 'localhost', path: '/' }]),
      orderCount: async () => {
        const state = (await (await request.get(`${mockOrigin}/__mock/state`)).json()) as MockState;
        return state.orders.length;
      },
      // Only a client-side step change moves focus to <h1> (08); a fresh page load does not.
      checkScreen: async ({ focusMoves = false, revisit = false } = {}) => {
        const h1 = page.getByRole('heading', { level: 1 });
        if (focusMoves) await expect(h1).toBeFocused();
        else await expect(h1).toBeVisible();
        // Read before resume(): running time can move the app on (e.g. Polling to Review).
        const title = await page.title();
        const h1Text = await h1.textContent();
        const url = page.url();
        // axe schedules its own timers, so it needs a running clock.
        await page.clock.resume();
        const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        // pauseAt(now + 1 s) moves app time forward by 1 s.
        await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
        expect(violations).toEqual([]);
        expect(page.url()).toBe(url);
        await expect(h1).toHaveText(h1Text ?? '');
        // A retry point is the earlier screen again: same title, not a repeat of another state.
        if (revisit) expect(titles).toContain(title);
        else {
          expect(titles).not.toContain(title);
          titles.push(title);
        }
      },
    });
  },
});

export { expect };

export const heading = (page: Page) => page.getByRole('heading', { level: 1 });

// The redirect waits 300-500 ms on the app clock (08), and starts once the request is back.
// One runFor after the response: a second one on the provider page would fire its auto-continue.
async function clickAndFollowRedirect(
  page: Page,
  click: () => Promise<void>,
  endpoint: string,
  urlPart: string,
) {
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(endpoint),
  );
  await click();
  await (await response).finished();
  await page.evaluate(() => undefined);
  await page.clock.runFor(500);
  await page.waitForURL(`**${urlPart}**`, { waitUntil: 'commit' });
}

// Plans → eID provider (click) → callback → Review.
export async function chooseAndVerify(page: Page, flow: Flow, planName: string) {
  await clickAndFollowRedirect(
    page,
    () => page.getByRole('button', { name: `Choose ${planName}` }).click(),
    '/v1/identity/sessions',
    '/mock-eid/',
  );
  // Hold /v1/me so Verifying stays on screen long enough to check it.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/v1/me', async (route) => {
    if (page.url().includes('/auth/callback')) await held;
    await route.continue();
  });
  await page.getByRole('link', { name: 'Confirm now' }).click({ noWaitAfter: true });
  await page.waitForURL('**/auth/callback/**', { waitUntil: 'commit' });
  await flow.checkScreen();
  release();
  // Callback → Verifying → redirect to Review, all on the app clock.
  await expect
    .poll(async () => {
      if (!page.url().includes('/review/')) await page.clock.runFor(500);
      return page.url();
    })
    .toContain('/ee/en/review/');
}

export async function payFromReview(page: Page) {
  await page.getByRole('checkbox').check();
  await clickAndFollowRedirect(
    page,
    () => page.getByRole('button', { name: 'Order with obligation to pay' }).click(),
    '/v1/orders',
    '/mock-pay/',
  );
}

// Pay on the provider page, then hold the first order GET so the Polling screen stays on show.
export async function payAndCheckPolling(page: Page, flow: Flow) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/v1\/orders\/ord_\w+$/, async (route) => {
    if (page.url().includes('/payment/return')) await held;
    await route.continue();
  });
  await page.getByRole('link', { name: 'Pay now' }).click();
  await page.waitForURL('**/payment/return/**');
  await expect(heading(page)).toHaveText('Confirming your payment');
  await flow.checkScreen();
  release();
}

// Mock settles on server time: advance app timers per try until the order resolves.
export async function pollUntilVisible(page: Page, locator: ReturnType<Page['getByText']>) {
  await expect
    .poll(async () => {
      await page.clock.runFor(5_000);
      return locator.isVisible();
    })
    .toBe(true);
}
