# Nordlight mock server

A convenience built from the API notes in `docs/02-api-notes.md`. Where the notes are silent, the mock had to make a choice. The real services may differ, so treat anything you rely on here as an assumption to write down.

Everything is in memory. Restart the server, or `POST /__mock/reset`, to start clean.

## Choosing a scenario

A scenario decides how the mock behaves. Pick one in any of these ways. The first match wins:

1. The `x-scenario` request header.
2. A `?scenario=` query parameter. This also sets a `nl_scenario` cookie, so the choice sticks for later requests, including page navigations to the fake providers.
3. The `nl_scenario` cookie, which you can also set by clicking a scenario on the landing page (<http://localhost:4010>).
4. Otherwise `happy`.

When you create an identity session or an order, the mock remembers the scenario in force at that moment and uses it for the provider pages that follow.

| Scenario | Behaviour |
| --- | --- |
| `happy` | Everything works. Payment is confirmed about 3 seconds after the customer pays. |
| `identity_cancelled` | The customer cancels at the eID provider. |
| `identity_slow` | The eID provider takes about 8 seconds to answer. |
| `rate_limited` | `POST /v1/identity/sessions` answers 429 with a `Retry-After` header. |
| `already_subscribed` | `GET /v1/me` reports an active subscription. |
| `not_trial_eligible` | `GET /v1/me` reports `trialEligible: false`. |
| `payment_declined` | The payment provider declines the payment. |
| `payment_slow` | Payment is confirmed about 45 seconds after the customer pays. |
| `payment_requires_action` | The provider asks for an extra authentication step before it confirms payment. |
| `api_500` | Every `/v1` endpoint except `GET /v1/plans` answers 500. |

## Endpoints

| Endpoint | Notes |
| --- | --- |
| `GET /v1/plans?market=EE` | Markets: `EE`, `LV`, `LT`. Returns `{ market, plans: [{ id, name, priceNet, vatRate, currency }] }`. |
| `POST /v1/identity/sessions` | Optional body `{ "returnUrl": "..." }`. Defaults to `WEB_ORIGIN/auth/callback`. Returns `{ sessionId, redirectUrl }`. |
| `GET /v1/me` | Needs the session cookie. Returns `{ customerId, activeSubscription, trialEligible }`. |
| `POST /v1/orders` | Body `{ "planId": "plan_std_m", "returnUrl": "..." }`. `returnUrl` is optional and defaults to `WEB_ORIGIN/payment/return`. Returns `{ orderId, paymentUrl }`. |
| `GET /v1/orders/{id}` | Returns `{ orderId, planId, status, createdAt }`. When the status is `requires_action` it also returns `actionUrl`. |
| `GET /cms/v1/plan-pages?market=EE&locale=et` | The CMS entry for a market and language. The same data is in `fixtures/cms/`. |

Return URLs must be on `localhost`, `127.0.0.1`, or the configured `WEB_ORIGIN`.

## The fake providers

These are plain HTML pages that continue automatically after a short delay, with buttons if you want to click through by hand.

- **eID** at `/mock-eid/{sessionId}`. When it finishes, it sets the session cookie on success and sends the browser to your `returnUrl` with `?status=ok`, `?status=cancelled` or `?status=expired`.
- **Payment** at `/mock-pay/{orderId}`. When it finishes, it sends the browser to your order's `returnUrl` with `?orderId=...`, plus `&cancelled=1` if the customer pressed Cancel.

Payment results arrive separately, as they would from a webhook. Check the order status through the API.

Browsers on `localhost` share cookies across ports, so your app on `localhost:3000` can use the cookie the mock sets on `localhost:4010`.

## Debugging

- `GET /__mock/state` shows sessions, customers and orders as the mock sees them.
- `POST /__mock/reset` clears everything.
- Each request is logged to the console with its scenario and status code.
- CORS is enabled with credentials for `localhost` and `127.0.0.1` origins. Add more with `ALLOWED_ORIGINS=https://a.example,https://b.example`.
