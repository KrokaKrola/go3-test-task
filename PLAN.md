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
- `startEidSession` effect carries only `planId`. `returnUrl` also needs market, locale and `reverifyOrderId` (04 inv 5). Check when W-09 wires eID start.
- Stale results: `orderLoaded`/`orderFailed` carry no `orderId`, so a late result from another fetch (polling tick, double `retryCheck`) is accepted. Add `orderId` to these events and ignore mismatches. Check when the polling runner is built.

### Deferred from W-05 review (check later)

- `clearUtm` on consent withdrawal (07 "Withdrawal clears our keys"): build in W-06 with the consent adapter.

### Deferred from W-06 review (after basic flow works)

- Medium: bfcache flag `skipNextPlanViewed` (`analytics.ts`) is never cleared. Any `pageshow.persisted` (e.g. Review restored after Back from the payment provider) drops the next real `plan_viewed`, even after client nav to Plans. Fix: module flag `planViewedSent` (once per document load, which bfcache keeps), remove the `pageshow` listener, update Q62.
- `clearUtm` on consent `denied` (07 "Withdrawal clears our keys"): still not built. Subscribe to consent in the CMP bridge, or as a W-05 follow-up.

Record every cut in README "What I cut".
