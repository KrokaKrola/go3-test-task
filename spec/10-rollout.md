# 10 · Rollout and monitoring

Config, flags, launch stages, alerts and rollback. States refer to `04-user-flow-state-machine.md`, events to `07-analytics.md`, Q-numbers to `03-open-questions.md`. Thresholds are proposals [A]; each owner confirms before stage 2.

## Principles

- **Revenue truth is the backend.** Paid orders come from backend order data (05 request 16), never from GA `purchase`: it is consent-gated, blocked by ad blockers, missed when the user never returns, and can double-count across browsers (07 known gaps). GA is for the funnel shape only.
- **Rollback never strands a payment.** `/auth/callback`, `/payment/return`, Polling, Unconfirmed, IdentityLost, OtherBrowser and Confirmed ignore every flag and kill switch, and so does a re-verify eID start (orderId in context, 07 `eid_purpose: reverify`). "Check status" on an open order always works.
- **Builds are compatible both ways.** A user can leave on build N and return on N−1. `returnUrl` params and storage keys change additively only, and stay readable for two releases. Check: e2e returns with the previous release's `returnUrl` and storage fixtures.

## Config and flags

| Key | Default | Set at | Purpose |
|---|---|---|---|
| `API_BASE` | — | build | API origin (05) |
| `ACCOUNT_URL` | — | build | Redirect for active subscribers (Q10) |
| `market.LV` | off | build | Generates LV pages (06, 08). Off = LV paths → `/`; see *Disabled market* |
| `reviewStep` | on | build (slice), runtime (prod) | Review between eID and Gate (Q3, Q32). Prod: experiment arm, see below |
| `reviewStep.offShare` | 0 % | runtime | Share of bucketed browsers in the off arm. 0 = no experiment, everyone on |
| `checkout.paused.{EE,LT,LV}` | false | build default, runtime override | Kill switch per market: no new money movement |
| `CONFIG_URL` | — | build | Runtime flag source (prod only, Q49) |
| `GTM_ID` | — (unset = no GTM) | build | GTM container. Unset in local and E2E, so no tag loads; `track()` and the consent gate work the same (07, Q53) |

**Runtime flags** (static export, no server): JSON fetched from `CONFIG_URL` on Entry and again at the Gate, ≤ 60 s cache, 1.5 s timeout. Fetch fails → build defaults. Never blocks first paint.

**`checkout.paused`**: applies at StartingEid (checkout purpose only) and the Gate. The retry point shows "temporarily unavailable"; Select, Pay and Try again are disabled. Resume shows only "Check status", not "Continue payment", so no one pays while paused (wrong price, provider down).

**Review experiment (prod)** [A]:
- Unit = browser. Random bucket id in `localStorage`, hashed to an arm. Written only after analytics consent (Q50); no consent → arm on, not in the readout.
- Arm is carried in `returnUrl` (`rs`, Q7) and the open order snapshot, trust order as 04 invariant 2, so a return in another browser keeps it.
- Override: `offShare` 0 or config down → arm on at the next state show, even mid-flow (Review only adds a step). Orders past the Gate are unaffected. Overridden flows are excluded from the readout.
- Arm sent in `POST /v1/orders` like `market` (Q51), so backend paid orders join by arm. 07 `review_step` = this arm.
- Off arm starts only after Legal clears Q3/Q32: without Review, an anonymous user can't see trial vs full price before paying.

**Disabled market** (LV rolled back after launch, Q52): callbacks resolve locale against all known pairs, not only enabled ones, so LV users read `lv`. Where 04 would land on a retry point or Plans, they see "not available right now" with the order status. No Try again, no Change plan, no redirect into another market.

## Rollout stages

| # | Audience | Entry | Exit |
|---|---|---|---|
| 0 | Team, staging API + real provider sandboxes | Slice e2e green on mock (09). Answered: Q1, Q4, Q6, Q7 (or Security accepts), Q40 | Every 04 mock-scenario path reproduced on staging. Lighthouse and axe budgets pass (08) |
| 1 | Staff in prod, EE + LT, page not linked | Stage 0 exit. Q5 CMP live. Q10 `ACCOUNT_URL` set. Q49 config + error tracker live. Q51 metrics live. Alerts 1–8 test-fired | ≥ 10 real paid orders per market, each order id logged by staff with the screen they reached; Backend confirms all `paid`. Charged VAT and amount match the price shown (Q2, Q4). Refunds done |
| 2 | Public EE + LT, organic traffic only | Stage 1 exit. Owners confirmed thresholds. `et`, `lt`, `en` catalogs approved (Q48). Marketing confirms `priceLabel` unused (Q2). Product accepts Q15, Q16 | 7 days with no alert open > 1 h. No stranded order (pending > 24 h) |
| 3 | EE + LT, campaigns on | Stage 2 exit. Unwanted referrals set (Q47). GA4 custom dimensions registered (07) | 14 days stable. Baseline per market: backend paid / GA `plan_viewed`. Undercounted by consent and blockers, so only compared with itself over time |
| 4 | Review experiment, EE + LT | Stage 3 exit. Legal sign-off (Q3, Q32, Q50). Sample size fixed in advance | Sample reached or 4 weeks. Primary: backend paid / `plan_viewed` per arm (both arms consented, so comparable). Guardrails per arm from backend: `failed` / created, refunds. Loser → `offShare` 0 or 100 |
| 5 | LV public, `reviewStep` on, not in experiment | ≥ 1 month after stage 2 start (Brief). LV launch gate passed | As stage 2, for LV |

## LV launch gate

| Check | Owner |
|---|---|
| Backend charges LV VAT (21 %) from `market` in the order body; LV plan ids only (Q1) | Backend |
| Premium decision: hidden (API has 2 plans) or added to the API (Q8) | Product |
| LV CMS entries complete: `legalText`, FAQ, LV.lv Standard bullets; build with `market.LV` on passes (06, Q13) | Marketing |
| `lv` catalog translated and approved, incl. the disabled-market notice (Q48, Q52) | Marketing + Product |
| LV eID and payment methods work on staging; LV return URLs in the provider allowlist (Q6) | Backend |
| Stage 1-style staff purchase in LV with `market.LV` on in a preview build | Frontend |
| Alerts 1–8 split by market include LV | Frontend + Backend |

## Alerts

| # | Signal | Threshold | Owner |
|---|---|---|---|
| 1 | Backend: `paid / created` orders per market (05 req. 16) | < 70 % of 7-day same-hour baseline over 1 h | Backend |
| 2 | Backend: orders `pending` > 3 min (webhook lag, Q9) | > 5 % of orders in 15 min | Backend |
| 3 | API server: 5xx on `/v1/*`. Network, CORS and timeouts are in alert 6 | > 2 % of requests for 5 min | Backend |
| 4 | Backend: `POST /v1/identity/sessions` 429 + 5xx | > 5 % of starts for 10 min | Backend |
| 5 | Backend: customers with ≥ 2 orders in 10 min (Q19, Q37) | > 1 % of ordering customers per day | Frontend + Backend |
| 6 | Error tracker (Q49): uncaught errors, plus error-adapter kinds network, timeout and 5xx by endpoint. No personal data (07 list) | > 1 % of sessions for 15 min, or any new error after a deploy | Frontend |
| 7 | Synthetic, no session: `/payment/return?orderId=synthetic` renders IdentityLost; `/auth/callback?status=expired` renders EidFailed; each enabled pair renders its `headline` | Fails twice in a row (5 min interval) | Platform |
| 8 | Prod only: GA `purchase` / backend paid, per market per day | Ratio drops > 30 % vs 7-day mean (tracking broke, not sales) | Marketing |

## Rollback and kill switch

The provider page is outside our control; each row is what the user meets on return.

| Situation | Action | User returning from payment |
|---|---|---|
| Bad frontend deploy | CDN: restore previous build (atomic) | Lands on the old build; compatible params and storage (principles). Returned during the bad window → open order resumed at the next Gate |
| Payment or eID provider down (alerts 1–4) | `checkout.paused.{market}` on | Return, polling and re-verify work. Pending order: "Check status" only; Unconfirmed is the safe exit |
| Wrong price or VAT charged | `checkout.paused.{market}` on; Backend refunds the difference to the card (no email, Q15) | Payments already on the provider page complete at the wrong price; refunded. Fix, then restage that market from stage 1 |
| Review off arm hurts (guardrails) | `reviewStep.offShare` = 0 | Orders past the Gate unaffected. A failed payment lands on Review (arm overridden to on) |
| LV broken after launch | `checkout.paused.LV` on. Content or legal cause → rebuild with `market.LV` off | Callbacks still reach Confirmed in `lv`. Failures show the disabled-market notice, never EE pages |
| Bad CMS publish | Validation fails → previous build stays live (06). Passed but wrong → revert in CMS, rebuild | Confirmed shows the CMS plan title: wrong until the rebuild |
| Duplicate orders (alert 5) | Fix + redeploy (row 1); Backend refunds duplicates; push `Idempotency-Key` (Q19) | Not paused: the risk is a double charge until the fix ships |
| Config fetch down | Build defaults apply: arm on, not paused | Not affected. Kill switches off until config is back; urgent → rebuild with `checkout.paused` default on |
