# B. API notes from the backend team

Base URL: `https://api.nordlight.example`. The web app is served from `https://www.nordlight.example`. Authentication is a session cookie set by the API after identity succeeds.

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `GET /v1/plans?market=EE` | List plans for a market | Prices are `priceNet` in euro cents plus `vatRate` as a decimal. Plan ids look like `plan_std_m`. |
| `POST /v1/identity/sessions` | Start an eID login | Returns a `redirectUrl` to the eID provider. The provider sends the user back to `/auth/callback`. Sessions expire after 5 minutes. Rate limited; may return 429. |
| `GET /v1/me` | Current customer | 401 if not identified. Returns `customerId`, `activeSubscription` and `trialEligible`. |
| `POST /v1/orders` | Create an order | Body: `planId`. Returns `orderId` and a `paymentUrl` on the payment provider's hosted page. |
| `GET /v1/orders/{id}` | Order status | `pending`, `paid`, `failed` or `requires_action`. Status is updated by a provider webhook. "Usually a few seconds, occasionally minutes." |

Errors: the identity endpoint returns `{ "error": "message" }`. The orders endpoints return `{ "errors": [{ "code": "...", "message": "..." }] }`. We plan to unify these at some point.

The local mock server (`mock-server/`) implements these endpoints. See `mock-server/README.md` for how it behaves.
