# Team note: Nordlight subscribe flow

**To:** Product lead, Backend lead · **From:** Frontend · 2026-11-11

The slice runs end to end against the mock: plan → eID → review → pay → confirmed. It also covers payment declined, slow payment, eID cancelled or expired, already subscribed, and `requires_action`. It is built on 75 working assumptions (`spec/03-open-questions.md`). Five of them can lose money, break consumer law or lose a paying customer, and only you can settle them.

## 1. Orders don't carry the market, so the wrong VAT can be charged (Q1, Q4): Critical · Backend

`POST /v1/orders` takes only `planId`. Plan ids are shared across EE/LV/LT, but VAT is 24% in EE and 21% in LV/LT. The mock also accepts a plan in a market that doesn't sell it, so LV can order Premium. Order responses have no amount, currency or trial flag, so neither the user nor GA sees what was actually charged.
**Recommendation:** accept `market` in the body (we already send it), and reject a plan the market doesn't sell with a 4xx. Return `amount`, `tax`, `currency` and `trial` on the order. Launch blocker.

## 2. Double orders mean double charges (Q19, Q34, Q37, Q39): Critical · Backend

There is no idempotency. Each of these creates a second order, and both can be paid: a double tap, a retry after a timeout, a reload during the POST, or two tabs. The frontend narrows the window with a disabled button, an open order shared across tabs, and a check before every order. It can't close it: after a POST times out we can't know whether the order exists.
**Recommendation:** support `Idempotency-Key` on `POST /v1/orders` and allow the header in CORS (the mock rejects it today). While the customer has an unpaid order, answer `409 pending_order_exists`. We already handle any 409 by re-checking (Q41).

## 3. Payment with no legal confirmation step (Q3, Q32, Q50, Q12): Critical · Product + Legal

In the brief, eID leads straight to payment. Trial eligibility and the final price are known only after eID. EU consumer law requires the price, the trial terms and an "order with obligation to pay" button right before payment. We built a Review step for this, behind the `reviewStep` flag (on), with an unchecked consent box. Its wording is a placeholder.
**Recommendation:** make Review part of the product. Legal writes the consent text, the button label and the trial terms, including what a trial charges today (0 €, or a card check). Keep the flag's off arm as a kill switch only, and don't A/B test it until Legal says the off arm is lawful.

## 4. Returning in another browser, and an eID callback that isn't bound to a browser (Q7, Q33, Q6, Q40): High · Backend + Security

70% of users are on phones. The eID app switch and in-app browsers (Instagram, Facebook) often return the user in a different browser, with no session cookie. The callback has no `state` param, so it can't be bound to the browser that started it (login CSRF). The provider return contracts (`?status=`, `?orderId=`, `cancelled=1`, `actionUrl`) and the CORS and cookie rules exist only in the mock.
**Recommendation:**
- Add a `state` param to eID start and the callback.
- Publish the return params and the cookie attributes (`SameSite`, domain, lifetime; Q17) as the real contract.
- Confirm that the API allows the `www` origin with credentials.

On our side, plan, market, locale and UTMs travel in `returnUrl`, so a lost session costs one more eID, never a new order.

## 5. Paid customers with no confirmation (Q15, Q9): High · Product + Backend

Without a sign-up form we have no email. Payment confirmation is "usually seconds, occasionally minutes". After our 3-minute polling cap the user sees "we'll confirm shortly" and an order id, and nothing else: no receipt, no "your payment went through", and no way to reach them if the payment fails later. EU law also requires the contract to be confirmed on a durable medium.
**Recommendation:** choose a contact channel before launch. Either collect an email on Review, or get one from the eID or payment provider. Backend: add a push or a "my orders" read, so a user who closed the tab can find the result.

## Everything else, ranked

Q = `spec/03`. "FE" = frontend items deferred in `PLAN.md`. FE items are ours and are listed so you can see the debt.

**High**
- **Product:**
  - Q2: CMS price "from 10,99 €" vs API 11,15 € (LV/LT Premium too). We show only the API price; the CMS and campaigns need fixing.
  - Q5/Q53: no CMP is named. Until one is, GA events and UTM storage stay off.
  - Q8/Q13/Q52: LV has 2 API plans vs 3 CMS cards, plus empty CMS fields. It stays behind `market.LV` (off).
  - Q10: account URL for existing subscribers.
- **Backend:**
  - Q18/Q43/Q56: two error formats and no code catalogue.
  - Q11/Q12: add `planKey` and `trialDays` to plans.
  - Q51: per-market order metrics for alerts.
  - Q49: runtime flag file and an error-tracker vendor.
- **FE:**
  - `actionUrl` isn't checked for https before the redirect.
  - Clearing UTMs on consent withdrawal isn't built.
  - No unit tests for `orderPoller` or `confirmOrder`.
  - A bfcache restore on Polling resumes a stale poller.
  - AI-translated et/lv/lt strings, consent included, need a native check.

**Medium**
- **Questions:**
  - Q9 polling timings · Q17 session lifetime · Q23 prices at build time vs runtime · Q30/Q31 where the user lands after a cancel or decline · Q38/Q41 retry point without Review.
  - Q14/Q55/Q63 URL and language rules · Q16 no "not you?" or logout.
  - Q20/Q46/Q47 GA: `purchase` dedupe, gross vs net, provider referrals · Q75 `purchase` after a reload while consent is pending.
  - Q21 WCAG 2.2 AA · Q22/Q54 performance budget (JS raised to 230 KB) · Q24/Q48 languages and who translates.
  - Q35/Q42 429 without `Retry-After` · Q44/Q45 required CMS fields.
- **FE:**
  - Late order results are accepted with no `orderId` check.
  - "Check again" sends two GETs on a double click and shows no busy state.
  - The language switcher leaves the old locale in the stored context.
  - `plan_viewed` is dropped after a bfcache restore.
  - The 404 page has no `lang`.
  - The Pay button shows no busy label, and focus isn't moved after a bfcache restore.
  - One E2E clock assumption can make the test flaky.

**Low**
- **Questions:** Q25 `legalText` schema · Q26 `currency` field · Q27 promo and annual plans · Q28/Q29 mock quirks · Q36 unknown eID status · Q57–Q62 and Q64–Q74, frontend-internal assumptions (decided, listed for the record).
- **FE:** split `Review.tsx` and `PaymentReturn.tsx`, remove the duplicated order schema, naming and test nits.
