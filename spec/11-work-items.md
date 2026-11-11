# 11 · Work items

One item = one AI session (~20–30 min). Do them in order; an item starts only when its "Depends" are green. Meet the AC, nothing more (CLAUDE.md). Slice scope = PLAN.md phase 2 and 09 **Slice**, plus analytics and UTM carry (07).

AC format: a command that exits 0, or a test as `file › test name` that passes in `cd app && npm test`. Paths are under `app/src/` unless stated. Section refs: `04 States` = `spec/04-…` § States.

Tags: `slice` = build now. `post-slice` = spec only, see *Not in slice*.

### W-01 · Scaffold + quality gates · `slice`
- **Goal**: Next static export app with lint, typecheck, unit and E2E runners wired.
- **Read**: CLAUDE.md Stack/Commands · 08 Checks · 09 E2E setup · 10 Config and flags (keys only) · **Touches**: `app/` (config files), `src/config.ts`, `e2e/smoke.spec.ts` · **Depends**: —
- **AC**:
  - `cd app && npm run lint && npm run typecheck && npm test && npm run build` exit 0; `test -f app/out/index.html`
  - `cd app && npx eslint --print-config src/app/layout.tsx | grep -q jsx-no-literals`
  - `config.test.ts › defaults: reviewStep on, market.LV off` · `› rejects missing API_BASE`
  - `cd app && npm run e2e` runs `smoke.spec.ts` (mock + app via `webServer`, `workers: 1`, axe on `/`) green
  - First Load JS of `/` from `next build` written in the commit message (08 Performance baseline)

### W-02 · Domain: money, plans, markets · `slice`
- **Goal**: Pure modules for price, planKey map, trial rule, market/locale pairs.
- **Read**: 05 §1 Price · 06 planKey ↔ planId · 08 Formatting, Routes, Fallback · Q2, Q11, Q12, Q14, Q48 · **Touches**: `src/domain/` · **Depends**: W-01
- **AC**:
  - `money.test.ts › gross 899 @ 0.24 = 1115` · `› gross 1299 @ 0.21 = 1572` · `› formats per locale (et, lv, lt, en)`
  - `locale.test.ts › en maps to en-150, others unchanged`
  - `plans.test.ts › planKey ↔ planId both ways` · `› unknown key/id → undefined` · `› trial only standard/premium and only if trialEligible`
  - `markets.test.ts › resolvePair` one case per 08 Fallback row (uppercase, unknown locale, unknown market, LV off) · `› pickRootPair from navigator.languages, default ee/et`

### W-03 · HTTP adapter + error model · `slice`
- **Goal**: Typed API client (Zod) and one `toApiError` → `{status, code, message, retryAfterSec?, kind}`.
- **Read**: 05 Transport, §1–5, Normalized error model · Q18, Q35, Q42, Q43 · **Touches**: `src/api/` · **Depends**: W-01
- **AC**:
  - `client.test.ts › every request sends credentials: include and JSON content-type` · `› any 2xx parses as success`
  - `schemas.test.ts › parses mock sample body per endpoint` · `› rejects drift (missing field, wrong type)`
  - `errors.test.ts › {errors[]} → first entry` · `› {error} / non-JSON / empty → code from status` · `› fetch reject → status 0 network` · `› Retry-After parsed, else 30`
  - `errors.test.ts › kind` one `test.each` row per row of the 05 kind table · `› no kind is paymentFailed`

### W-04 · State machine + table-driven tests · `slice`
- **Goal**: Pure reducer `(state, event) → {state, effects}` for every 04 state and the lean Gate (04 *Slice*), held in a Zustand store.
- **Read**: 04 (all) · 05 kind table · 09 Unit: state machine · **Touches**: `src/flow/machine.ts`, `src/flow/store.ts` · **Depends**: W-03
- **AC**:
  - `machine.test.ts › exits` `test.each` written by hand from every 04 States row, plus Gate steps 1 and 3 (step 2 is post-slice, 04 *Slice*)
  - `machine.test.ts › reviewStep off: Verifying 200 → Gate` · `› identified select → Gate` · `› retry point = Plans` (Q32, Q38)
  - `machine.test.ts › Resume offers only checkStatus` (04 *Slice*)
  - `machine.test.ts › inv1 only Pay / Try again emit createOrder` · `› inv3 no error kind reaches PaymentFailed` · `› inv4 every non-terminal state has an exit` · `› cancelled=1 loses to server paid/pending`
  - `store.test.ts › dispatch applies reducer and exposes effects`

### W-05 · Flow context storage + UTM · `slice`
- **Goal**: Build/parse flow context and UTMs in `returnUrl`, sessionStorage convenience copy, trust order.
- **Read**: 04 Invariants 2, 5 · 05 §2 eID return, §4 Payment return · 07 UTM capture and storage · Q7 · **Touches**: `src/flow/context.ts`, `src/flow/utm.ts` · **Depends**: W-02
- **AC**:
  - `context.test.ts › returnUrl round trip: plan, market, locale` for `/auth/callback` and `/payment/return` · `› orderId round trip on /auth/callback` (IdentityLost reverify)
  - `context.test.ts › stored beats query` · `› query used only when nothing stored` · `› invalid query pair rejected via resolvePair` · `› storage throwing → still resolves from query`
  - `utm.test.ts › last landing with utm_* replaces set` · `› persisted only when canPersist` · `› truncated to 100 chars`

### W-06 · Analytics · `slice`
- **Goal**: GTM loader with Consent Mode default, `analytics.ts` `track()` with typed six events, common params, once-rules, consent adapter (`pending`, Q53).
- **Read**: 07 (all) · Q5, Q20, Q46, Q53 · **Touches**: `src/analytics/`, call sites in screens from W-08, W-09, W-11, W-12 · **Depends**: W-04, W-05
- **AC**:
  - `analytics.test.ts › params per event` (one row per 07 Events row) · `› param whitelist, no personal data`
  - `analytics.test.ts › purchase once per orderId via localStorage guard` · `› plan_viewed not on bfcache restore`
  - `analytics.test.ts › before consent queued; granted flushes; denied drops` · `› redirect waits for eventCallback, 300–500 ms`
  - `analytics.types.test-d.ts › unknown event is a type error` (`@ts-expect-error`, passes `npm run typecheck`)
  - `Gtm.test.tsx › consent default (all denied) pushed before GTM script` · `› GTM script afterInteractive only when NEXT_PUBLIC_GTM_ID set`
  - `consent.test.ts › slice adapter returns pending` · `› subscribers notified on update`

### W-07 · App shell, routes, i18n, language switcher · `slice`
- **Goal**: Static routes for enabled pairs, per-locale catalogs, `<html lang>`, root redirect, switcher, shared a11y helpers.
- **Read**: 08 i18n and URLs, String ownership, Formatting (plurals), Accessibility (focus, live region) · Q14, Q24, Q48 · **Touches**: `src/app/` (layouts, `[market]/[locale]/`, `/`), `src/i18n/`, `src/components/` (LiveRegion, focus helper, LanguageSwitcher) · **Depends**: W-01, W-02
- **AC**:
  - `cd app && npm run build && ls out/ee/et out/ee/en out/lt/lt out/lt/en && test ! -e out/lv`
  - `grep -q '<html lang="et"' app/out/ee/et/index.html && grep -q '<html lang="en"' app/out/lt/en/index.html`
  - `messages.test.ts › all catalogs share keys` · `› no empty value`
  - `plural.test.ts › lt and lv for 0, 1, 2, 5, 11, 21`
  - `LanguageSwitcher.test.tsx › links to other locale in same market` · `› current locale has aria-current`
  - `RootRedirect.test.tsx › navigates to pickRootPair result`
  - `LiveRegion.test.tsx › announces only when text changes` · `focus.test.tsx › moves focus to h1 on step change`

### W-08 · Plan page · `slice`
- **Goal**: Plans from CMS + API at build, merged and validated; Entry `/v1/me` after hydration.
- **Read**: 06 (all) · 04 Entry, Plans, Shortcuts, *Trial* · 08 Accessibility (Plans row), What Plans may wait for · Q8, Q10, Q12, Q13, Q32, Q44, Q45 · **Touches**: `src/cms/parsePlanPage.ts`, `src/app/[market]/[locale]/page.tsx`, `src/components/PlanCard.tsx` · **Depends**: W-02, W-03, W-04, W-06, W-07
- **AC**:
  - `parsePlanPage.test.ts › outcome per fixture` one row per 06 *Outcome per fixture* cell (6 fixtures × LV on/off)
  - `parsePlanPage.test.ts › card merge rules 1–6` · `› legalText non-paragraph skipped + warning`
  - `cd app && npm run build && grep -q '11,15' out/ee/et/index.html && ! grep -q '10,99' out/ee/et/index.html` (API price baked in, `priceLabel` never rendered)
  - `PlanCard.test.tsx › price is one text node` · `› button name includes plan title` · `› is an article with title heading`
  - `PlanCard.test.tsx › trial line on standard/premium, none on basic` · `› identified + not trialEligible → visibility hidden, space kept` · `PlansPage.test.tsx › trial line rendered before /v1/me resolves` (in the static HTML)
  - `PlansPage.test.tsx › /v1/me activeSubscription → ACCOUNT_URL` · `› 401/5xx → anonymous, select → StartingEid` · `› identified select → Review` · `› reviewStep off: identified select → Gate`
  - `PlansPage.test.tsx › plan_viewed once after /v1/me resolves` · `› plan_selected on every select`

### W-09 · eID start + callback · `slice`
- **Goal**: StartingEid, RateLimited, StartError, `/auth/callback`, EidFailed, Verifying, VerifyError, OtherBrowser.
- **Read**: 04 StartingEid → OtherBrowser rows, Shortcuts · 05 §2, §3, kind table · 08 Accessibility (redirect, countdown) · Q7, Q17, Q35, Q36 · **Touches**: `src/app/auth/callback/`, `src/components/eid/` · **Depends**: W-04, W-05, W-07, W-08
- **AC**:
  - `StartEid.test.tsx › POST body has returnUrl with plan, market, locale` · `› 201 → redirect to redirectUrl after ≥ 300 ms with "Opening …" announced` · `› 429 → RateLimited` · `› 400/5xx/network → StartError; Try again → StartingEid, Change plan → Plans`
  - `RateLimited.test.tsx › countdown from Retry-After, Try again enabled at 0 (fake timers)` · `› live region gets 2 messages`
  - `AuthCallback.test.tsx › cancelled → EidFailed(cancelled)` · `› expired/missing/unknown → EidFailed(expired)` · `› exits use history.replaceState`
  - `AuthCallback.test.tsx › ok + /v1/me 200 → Review with context plan` · `› reviewStep off: ok + 200 → Gate` · `› ok + activeSubscription → ACCOUNT_URL` · `› ok + orderId in context → PaymentReturn for that order` · `› lang set from context before first text`
  - `AuthCallback.test.tsx › /v1/me 401 → OtherBrowser; Start again here keeps the query plan` · `› /v1/me 5xx/network → VerifyError; Try again → Verifying, Start again → StartingEid`
  - `StartEid.test.tsx › identity_started on 201 only` · `AuthCallback.test.tsx › identity_completed only after /v1/me 200`
  - `EidFailed.test.tsx › Try again restarts eID with same context` · `› Change plan → Plans`

### W-10 · Open order + lean Gate + retry point · `slice`
- **Goal**: Open order in `localStorage`, Gate steps 1 and 3, Resume with "Check status" only, retry point for both `reviewStep` arms with `?notice=` banners.
- **Read**: 04 Terms, Gate, *Slice*, Invariant 1 · 05 kind table (Gate rows) · Q30, Q37, Q38 · **Touches**: `src/flow/openOrder.ts`, `src/flow/gate.ts`, `src/components/RetryPoint.tsx`, `src/app/[market]/[locale]/page.tsx` (retry point when `reviewStep` off) · **Depends**: W-03, W-04, W-07, W-08
- **AC**:
  - `openOrder.test.ts › save, read, clear in localStorage` · `› written by one store instance, read by another (second tab)` · `› storage throwing → treated as no open order`
  - `gate.test.ts › step 1: pending/requires_action → Resume, no POST` · `› paid → Confirmed` · `› failed/404 → cleared, continue` · `› 401 → IdentityLost` · `› 5xx/network → retry point error, no POST`
  - `gate.test.ts › step 3: activeSubscription → Account` · `› 401 → StartingEid, context kept` · `› 5xx/network → retry point error, no POST` · `› 200 → CreatingOrder`
  - `RetryPoint.test.tsx › Resume shows only Check status → PaymentReturn` · `› ?notice= banner gets focus, param removed via history.replaceState` · `› unknown notice → no banner`
  - `PlansPage.test.tsx › reviewStep off: retry point shows the chosen plan preselected + banner; Try again → Gate`

### W-11 · Review + order creation · `slice`
- **Goal**: Review (`reviewStep` on) with binding price and trial note; Pay → Gate; CreatingOrder → payment redirect.
- **Read**: 04 Review, CreatingOrder, *Slice*, *Trial*, *Review consent*, Invariants 1, 6 · 05 §4 · 06 legalText · 07 *`purchase` params* · 08 Accessibility (errors, in-flight buttons) · Q1, Q3, Q12, Q19, Q23, Q32 · **Touches**: `src/app/[market]/[locale]/review/`, `src/flow/createOrder.ts`, `src/components/review/` · **Depends**: W-04, W-05, W-09, W-10
- **AC**:
  - `Review.test.tsx › refetches /v1/plans, shows API price` · `› plan missing from API → Plans + notice=plan_unavailable`
  - `Review.test.tsx › trial note on standard/premium when trialEligible` · `› none on basic or when not eligible`
  - `Review.test.tsx › consent checkbox unchecked on show, label from catalog` · `› Pay button reads "Order with obligation to pay" (catalog key)`
  - `Review.test.tsx › Pay without consent → aria-invalid + aria-describedby, focus to checkbox, no Gate` · `› Pay runs the Gate, never POSTs directly` · `› two clicks → one POST, focus unchanged`
  - `Review.test.tsx › pageshow persisted re-enables Pay and unchecks consent` (inv. 6)
  - `createOrder.test.ts › body = {planId, market (uppercase), returnUrl}` · `› no attempt marker written` (04 *Slice*) · `› 201 → redirect to paymentUrl` · `› 409 already_subscribed → Account` · `› 401 → StartingEid` · `› invalid_plan → Plans + notice=plan_unavailable` · `› 5xx → focused error banner`
  - `createOrder.test.ts › payment_started on 201` · `› open order saved with orderId, paymentUrl, plan, market, locale and price, tax, currency, trial snapshot`

### W-12 · Payment return + polling · `slice`
- **Goal**: `/payment/return`, Polling per Q9, Confirmed, PaymentFailed (cancelled, declined), `requires_action`, Unconfirmed, IdentityLost, OrderNotFound.
- **Read**: 04 Terms (open order, retry point), PaymentReturn → Confirmed rows · 05 §4 Payment return, §5 · 07 *`purchase` params* · 09 Unit: polling · Q9, Q31, Q33 · **Touches**: `src/app/payment/return/`, `src/flow/pollSchedule.ts`, `src/components/payment/` · **Depends**: W-04, W-05, W-07, W-10, W-11
- **AC**:
  - `pollSchedule.test.ts › 2 s until 20 s, then 5 s, stop at 180 s`
  - `Polling.test.tsx (fake timers) › "Still confirming" at 20 s` · `› 5xx keeps polling, "Connection issue"` · `› requires_action → actionUrl once per cycle` · `› live region changes only on status change`
  - `Polling.test.tsx › 180 s → Unconfirmed with order id; Check again = one GET` · `› 401 → IdentityLost; Verify → StartingEid with orderId in returnUrl` · `› 404 → OrderNotFound, open order cleared`
  - `PaymentReturn.test.tsx › orderId from open order beats URL` · `› paid → Confirmed` · `› failed + cancelled=1 → PaymentFailed(cancelled)` · `› failed → PaymentFailed(declined)` · `› other → Polling`
  - `PaymentFailed.test.tsx › clears open order, goes to retry point with notice=payment_cancelled|payment_declined (Review, or Plans when reviewStep off)` · `› Try again → Gate → new order`
  - `Confirmed.test.tsx › shows order id, plan, trial note from open order` · `› purchase once per orderId, params from snapshot` · `› reload → no second purchase`

### W-13 · E2E matrix + axe · `slice`
- **Goal**: Playwright rows marked `S` in 09, axe on every screen they reach.
- **Read**: 09 Scenario matrix (`S` rows), E2E setup · 08 Checks (axe tags) · **Touches**: `app/e2e/` · **Depends**: W-08 – W-12
- **AC**:
  - `cd app && npm run e2e` green: `happy.spec.ts › anonymous full path`, `payment-declined.spec.ts › retry creates second order`, `payment-slow.spec.ts › still confirming then confirmed`, `utm.spec.ts › utm_* + plan, market, locale in both returnUrl bodies`
  - Each spec: zero axe violations per screen (08 tags), unique `document.title` along the path, order count from `/__mock/state`
  - `! grep -rq waitForTimeout app/e2e`

## Not in slice

Spec-only features. Each becomes its own item when picked up.

| Feature | Spec |
|---|---|
| Gate step 2 (attempt marker), Resume "Continue payment", Resume display on Plans/Review enter | 04 *Slice*, Q30, Q39 |
| 404 page + client fallback redirects, fallback e2e on built `out/` | 08 Fallback |
| LV pages (`market.LV` on), disabled-market screens | 06, 10, Q52 |
| Runtime flags (`CONFIG_URL`), Review experiment, `checkout.paused`, error tracking | 10, Q49, Q50 |
| E2E rows `U·n` and `n`; keyboard-only, 44 px, focus outline, 320 px reflow, reduced motion e2e | 08, 09 |
| Lighthouse CI + JS budget build script | 08 Performance |
