# 05 · API contract

The API as the frontend uses it. It feeds the states in `04-user-flow-state-machine.md`. Q-numbers refer to `03-open-questions.md`.

Field marks: **[D]** in `docs/02-api-notes.md` · **[M]** mock only, an assumption until backend confirms (Q6) · **[R]** requested from backend, not in docs or mock · **[A]** set by the app itself (our own params, echoed back).

## Transport

- Base URL from config: prod `https://api.nordlight.example` [D], local `http://localhost:4010`. The app runs on another origin (`www` [D]), so prod needs CORS with credentials (Q40).
- Every fetch: `credentials: 'include'`, JSON body, `content-type: application/json`. Tests add `x-scenario` [M]. The mock's CORS allows no other request header.
- Session cookie `nl_session` [M] is HttpOnly on the API host. Only `GET /v1/me` tells us if the user is identified.
- Success codes are not in docs. Mock: 200 for GET, 201 for POST [M]. We treat any 2xx as success (Q43).

## 1. `GET /v1/plans?market=EE`

| | Docs | Mock | We read / send | Gap |
|---|---|---|---|---|
| Request | `market` query | `EE`/`LV`/`LT`, any case | `market` uppercase [D] | — |
| Response | `priceNet` cents, `vatRate` decimal, plan `id` | `{market, plans:[{id, name, priceNet, vatRate, currency}]}` | `plans[]` wrapper [M], `id` [D], `priceNet` [D], `vatRate` [D], `currency` [M]. `name` ignored (CMS has titles) | Wrapper (Q43) and `currency` (Q26) undocumented. No `planKey` (Q11), no `trialDays` (Q12) |
| Plan set | — | LV has no Premium | API decides which plans exist (Q8) | Brief says 3 plans in LV |
| Errors | — | 400 `{error}` for unknown market. Never 500, even in `api_500` | `error` [M] via adapter | Implies build-time fetch (Q23, Q29) |

Price: `Math.round(priceNet * (1 + vatRate))` cents, `Intl.NumberFormat` with `currency` (Q2).

## 2. `POST /v1/identity/sessions`

| | Docs | Mock | We read / send | Gap |
|---|---|---|---|---|
| Request | no body documented | optional `{returnUrl}`, origin allowlist, else 400 | `returnUrl` [M] = `/auth/callback` [D] + `plan`, `market`, `locale`, `utm_*`, `orderId?` [A] (Q7) | `returnUrl` undocumented (Q6). No `state` param (Q7) |
| Response | `redirectUrl` | 201 `{sessionId, redirectUrl}` | `redirectUrl` [D]. `sessionId` [M] ignored | — |
| Errors | `{error}`; 429 possible | 429 + `Retry-After: 30` (exposed via CORS), 500, 400 | `error` [D] via adapter. 429 → RateLimited. `Retry-After` [M], fallback 30 s (Q35) | `Retry-After` mock only |
| Lifetime | "sessions expire after 5 minutes" | eID session 5 min, single use | — | Ambiguous: eID or auth session (Q17) |

**eID return** `/auth/callback`: mock adds `status=ok|cancelled|expired` [M] to our `returnUrl`, keeping our params. We read `status` [M] and `plan`, `market`, `locale`, `utm_*`, `orderId?` [A]. Missing or unknown `status` = `expired` (Q36). `ok` is proven only by `GET /v1/me`.

## 3. `GET /v1/me`

| | Docs | Mock | We read / send | Gap |
|---|---|---|---|---|
| Response | `customerId`, `activeSubscription`, `trialEligible` | `activeSubscription`: `null` or `{planId, status, renewsAt}` [M] | `activeSubscription` [D], `null` = none [M]; `trialEligible` [D]. `customerId` unused | Shape and "none" value of `activeSubscription` undocumented (Q43). No name or email (Q15) |
| Errors | 401 if not identified | 401 `{error}`, 500 in `api_500` | `error` [M] via adapter | Error shape not documented (Q28) |
| Lifetime | — | auth cookie 1 h | — | Q17 |

## 4. `POST /v1/orders`

| | Docs | Mock | We read / send | Gap |
|---|---|---|---|---|
| Request | `{planId}` | `{planId, returnUrl?}`. Any known `planId` in any market. Extra fields ignored | `planId` [D], `market` [R] (Q1), `returnUrl` [M] = `/payment/return` [M] + `plan`, `market`, `locale`, `utm_*` [A] | **No market: VAT differs, launch blocker** (Q1). No `Idempotency-Key`; mock CORS rejects the header, so we don't send it (Q19, Q39) |
| Response | `orderId`, `paymentUrl` | 201, same | `orderId` [D], `paymentUrl` [D] | No amount, currency or trial flag (Q4) |
| Errors | `{errors:[{code, message}]}` | 401 `unauthenticated`, 400 `invalid_request`/`invalid_plan`, 409 `already_subscribed`, 500 `internal_error` | `errors[].code` [D], `.message` [D] via adapter; code values [M] | Codes and 409 mock only (Q18). No 409 for an open pending order (Q37) |

**Payment return** `/payment/return`: mock adds `orderId` [M] and `cancelled=1` [M] on cancel; our `plan`, `market`, `locale`, `utm_*` [A] stay. `orderId` from stored context wins over the URL (04, invariant 2). `cancelled=1` is a hint only; both cancel and decline are `failed` on the server (Q6, Q31).

## 5. `GET /v1/orders/{id}`

| | Docs | Mock | We read / send | Gap |
|---|---|---|---|---|
| Response | `status`: `pending`/`paid`/`failed`/`requires_action`. Webhook-driven, "usually a few seconds, occasionally minutes" | `{orderId, planId, status, createdAt}`, plus `actionUrl` on `requires_action` | `status` field [M] (Q43), its values [D]; `actionUrl` [M], `planId` [M] (Confirmed when context is lost) | `actionUrl` undocumented (Q6). No amount, currency or trial (Q4), no failure reason (Q6) |
| Errors | `{errors[]}` | 401, 404 `order_not_found` (also another customer's order), 500 | `errors[].code` [D] via adapter; code values [M] | — |
| Timing | — | settles in 1–45 s | Poll per Q9 | No push channel, no max time (Q9) |

## Analytics `purchase`

`transaction_id` = `orderId` [D]. `value` = Review price in euros, `0` if trial was shown: **our estimate**, the server never returns an amount (Q4). `currency` = plans `currency` [M]. Fires once per `orderId` (Q20).

## Normalized error model

One adapter, `toApiError(response | thrown)` → `{status, code, message, retryAfterSec?}`. UI never reads raw bodies (Q18).

1. `{errors:[{code, message}, …]}` → first entry.
2. `{error: "message"}`, non-JSON or empty body → `code` from status: 400 `invalid_request`, 401 `unauthenticated`, 404 `not_found`, 409 `conflict`, 429 `rate_limited`, 5xx `internal_error`.
3. fetch rejects or times out → `{status: 0, code: 'network'}`.
4. 429 → `retryAfterSec` from `Retry-After` (seconds), else 30 (Q35).

Then `kind` from endpoint + status + code [M]. An unknown code takes the kind of its status. 429 outside identity counts as `server` (Q42).

| Status / code | Kind | State in 04 (depends on caller) |
|---|---|---|
| 0 `network` | `network` | Entry → Plans (anonymous) · StartingEid → StartError · Verifying → VerifyError · Review plans fetch → error + retry, Pay disabled · Gate (any step) → retry point + error · CreatingOrder → retry point, marker kept, no auto retry (Q34) · PaymentReturn → Polling · Polling → keep polling, "Connection issue" |
| 5xx | `server` | Same as `network`, except CreatingOrder: retry point + error, marker cleared |
| 401 | `unauthenticated` | Entry → Plans (anonymous) · Verifying → OtherBrowser · Gate step 3, CreatingOrder → StartingEid, context kept · Gate step 1, Polling → IdentityLost · PaymentReturn → Polling (which then shows IdentityLost) |
| 409 `already_subscribed` | `alreadySubscribed` | Account (Q10) |
| 409, other code | `conflict` | CreatingOrder → Gate once more (Q41) |
| 400 `invalid_plan` | `invalidPlan` | CreatingOrder → Plans + notice |
| 404 on `/v1/orders/{id}` | `orderNotFound` | Polling → OrderNotFound · Gate step 1 → clear open order, continue |
| 429 on identity | `rateLimited` | StartingEid → RateLimited, countdown `retryAfterSec` |
| other 4xx (incl. 404 elsewhere) | `badRequest` | StartingEid → StartError · Review plans fetch → error + retry · Gate, CreatingOrder → retry point + error. Logged (our bug) |

No kind maps to PaymentFailed. Only `status: failed` from `GET /v1/orders/{id}` does (04, invariant 3).

## Requests to backend, by launch impact

1. **`market` on `POST /v1/orders`**, or derive it server-side, and reject a plan not sold in that market. Otherwise wrong VAT is charged (Q1).
2. **Prod CORS** for the `www` origin with credentials, and cookie `SameSite`/domain. Without it no API call works from the static site (Q40).
3. **Confirm the provider return contracts**: `returnUrl` in both bodies, eID `status`, payment `orderId` and `cancelled`, `actionUrl`. The whole flow is built on mock behaviour (Q6).
4. **Amount, currency and trial flag on the order** (POST and GET), and what a trial order charges. Needed for the price shown vs charged and GA `value` (Q4).
5. **`Idempotency-Key` on `POST /v1/orders`** (allowed in CORS), and 409 while the customer has a pending order. Prevents duplicate charges (Q19, Q37, Q39).
6. **`state` param on the eID callback**. Prevents login CSRF (Q7).
7. **One error shape and a code catalogue**, including 401 on `/v1/me` (Q18, Q28).
8. **Failure reason on `failed` orders**, so cancel and decline are told apart without `cancelled=1` (Q6, Q31).
9. **`Retry-After` on every 429** (Q35).
10. **Order settle time SLA or a push channel** (Q9).
11. **Auth session lifetime** (Q17).
12. **`planKey` and `trialDays` on plans** (Q11, Q12).
13. **Document `currency`, the `activeSubscription` shape, the `plans` wrapper, the order `status` field and success status codes** (Q26, Q43).
14. **Error mapping for 409 codes other than `already_subscribed`, and 429 outside identity** (Q41, Q42).
15. **Review arm on `POST /v1/orders`**, stored on the order (Q51, 10).
16. **Order and identity metrics per market**: created/paid/failed, pending age, identity 429/5xx, orders per customer, paid by Review arm. Revenue truth and alerts 1–5 (Q51, 10).
