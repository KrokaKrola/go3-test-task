# 09 · Test strategy

What each test level proves, where each mock scenario is tested, how E2E runs. States: 04. Error kinds: 05. Events: 07. Check names (unit, e2e, axe): 08. Q-numbers: 03.

**Slice** = the items tagged `slice` in 11: every 04 state, both `reviewStep` arms (off: retry point on Plans, Q38), the open order and the lean Gate (04 *Slice*), analytics events and UTM carry (07). Not in the slice: the parts 04 *Slice* lists (Gate step 2, Resume "Continue payment", display checks on enter, disabled market). E2E per state follows the cut order below.

## Levels

| Level | Tool | Proves | Runs in |
|---|---|---|---|
| Unit: domain | Vitest | Price (Q2) per locale, planKey map (Q11), trial rule (Q12), `resolvePair`, plurals and tags (08), catalogs share keys | `npm test`, every commit |
| Unit: state machine | Vitest `test.each` | One case per exit in 04 States and Gate: (state, event) → next state + effects. Invariants as their own cases: only Pay / Try again creates an order (1); stored context beats a conflicting query, query used only when nothing is stored, `cancelled=1` loses to server `paid`/`pending` (2); no error kind leads to PaymentFailed (3); every non-terminal state has an exit (4) | same. Slice states in the slice, the rest post-slice |
| Unit: adapters | Vitest | `toApiError`: both shapes, non-JSON, network, `Retry-After` + 30 s fallback; one case per row of the 05 kind table. Zod schemas parse sample bodies copied from 05/mock and `fixtures/cms/`, reject drift. `returnUrl` build ↔ parse round trip: plan, market, locale, `utm_*`, `orderId` (inv. 5) | same |
| Unit: polling | Vitest fake timers | 2 s → 20 s → 5 s → 3 min (Q9), "Still confirming" at 20 s, Unconfirmed at 3 min, 5xx keeps polling, `requires_action` redirects once per cycle | same |
| Unit: analytics | Vitest | Params per event, whitelist, once-rules, consent gate for `pending`/`granted`/`denied` (07, Q53) | same |
| Component | Vitest + Testing Library | Each 04 screen rendered from a state: focus on `<h1>`, live region text changes only on state change, in-flight button (two clicks → one request), buttons per state. Synthetic `pageshow` (persisted): on-enter runs again and disabled buttons are enabled again (inv. 6) | same as state machine |
| E2E | Playwright + `@axe-core/playwright` | Real redirects and cookies across ports, context from `returnUrl`, rehydration on reload and cross-origin return, one order per attempt, zero axe violations per screen reached | `npm run e2e`, before merge |
| Contract | — | Real API matches Zod schemas and 05 | later: no real API yet (Q6, Q43) |

- **State machine cases come from 04, not from the code.** The expected (state, event → next) list is written by hand from 04, and the machine is what's tested. Cases generated from the machine's own table would test nothing.
- **E2E doesn't catch every rehydration bug.** It covers reload and return from a provider. Playwright may not hit bfcache (08), so Back-restore = component `pageshow` case + manual.
- **`MOCK_TIME_SCALE` speeds up the mock, not the app.** Poll thresholds and the `Retry-After` countdown are app timers: fake timers in unit, `page.clock` in E2E.

## Scenario matrix

**Cut order**: `S` = unit + E2E in the slice, never cut. `U·n` = unit in the slice, E2E post-slice. `n` = whole row post-slice. `U` / `P` = unit only, in / after the slice. E2E `1` is dropped first (PLAN cut list first, then lowest risk). Negative asserts ("absent", "no …") run only after the positive anchor named first in the cell.

| Scenario | Variant | Level | Asserts | Cut order |
|---|---|---|---|---|
| `happy` | Anonymous, full path | E2E | Plans → eID → Review (trial note on Standard) → pay → Confirmed with order id; then exactly one order in `/__mock/state`. axe on each screen, unique `document.title` | S |
| `happy` | Back after eID callback | E2E | Review visible → `goBack()` → URL is not `/auth/callback` (04 `history.replace`) | 6 |
| `happy` | Stored context vs tampered query | E2E | Return URL with another plan/market → Review shows the stored plan and market | U·13 |
| `happy` | Storage cleared before return | E2E | Plan, market, locale, `lang` from the `returnUrl` query (inv. 2, 5) | U·14 |
| `happy` | `cancelled=1` on a paid order | E2E | Open `/payment/return?orderId={paid}&cancelled=1` → Confirmed, no failure banner | U·12 |
| `happy` | Callback in a new context (no cookie) | E2E | `/auth/callback?status=ok&…` → OtherBrowser; "Start again here" keeps the query's plan | 15 |
| `happy` | Cookie cleared before payment return | E2E | IdentityLost with order id → Verify: eID `returnUrl` carries `orderId` → PaymentReturn → OrderNotFound (mock: new customer, 04); order count still 1 | 16 |
| `happy` | Back from pay page to Review | E2E | "Continue payment" visible and reuses `paymentUrl` → Pay absent → order count still 1 | 17 |
| `happy` | Cancel on pay page | E2E | PaymentFailed(cancelled) banner → Try again → second pay page with a new orderId, order count 2 | 9 |
| `happy` | Reload on Confirmed | E2E | Order id visible again → no trial note, order count still 1 | U·8 |
| `happy` | Landing with `utm_*` | E2E | `utm_*` + plan, market, locale in both `returnUrl` request bodies (`page.waitForRequest`) | S |
| `happy` | Double tap on Pay | unit, component | Two clicks → one request, focus unchanged | U |
| `happy` | Second tab | unit | Open order `pending` in `localStorage` → Pay → Gate step 1 → Resume ("Check status" only), no `POST /v1/orders` | U |
| `happy` | `reviewStep` off | unit | Verifying 200 → Gate → CreatingOrder; decline → Plans with the plan preselected + `payment_declined` banner | U |
| `happy` | Reload in CreatingOrder | unit | Marker → "last attempt didn't finish" | P |
| `payment_declined` | — | E2E | Polling → PaymentFailed(declined) at retry point → Try again → second pay page with a new orderId, order count 2 | S |
| `identity_cancelled` | — | unit, E2E | EidFailed(cancelled); Try again → new eID session, plan kept | U·4 |
| `identity_cancelled` | Expired: reopen used `/mock-eid/{id}/complete` | unit, E2E | EidFailed(expired); missing/unknown `status` → expired (unit only) | U·4 |
| `identity_slow` | — | E2E | Same as `happy` full path | 2 |
| `rate_limited` | — | unit, E2E | RateLimited, countdown from `Retry-After: 30`; live region gets 2 messages; Try again enabled after `runFor(30_000)` | U·5 |
| `already_subscribed` | Anonymous, after eID | unit, E2E | Verifying → `ACCOUNT_URL` (stubbed with `page.route`) | U·10 |
| `already_subscribed` | Identified at Entry; 409 on order | unit, E2E | Entry → Account (cookie switched after eID); 409 → Account (unit only) | U·10 |
| `not_trial_eligible` | — | unit, E2E | Review full price visible → no trial note on Standard | U·3 |
| `payment_slow` | — | unit, E2E | Polling reached (status in live region) → "Still confirming" after `runFor(20_000)` → Confirmed | S |
| `payment_requires_action` | Approve | E2E | Challenge → Approve → Confirmed | U·1 |
| `payment_requires_action` | Leave challenge, open return URL | unit, E2E | Polling sees `requires_action` → one redirect to `actionUrl` → Fail → PaymentFailed(declined) | U·1 |
| `api_500` | Anonymous | unit, E2E | Plans + prices visible (build data); Entry → anonymous; StartingEid → StartError with Try again | 11 |
| `api_500` | Gate, cookie switched on Review | unit, E2E | Pay → retry point error visible → no `POST /v1/orders` request sent (Gate step 3 `/v1/me` 500) | 18 |
| `api_500` | Polling: `happy` order, cookie switched before return | unit, E2E | "Connection issue" visible → Unconfirmed after `runFor(180_000)` with order id → no PaymentFailed (inv. 3) | 19 |

## E2E setup

- **Ports.** Mock `http://localhost:4010`, app `http://localhost:3000`. Always `localhost`, because cookies are shared across ports only there. The mock's default `WEB_ORIGIN` is the app origin.
- **Servers.** Playwright `webServer`: mock (`MOCK_TIME_SCALE=50`) first, then the app, since the build reads `/v1/plans` (Q23). Slice: `next dev`. Post-slice: built `out/` behind a static server (08 fallback).
- **Serial.** `workers: 1`. The mock keeps all state in one in-memory store, so a parallel test's reset would wipe another test's orders.
- **Reset.** `POST /__mock/reset` in `beforeEach` via Playwright `request`. Each test gets a fresh browser context, so no storage or cookies carry over.
- **Scenario.** `context.addCookies([{ name: 'nl_scenario', value, domain: 'localhost', path: '/' }])` before the first navigation. It reaches app fetches and provider pages; the mock pins the scenario to each eID session and order at creation. Switching mid-test = add the cookie again. The app never sends `x-scenario`.
- **Clock.** `page.clock.install()` then `page.clock.pauseAt(now + 1 s)` before the first navigation in every test (install alone lets time flow). Provider pages auto-continue after 30 ms at scale 50, which would beat a click, so their timers stay frozen and tests click the provider buttons. App timers advance with `runFor`: one call after the response that schedules a redirect (a second one on the provider page fires its timer). axe schedules its own timers: `clock.resume()` before `analyze()`, `pauseAt` after. Mock settle delays run on server time: wait for them in an `expect.poll` that calls `runFor(5_000)` per try.
- **No sleeps.** No `waitForTimeout`. Wait on `waitForURL` and web-first assertions (`toHaveText`, `toBeVisible`, live region text).
- **Not scaled by the mock**: eID TTL 5 min and session 1 h. Expiry is simulated by reusing a completed eID session or `context.clearCookies()`.
- **Order count**: `GET /__mock/state`, read only after the anchor in the row (Confirmed, Resume, second pay page).
- **axe**: `AxeBuilder` with the 08 tags once each screen settles (after `<h1>` has focus). **On failure**: trace and screenshot kept.

## Not tested, and why

| What | Why | Instead |
|---|---|---|
| Real API, eID, payment | Not available; the mock is the assumed contract (Q6) | Contract tests later |
| bfcache restore in E2E | Playwright may not restore from bfcache | Component `pageshow` case, manual (08) |
| A real second browser / app switch | Can't be driven from one Playwright context | New context, cleared storage or cookies |
| Wall-clock eID / session expiry | Mock doesn't scale them | Reused session, cleared cookie |
| Network loss on `POST /v1/orders` (Q34) | Mock can't drop a response | Unit with a rejecting fetch |
| Two tabs POSTing in the same instant | Unpreventable without `Idempotency-Key` (Q19) | Unit: Gate reads shared storage |
| LV pages | `market.LV` off (Q13) | Build check (08), post-slice |
| GA4 delivery, GTM, CMP | No GTM or CMP in the slice (Q53); delivery only visible in GA | Unit on `analytics.ts`; DebugView manual |
| Lighthouse, screen readers, non-text contrast | Post-slice or not automatable | 08 checks |
| Visual regression | No design baseline | — |
