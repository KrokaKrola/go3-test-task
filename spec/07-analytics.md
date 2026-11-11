# 07 · Analytics

The GA4 events the flow sends through GTM, what they carry, and when they may be sent. Transitions refer to `04-user-flow-state-machine.md`. Q-numbers refer to `03-open-questions.md`. Quality checks are in `08-quality.md`.

Marks: **[D]** in `docs/04-analytics-notes.md` · **[A]** our rule.

In the thin slice (PLAN 2.5). No CMP yet: consent stays `pending`, so events queue and UTMs live in the URL only (Q53). All logic below is still built. Server-side `purchase` and extra events are cut (PLAN.md cut list).

## What the docs give us, and what they don't

- Six events, names fixed by marketing ("keep names exactly as written") [D]. Happy path only: no event for a cancel, decline, error or timeout.
- Only `purchase` has params: `transaction_id`, `value`, `currency` [D]. Nothing for the other five (Q20).
- "UTM parameters should survive until `purchase`" [D]. No storage rule, and the flow leaves our origin once or twice: eID, then payment (plus `actionUrl` on `requires_action`). Return can land in another browser (Q7).
- No consent mechanism (Q5). GA4 in the EU needs prior consent for analytics cookies.
- `purchase` fired in the browser misses every user who never comes back from payment, and can fire twice (reload, second tab, second browser).
- The order API returns no amount, currency or trial flag (Q4). `value` is our estimate.

## Module

One pure module, `analytics.ts`:

- `track(event, params)`: typed map of the six events → their params. Unknown event = type error.
- Adds the common params, checks consent, applies the once-rules, then `dataLayer.push`.
- Components and state handlers call `track` on the transitions below. Nothing else touches `dataLayer`.
- Unit-tested: params per event, once-rules, consent gate, no personal data.

## Events

Each event is bound to one transition in 04. Not firing elsewhere is part of the rule.

| Event [D] | Fires on (04) | Params (plus common) | Once-rule [A] |
|---|---|---|---|
| `plan_viewed` | **Entry → Plans** (after `/v1/me` resolves: 200 identified, 401 or 5xx anonymous). Not on Change plan, retry point (reviewStep off), invalid_plan notice, or Entry → Account | `identified` (bool) | Once per document load of Plans via Entry. Reload = new view (GA semantics). bfcache restore (`pageshow.persisted`) re-runs Entry (04 invariant 6) but does not fire |
| `plan_selected` | **Plans —select→** (any target: StartingEid, Review, Gate) | `plan_id` | Every select. Change plan → select again fires again |
| `identity_started` | **StartingEid —201→ redirect to `redirectUrl`**. Not on click (may 429/fail) | `plan_id`, `eid_purpose`: `checkout` \| `reverify` (reverify = orderId in context, from IdentityLost) | Once per 201. Retry after EidFailed/RateLimited fires again: each is a real start |
| `identity_completed` | **Verifying —200→** (any target: Review, Gate, Account, PaymentReturn). Not on `?status=ok` alone: only `/v1/me` proves it | `plan_id`, `eid_purpose` | Once per callback load. EidCallback exits use `history.replace` (04), so Back or reload never re-enters it. Not fired when Entry `/v1/me` 200 skips eID |
| `payment_started` | **CreatingOrder —201→ redirect to `paymentUrl`**. Not on Resume "Continue payment", not on `actionUrl` redirect | `plan_id`, `transaction_id` (= `orderId`) | Once per orderId (one 201 per order) |
| `purchase` | **Enter Confirmed**. 04 has several edges in (PaymentReturn, Polling, Gate step 1, Unconfirmed "Check again"); all mean the same server fact `paid`, so the binding is to the state, not an edge | `transaction_id`, `value`, `currency` [D]; `plan_id`, `trial`, `tax` [A] | Once per orderId per browser. Guard key in `localStorage` (shared by tabs, outlives the tab), not `sessionStorage` (Q20). Reload on Confirmed = no event |

Redirect events (`identity_started`, `payment_started`): push with GTM `eventCallback`, navigate on callback but not before 300 ms (time for the "Opening …" announcement, 08) and not after 500 ms. Otherwise the hit can be lost to the navigation. Blocked GTM never blocks the redirect.

### `purchase` params

| Param | Value | Source |
|---|---|---|
| `transaction_id` | `orderId` | `POST /v1/orders` [D] |
| `value` | Gross price the user saw (incl. VAT), in euros, 2 decimals. `0` if trial applied (Q4) | Snapshot taken at CreatingOrder into the open order: Review price, or plan card price when `reviewStep` off. Same formula as 05 (Q2) |
| `tax` | VAT part of `value` (`0` on trial). Lets marketing derive net per market (Q46) | Same snapshot |
| `currency` | `currency` from `/v1/plans` (always `EUR`, Q26) | Snapshot |
| `trial` | `true` \| `false` \| `unknown` | Snapshot of "trial shown" (Q12). After payment `trialEligible` may flip, so never re-read `/v1/me` for this |
| `plan_id` | API plan id | Snapshot, else `GET /v1/orders/{id}.planId` |

No snapshot (return in another browser, Q7, Q33): `value` from `/v1/plans` for `planId` + market, `trial: unknown`. Marketing must treat these as estimates.

Why the snapshot: the server returns no amount (Q4), and the price is binding only on Review (Q23).

Order on Confirmed (04): build `purchase` params from the snapshot, call `track`, then clear the open order. `track` resolves all params at call time, so a queued event (before consent) doesn't depend on storage cleared later.

## Common params (every event)

| Param | Value | Notes |
|---|---|---|
| `market` | `EE` \| `LV` \| `LT` | Uppercase, as the API. From flow context (stored > `returnUrl` query > path, 04 invariant 2); callbacks have no market in the path |
| `locale` | `et` \| `lv` \| `lt` \| `en` | Same source as `market` |
| `review_step` | `true` \| `false` | Slice: build flag value. Prod: the flow's experiment arm after overrides (10). Needed to compare funnels (Q3, Q32) |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | As captured, omitted when absent | See below. Truncated to 100 chars (GA4 param limit) |

Marketing registers the custom params (`plan_id`, `market`, `locale`, `review_step`, `trial`, `eid_purpose`, `identified`) as GA4 custom dimensions. Without that they aren't reportable.

### No personal data

Never sent: `customerId`, eID data (none is exposed anyway, Q15), `sessionId`, `paymentUrl`, `actionUrl`, `redirectUrl`, `returnUrl`, error messages. `orderId` is pseudonymous and required by marketing as `transaction_id`. A unit test asserts the param whitelist per event.

## UTM capture and storage

**Capture** [A]: on Entry, read `utm_*` from the landing URL. A new landing with any `utm_*` replaces the whole set (last campaign wins). A landing without UTMs keeps a stored set. Other query params are ignored (`gclid` etc.).

**Carry**: two (three with `actionUrl`) cross-origin redirects, maybe into another browser (Q7).

| Where | Before consent | After consent |
|---|---|---|
| Memory (current page, client-side navigation) | yes | yes |
| `returnUrl` query, eID and payment (Q7) | yes: URL, not storage (Q5) | yes |
| `sessionStorage` (same tab, after a redirect) | no | yes |

Trust order as 04 invariant 2: stored > `returnUrl` query. On return, the app reads UTMs from the query only when nothing is stored. Without consent, UTMs exist only in the URL, so they survive the redirects but not a manual reload of a page without them.

`returnUrl` keeps the standard `utm_*` names. Side effect: the return page view re-states the campaign, so GA4 doesn't credit the eID or payment provider as a referral. Still needed from marketing: eID and payment domains in GA4 "unwanted referrals" (Q47).

Limits: UTMs add to `returnUrl` length, and the provider/API limit is not documented (02). UTMs reach the eID and payment providers in the URL; they hold no personal data.

## Consent

Assumption Q5: GTM Consent Mode v2, basic mode (no Google tags before consent). CMP vendor unknown.

| | Before a decision | Granted (`analytics_storage`) | Denied or withdrawn |
|---|---|---|---|
| Consent default | `gtag('consent', 'default', {analytics_storage, ad_storage, ad_user_data, ad_personalization: 'denied'})` before GTM loads | `update` by the CMP | stays denied |
| App events | Queued in memory, current page only | Queue flushed, then pushed live | Queue dropped, nothing pushed |
| UTMs | Memory + URL | + `sessionStorage` | Memory + URL. Withdrawal clears our keys |
| `purchase` guard | not written | `localStorage` | not written. Withdrawal keeps existing keys (orderId only, no personal data), so a re-grant + reload can't send `purchase` twice |
| GA cookies (`_ga`) | none | set by GA | none |

- Queued events not flushed before a redirect or reload are lost. Accepted (Q5): a user who decides after eID shows `identity_completed` without `plan_viewed`/`plan_selected`/`identity_started`, so the top of the funnel is undercounted.
- Return in another browser: no CMP cookie there, so the banner shows again on the callback page; events queue until the decision.
- The flow never waits for, or depends on, consent or GTM. Functional storage (open order, attempt marker, Q37) is not analytics and needs no consent.
- Advanced mode (cookieless pings) is a Legal decision (Q5).
- The CMP and GTM count against LCP, INP and CLS on Plans, not the JS size budget (08).

## Known gaps of client-side events

| Gap | Effect | Fix |
|---|---|---|
| User never returns from payment (closes tab, Unconfirmed → "Go to account", provider return fails) | `purchase` never sent, revenue undercounted | Server-side `purchase` (cut, PLAN.md) |
| Return in another tab or browser | Guard is per browser: a second browser can send `purchase` again. GA4 drops a repeated `transaction_id` only for the same user | Server-side `purchase` (cut) |
| Return in another browser | New GA client id: `purchase` attributed to a new user, campaign only from `returnUrl` UTMs | Server-side `purchase` (cut) |
| Consent denied | No events at all | Accepted (Legal) |
| Ad/tracking blockers | No events | Server-side `purchase` (cut) |
| `value` is an estimate | Can differ from what was charged | Amount on the order (Q4) |
