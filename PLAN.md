# Plan

Hard stop at 5:00. Clock started with discovery. Budget split follows the assignment: spec 60%, slice 30%, log + note 10%.

| Phase | Budget | Ends at |
|---|---|---|
| 0. Discovery: read docs/mock, list inconsistencies, send 3 questions | 0:30 | 0:30 ✅ |
| 1. Spec | 2:30 | 3:00 |
| 2. Thin slice | 1:30 | 4:30 |
| 3. AI-LOG, TEAM-NOTE, README | 0:30 | 5:00 |

No buffer is left. If a phase overruns, take the time from the cut list below. Never take it from phase 3.

## Decisions (2026-11-10)

- Stack: Next.js (App Router, `output: 'export'`), TypeScript, npm.
- Tests: Vitest + Testing Library (unit), Playwright (E2E) against the mock with `MOCK_TIME_SCALE=50`.
- Slice covers: happy path, `payment_declined`, `payment_slow` (polling), `identity_cancelled`/expired, `already_subscribed`, `payment_requires_action`.
- Review step is built behind the `reviewStep` flag (on by default) (Q3). Both arms are in the slice: off skips Review, and the retry point is Plans (Q32, Q38).
- Every 04 state is in the slice, built minimal. Lean Gate: open order in `localStorage`, Gate steps 1 + 3, Resume with "Check status" only. Attempt marker and "Continue payment" are post-slice (04 *Slice*).
- All 6 market/locale pages are generated from CMS fixtures. LV is behind the `market.LV` flag (Q13).
- Language switcher UI
- Order body sends `market` (Q1). Prices come from the API only, and `priceLabel` is not rendered (Q2).
- Analytics events (07) and UTM carry are in the slice. GTM, `dataLayer` and UTM logic built in full. No CMP or banner yet, so consent stays `pending` (Q53).
- Out of the slice (spec only): email/receipt.
- Open questions and working assumptions: `spec/03-open-questions.md`.

## Phase 1: Spec (2:30)

| # | File | Covers | Budget |
|---|---|---|---|
| 1.1 | `spec/README.md` | Index, reading order for humans and AI tools | 5 |
| 1.2 | `spec/01-scope.md` | Goals, scope, non-goals | 10 |
| 1.3 | `spec/02-system-context.md` | Upstream (API, eID, payment, CMS, GTM, CDN) and downstream (GA4, account app, marketing) | 10 |
| 1.4 | `spec/03-open-questions.md` | Keep current; add owners and answers as they arrive | 5 |
| 1.5 | `spec/04-user-flow-state-machine.md` | State machine (mermaid): states, events, guards, failure and recovery, what survives a browser switch | 30 |
| 1.6 | `spec/05-api-contract.md` | API contract as the frontend needs it (incl. `market`, error adapter, return params), field provenance, backend requests | 12 |
| 1.7 | `spec/06-cms-contract.md` | CMS contract (required fields, planKey map, validation) | 8 |
| 1.8 | `spec/07-analytics.md` | Analytics events, UTM carry, consent | 10 |
| 1.9 | `spec/08-quality.md` | i18n + URLs, accessibility (WCAG 2.2 AA), performance budget | 10 |
| 1.10 | `spec/09-testing.md` | Test pyramid, mock scenarios → test cases matrix | 15 |
| 1.11 | `spec/10-rollout.md` | Flags, LV launch, monitoring, alerts, rollback | 10 |
| 1.12 | `spec/11-work-items.md` | Work items sized for one AI session, each with acceptance criteria; slice items marked | 25 |
| | | **Total** | **150** |

Done when every topic in `ASSIGNMENT.md` § "The spec" maps to a file, and every work item has testable acceptance criteria.

## Phase 2: Thin slice (1:30)

Each step is one work item from `spec/11-work-items.md`, done in one AI session. The step is complete only when its tests pass.

| # | Step | Budget |
|---|---|---|
| 2.1 | Scaffold `app/`: Next static export, TS strict, Vitest, Playwright + `@axe-core/playwright`, ESLint, env config (`NEXT_PUBLIC_API_BASE`, flags) | 10 |
| 2.2 | API client: typed endpoints, error adapter (`{error}` / `{errors[]}` → one shape), `Retry-After`, price calc + locale formatting. Unit tests | 15 |
| 2.3 | Plan page `/[market]/[locale]/`: CMS + plans merged by planKey, hide cards without an API plan, empty-field rules. `/v1/me` check → account redirect | 15 |
| 2.4 | Flow state machine as a pure reducer + flow context and `utm_*` carried in `returnUrl`. Unit tests on transitions | 15 |
| 2.5 | Analytics: GTM loader + Consent Mode default, `track()` for the six events, common params, once-rules, consent adapter (`pending` until a CMP, Q53). Unit tests | 15 |
| 2.6 | eID start + `/auth/callback`: ok / cancelled / expired / 429 / already subscribed | 10 |
| 2.7 | Review (flagged) → order → `/payment/return` → polling (2 s, then 5 s, 3 min cap) → confirmed / declined (retry) / requires_action / slow message | 15 |
| 2.8 | Playwright: happy path + `payment_declined` + `payment_slow` + UTM carry, axe on every screen reached | 10 |
| | **Total** | **105** (15 over the 1:30 phase budget: take it from the cut list) |

## Phase 3: Docs (0:30)

| # | Deliverable | Budget |
|---|---|---|
| 3.1 | `AI-LOG.md`: tools, context structure, ≥3 wrong/weak outputs and fixes (source: `ai-log/`) | 12 |
| 3.2 | `TEAM-NOTE.md`: top 5 risks + recommendation each, to product lead and backend lead | 12 |
| 3.3 | Root `README.md`: install, run mock + app, test, what was cut | 6 |

## Cut list (cut from the top first)

1. `payment_requires_action` in the slice (stays in spec)
2. `identity_cancelled`/expired screen polish (keep the restart button only)
3. LV + `en` locales in the slice (keep EE `et`/`en` and LT `lt`)
4. `payment_slow` "still confirming" copy (keep the polling cap)

### Cut from spec (2026-11-11)

- Server-side `purchase` (GA4 Measurement Protocol from the payment webhook, attribution ids on the order). Gaps it would close stay listed in `spec/07-analytics.md`.
- Extra analytics events beyond marketing's six (failures, resume, errors, click ids, `items[]`, field INP).
- Partial `returnUrl` salvage (W-05 review): an invalid `market`/`locale` pair in the query drops the query `orderId` and UTMs too, even when stored context has a valid pair. Low risk: the mock returns our own params unchanged (Q61).

### Deferred from W-04 review (check later)

- Low: the flow store keeps only the last dispatch's effects, so two dispatches before the runner reads lose the first set. The runner must read through synchronous `subscribe`, or `dispatch` must return the effects. Check when the effect runner is built.
- ~~`startEidSession` effect carries only `planId`.~~ Resolved in W-09: the effect was removed, and StartEid builds `returnUrl` from the flow context. Still check that `reverifyOrderId` (04 inv 5) is carried once W-11/W-12 reach StartingEid.
- Stale results: `orderLoaded`/`orderFailed` carry no `orderId`, so a late result from another fetch (polling tick, double `retryCheck`) is accepted. Add `orderId` to these events and ignore mismatches. Check when the polling runner is built.

### Deferred from W-05 review (check later)

- `clearUtm` on consent withdrawal (07 "Withdrawal clears our keys"): build in W-06 with the consent adapter.

### Deferred from W-06 review (after basic flow works)

- Medium: bfcache flag `skipNextPlanViewed` (`analytics.ts`) is never cleared. Any `pageshow.persisted` (e.g. Review restored after Back from the payment provider) drops the next real `plan_viewed`, even after client nav to Plans. Fix: module flag `planViewedSent` (once per document load, which bfcache keeps), remove the `pageshow` listener, update Q62.
- `clearUtm` on consent `denied` (07 "Withdrawal clears our keys"): still not built. Subscribe to consent in the CMP bridge, or as a W-05 follow-up.

### Deferred from W-07 review (check later)

- Known regression: `out/404.html` has no `<html lang>` (WCAG 3.1.1), since the shared root layout was removed. Fix with `experimental.globalNotFound` + `app/global-not-found.tsx` wrapped in `DocumentShell lang="et"` when the 404 page is built.
- `e2e/smoke.spec.ts`: the test name says "/" but axe runs on the redirect target (`/ee/en/` under en-US Playwright). Check later: rename it, or also run axe on `/` with the redirect stubbed.
- W-09: a stored flow context saved before a language switch keeps the old locale (stored beats query, `flow/context.ts`), so the eID or payment return lands in the old language. Save the context at eID start, or update the stored locale on switch (Q63).
- W-10: strip `?notice=` with `history.replaceState(null, '', url)` or `router.replace`, never `replaceState(history.state, …)`. Next ignores the latter (its `__NA` state), so `useSearchParams` and the switcher href keep the old query.

### Deferred from W-09 review (check later)

- ~~W-10, security: `rungate=1` (Q68(b)) is a plain query flag~~ Resolved after W-10: `flow/runGateToken` one-time sessionStorage token, Q68(b) updated. Original note: that anyone can forge. A crafted `/ee/et/?plan=premium&rungate=1` sent to an identified user, with reviewStep off, would run the Gate and create an order with no click (04 inv 1). Fix: before the callback's `location.replace`, write a one-time sessionStorage token `nl_run_gate=<planKey>`. Plans runs the Gate only when the marker and the token match the same plan, then clears both. If the token is missing or doesn't match, show Plans. Update the Q68(b) wording.
- Test gap: `ALL_EVENTS` (`machine.test.ts`) has no `eidAbandoned` (`plans`/`failed`), so the sweeps over all events skip it. The test "StartingEid never emits an effect" only asserts "no redirect"; tighten it to `effects` `toEqual([])`.
- W-11/W-12: no effect signals StartingEid now. Any page that can reach it (CreatingOrder 401, IdentityLost Verify) must render `EidScreen`/`StartEid` with the right `redirect` prop (`machine.ts:109`).

### Deferred from W-10 review (check later)

- Still open from the W-07 note above: `flow/notice/notice.ts:19` calls `replaceState(window.history.state, …)`, the form that note warns against.
- A11y: the same Gate error twice gets no refocus and no announcement: the `alert` text doesn't change, so focus stays on Try again. Fix: refocus when busy ends (`RetryPoint.tsx` focus effect: add `!busy` and `busy` to deps).
- A11y/bug: "Check again" has no in-flight guard. Two clicks send two GETs, with no busy text and no live region message (08 l.82). Use the same busy pattern as Try again.
- CLS (08): the retry banner first appears only after `/v1/me` resolves (Entry → Plans), so it shifts the cards. Render the URL notice from the first client render, or reserve a slot.
- Design: the URL notice is owned by `RetryPoint` state, not the machine. The rule "no Try again on `plan_unavailable`" sits in the UI, not the `tryAgain` guard. `lastPlansView` (`PlansController.tsx:90-91`) is a copy of state; the Gate state could carry the retry view instead.
- Q70(a): the `chosenPlanId()` URL fallback goes through `parseFlowParams`, so it needs `?market` and `?locale`, while rungate reads `?plan=` directly. Use one helper, or change the Q70 wording.
- Test gap: Resume "Check status" isn't tested through the controller. Add a PlansPage test asserting PaymentReturn and `fetchOrder('o1')`. Also add a test that a card Select (not only Try again) picks up an open order written by another tab.
- `api/order/order.ts` copies `orderResponseSchema` (`api/schemas/schemas.ts`), so the two can drift. Point one at the other, or move `schemas.ts` to `zod/mini`.
- Nits: rename `runGateEffect` (it also runs Entry/Verifying `fetchMe` and `clearOpenOrder`; e.g. `runFlowIoEffect`) and drop its unused boolean return. `role="alert"` plus focus may make a banner read twice. Rename `Storage_` to `KeyValueStorage`.
- i18n: the et/lv/lt `retry.*` strings are AI translations and need a native check.
- Assumed: "preselected" means the banner plus the plan title and Try again above the cards; the cards aren't marked (Q70). Gate paid → Confirmed doesn't clear the open order (W-12 `purchase` step).

### Deferred from W-11 review (check later)

- W-12 must build `/payment/return/`: Review's Gate → Confirmed / IdentityLost and Resume "Check status" go there (04 Review row) and 404 until then.
- Design: `Review.tsx` is too big and repeats PlansController (gateDeps, `run`, `lastView` mirror, retry-focus state). Extract a `useReviewFlow` hook or controller.
- Design: bfcache restore sets state directly (`Review.tsx` `reviewState(ctx)`, `PlansController.tsx` reset to Plans), bypassing the machine. Model it as a machine event (`restored`).
- A11y (08 in-flight buttons): Pay is `aria-disabled` but keeps its label; busy text lives only in the live region. Show visible busy text or swap the label (check with Legal).
- Q69 gap: Pay → 401 → eID → browser Back restores to Plans, not Review (`useEidRestore(store, 'plans')`). Add the Review case to Q69/Q72 or restore to Review.
- A11y (08 l.74): after a bfcache restore, focus doesn't move to the `<h1>`.
- A11y (axe `region`): the `RetryPoint` banner sits outside `<main>` on Review and Plans.
- Test gap: `PlansPage.test.tsx` cards use `id_*` plan ids, so the Plans → Review navigate test can't assert `?plan=`. Use `planIdFor(planKey)` in the fixture.
- i18n: `review.consent` is placeholder wording for Legal; et/lv/lt `review.*` are AI translations and need a native check.

### Deferred from W-12 review (check later)

- Consent-pending `purchase` on Confirmed reload: Q75 (no snapshot + consent not `granted` → no `purchase`, guard rule unchanged). Build it in `confirmOrder`; add `pending` reload and no-snapshot cases to `Confirmed.test.tsx`.
- A11y/bug: Unconfirmed "Check again" has no in-flight guard: two clicks send two GETs. No busy text, no live region, and a 5xx or `pending` reply leaves the screen unchanged (08). Use the busy pattern and add a `LiveRegion` ("Checking…" / "Connection issue").
- Inv 6: a bfcache restore on Polling/Unconfirmed re-runs nothing (`PaymentReturn.tsx`). Back from `actionUrl` resumes a frozen poller with a stale `startedAt` and `redirectedThisCycle` still true. Fix: on `pageshow.persisted` in a non-eID state, stop the poller and `begin` again.
- A11y (08 redirect rule): the `actionUrl` redirect is instant, with no "Opening…" announcement and no 300 ms minimum. Reuse the redirect timing, or add a Q saying it doesn't apply without a click.
- Test gap: no unit tests for `flow/orderPoller` and `flow/confirmOrder` (Q74(c) `/v1/plans` fails → no event, `alreadySent`, open order with another id, poller stopped inside `onOrder`). No `exitUrl.test.ts` rows for the Plans retry branch (payment notice keeps `plan`; none/`plan_unavailable` drops it).
- i18n: Confirmed shows the raw plan id (`plan_std_m`) when no CMS title is known. Hide the plan line instead, and update Q74(d).
- Design: `PaymentReturn.tsx` (263 lines) mixes page host, effect runner, exits and rendering. `getMe` is a fake reject dependency (line ~129); EXIT_STATES runs only `clearOpenOrder` by hand, so new effects would be skipped. Extract `usePaymentFlow` and split `runGateEffect` so this page needs no `getMe`.
- Machine (W-04): PaymentReturn sends any GET error (401/404 included) to Polling, so IdentityLost and OrderNotFound show only after the first poll (2 s).
- `spec/03`: move Q74 from P3 to P1.
- Nits:
  - `isPaymentNotice(notice?: string)` should take `Notice`.
  - `paymentTestKit.tsx` fixture has `trial: 'true'` with `value: 11.15`; 07 says value 0 with a trial.
  - `api/order/order.ts`: `actionUrl` is a plain `z.string()` passed to `location.assign`; allow only https.
  - On a flaky network the live region flips between "Connection issue" and "Confirming…" every poll; keep "Connection issue" until 2 polls in a row succeed.
  - 04: a poll `failed` is "declined" even with `cancelled=1` in the URL; consider a Q.
  - `setCommonSource` is never reset on unmount.
  - `en` "Order id:" should read "Order ID:".
  - `Polling.test.tsx` "Back to plans" checks only that a navigation happened, not where it went.
- i18n: the et/lv/lt `payment.*` strings are AI translations and need a native check.

Record every cut in README "What I cut".
