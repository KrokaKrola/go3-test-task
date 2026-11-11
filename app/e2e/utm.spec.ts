import { chooseAndVerify, expect, payFromReview, test } from './support/fixtures';

const UTM =
  'utm_source=newsletter&utm_medium=email&utm_campaign=autumn&utm_term=tv&utm_content=hero';

type Body = { returnUrl: string };

test.describe('happy', () => {
  test('utm_* + plan, market, locale in both returnUrl bodies', async ({ page, flow }) => {
    const identityRequest = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/v1/identity/sessions'),
    );
    await page.goto(`/ee/en/?${UTM}`);
    await flow.checkScreen();

    const orderRequest = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/v1/orders'),
    );
    await chooseAndVerify(page, flow, 'Standard');
    await flow.checkScreen();
    await payFromReview(page);

    const expectedParams = {
      plan: 'standard',
      market: 'ee',
      locale: 'en',
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'autumn',
      utm_term: 'tv',
      utm_content: 'hero',
    };
    for (const request of [await identityRequest, await orderRequest]) {
      const { returnUrl } = request.postDataJSON() as Body;
      const params = Object.fromEntries(new URL(returnUrl).searchParams);
      expect(params).toMatchObject(expectedParams);
    }
  });
});
