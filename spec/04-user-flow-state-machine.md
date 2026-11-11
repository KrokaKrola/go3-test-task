# 04 · User flow and state machine

Behaviour of the subscribe flow, from plan list to confirmed. Q-numbers refer to `03-open-questions.md`.

## Terms

- **Open order**: the last order this browser created, kept in `localStorage`: every tab shares it and it outlives the tab (Q37). Functional storage, no consent needed (07). It holds orderId, `paymentUrl`, plan, market, locale and the `purchase` snapshot (07 *`purchase` params*). It is cleared when the server reports `paid` (after `purchase`), `failed` or 404.
- **Attempt marker**: written to shared storage just before `POST /v1/orders` and removed once the response arrives (Q39).
- **Retry point**: the place where failures land and where an explicit "Pay" or "Try again" lives. That's Review when `reviewStep` is on. When it's off, it's Plans with the chosen plan preselected and a banner (Q38). A banner from another page travels as `?notice=` on the retry point URL: `payment_cancelled`, `payment_declined`, `plan_unavailable`. Read once, then removed with `history.replace`. Unknown value → no banner.
- **Gate**: the check that every path into CreatingOrder passes first (see below).
- **Disabled market**: the context market is off by flag (LV rolled back, Q52). Any exit to a retry point or Plans shows "not available right now" with the order status instead. No retry, no other market (10).

## Invariants

1. **One order per attempt.** Only an explicit click at the retry point creates an order. Reload, Back, return, polling and a second tab never create one. While an open order is `pending` or `requires_action`, no new order is created in any tab: it's resumed instead (Q30, Q37).
2. **Trust: server > stored context > URL query.** Order status and identity come only from the API. Stored context beats the URL for plan, market and locale. The URL is used only when nothing is stored (Q7). `cancelled=1` is a hint that the server must confirm.
3. **Polling errors never show "payment failed".** Only `status: failed` from `GET /v1/orders/{id}` means failed. Network errors, 5xx, 401 and 404 have their own states.
4. **Every state has an exit.** Each non-terminal state has at least one action the user can take or a timeout. No state has only a spinner.
5. **Context survives redirects.** Plan, market, locale, `utm_*` (and orderId after payment) are in every `returnUrl` (Q7).
6. **State is re-derived on every show.** Each state runs its "on enter" step on first load, on reload and when Back restores the page from the back-forward cache. Disabled buttons are re-enabled when the page is restored. Nothing on the page is trusted until on-enter has run again.

## Happy path

```
Entry ─/v1/me─▶ Plans ─select─▶ StartingEid ─▶ [eID] ─▶ EidCallback ─/v1/me─▶ Review
  ─Pay─▶ Gate ─▶ CreatingOrder ─▶ [payment] ─▶ PaymentReturn ─▶ Polling ─paid─▶ Confirmed
```

Shortcuts:
- An identified user (Entry `/v1/me` 200) skips eID. Select → Review, or Gate if `reviewStep` is off.
- With `reviewStep` off, the flow skips Review: Verifying → Gate (Q32).

## Gate (before every order)

1. **Open order present** → `GET /v1/orders/{id}`.
   - `pending` or `requires_action` → **Resume**: no new order.
   - `paid` → Confirmed.
   - `failed` or 404 → clear it, continue.
   - 401 → IdentityLost.
   - 5xx or network → retry point + error. Pay disabled until the check succeeds.
2. **Attempt marker present** (a reload or crash during CreatingOrder) → clear it and show "Your last attempt didn't finish" at the retry point. Pay needs one more click. The lost order never got a `paymentUrl`, so it can't be paid (Q39).
3. **`GET /v1/me`** → `activeSubscription` → Account. 401 → StartingEid (context kept). 5xx or network → retry point + error, no order. 200 → CreatingOrder.

**Resume** = the retry point shows only "Continue payment" (reuses `paymentUrl`) and "Check status" (→ PaymentReturn). Pay and "Change plan" are hidden.

## Slice

Every state in *States* is in the slice, with both `reviewStep` arms. Only these parts are post-slice:

- **Gate step 2** and the attempt marker: CreatingOrder writes no marker and the Gate skips step 2. A reload during the POST leaves an orphan order with no `paymentUrl` (Q39).
- **Resume "Continue payment"**: the slice's Resume shows only "Check status". No one pays from Resume yet.
- **Display checks on enter**: Plans' Resume banner and Review's Gate step 1 run post-slice. The Gate on Pay / Try again still catches an open order, so invariant 1 holds.
- **Disabled market** screens (10).

## States

| State | On enter | Exits |
|---|---|---|
| **Entry** | `GET /v1/me` | 200 + `activeSubscription` → **Account**. 200 → Plans (identified). 401 → Plans (anonymous). 5xx/network → Plans (anonymous, checked again after eID) |
| **Plans** | Show API plans for the market, matched to CMS cards (Q8), with the trial line on Standard and Premium (*Trial*). Market off by flag → root. Open order `pending` → Resume banner | Select: identified → Review (or Gate if `reviewStep` off). Anonymous → StartingEid |
| **StartingEid** | `POST /v1/identity/sessions` with returnUrl + context. Button disabled | 201 → redirect to `redirectUrl`. 429 → **RateLimited**. 400, 5xx or network → **StartError** |
| **RateLimited** | Countdown from `Retry-After` (fallback 30 s, Q35). Polite `aria-live` | Countdown ends → "Try again" enabled → StartingEid. "Change plan" → Plans (shows Resume if there's an open order) |
| **StartError** | "Can't start eID right now" | "Try again" → StartingEid. "Change plan" → Plans |
| **EidCallback** | Read `status` from the query. Every exit uses `history.replace`, so the callback URL never stays in history: Back or reload can't re-run it or re-send `identity_completed` (07) | `ok` → Verifying. `cancelled` → **EidFailed(cancelled)**. `expired`, missing or unknown → **EidFailed(expired)** (Q36) |
| **EidFailed** | Message for the reason | "Try again" → StartingEid (same context). "Change plan" → Plans |
| **Verifying** | `GET /v1/me` | 401 → **OtherBrowser**. 5xx/network → **VerifyError**. 200 + orderId in context (from IdentityLost) → **PaymentReturn** for that order, checked before the subscription. 200 + `activeSubscription` → **Account**. 200 → Review (or Gate if `reviewStep` off) |
| **VerifyError** | "We couldn't confirm your identity" | "Try again" → Verifying. "Start again" → StartingEid |
| **OtherBrowser** | "Continue in the browser where you started" (Q7) | "Start again here" → StartingEid using the context from the URL |
| **Review** | Fetch `GET /v1/plans` again (the price shown here is binding, Q23). Consent checkbox unchecked (*Review consent*). Run Gate step 1 for display: an open `pending` order → Resume | Plan missing from API → Plans + `notice=plan_unavailable`. Plans fetch fails → error + retry, Pay disabled. "Pay" with the box unchecked → field error, no Gate. "Pay" (disabled on click) → Gate. "Change plan" → Plans |
| **CreatingOrder** | Write the attempt marker. `POST /v1/orders` `{planId, market, returnUrl}` | 201 → save the open order, clear the marker → redirect to `paymentUrl`. 401 → StartingEid (context kept, Q17). 409 `already_subscribed` → **Account** (Q10). Other 409 → Gate once more (Q41). 400 `invalid_plan` → Plans + `notice=plan_unavailable`. 5xx → retry point + error. Network/no response → retry point + error, marker kept, no automatic retry (Q34) |
| **PaymentReturn** | orderId from stored context, else from the URL. None → Plans | One `GET /v1/orders/{id}`: `failed` + `cancelled=1` → **PaymentFailed(cancelled)**. `failed` → **PaymentFailed(declined)**. `paid` → Confirmed. Anything else → Polling |
| **Polling** | `GET /v1/orders/{id}` every 2 s for 20 s, then every 5 s, stop at 3 min (Q9). Status in a polite `aria-live` region | `paid` → Confirmed. `failed` → PaymentFailed(declined). `requires_action` → redirect to `actionUrl` (once per poll cycle). `pending` → keep polling. 20 s → "Still confirming" text. 3 min → **Unconfirmed**. 5xx/network → keep polling, show "Connection issue, still checking". 401 → **IdentityLost**. 404 → **OrderNotFound** |
| **PaymentFailed** | Open order cleared. Go to the retry point with `notice=payment_cancelled` ("Payment cancelled") or `notice=payment_declined` ("Payment was declined") (Q31) | "Try again" → Gate (**new order**). "Change plan" → Plans |
| **Unconfirmed** | "We'll confirm shortly", order id shown. Open order kept | "Check again" → one GET, then the same exits as Polling. "Go to account" → Account. No new order offered |
| **IdentityLost** | "Verify to see your payment status", order id shown. Open order kept (Q33) | "Verify" → StartingEid, returnUrl carries the orderId → Verifying → PaymentReturn |
| **OrderNotFound** | "We can't find this order", order id shown. Open order cleared | "Back to plans" → Plans. "Go to account" → Account |
| **Confirmed** | Order id, plan, trial note if any. `purchase` fires once per orderId (Q20), params taken from the open order before it's cleared (07). Then open order and context cleared. On reload the open order is gone: no trial note | Terminal. "Go to account" → Account. Reload → GET again; `paid` stays Confirmed |
| **Account** | Redirect to `ACCOUNT_URL` (Q10) | Terminal (outside the flow) |

**Trial** (Q12, Q32): Standard and Premium only, 30 days. Copy comes from our catalog (06).
- **Plans card**: a trial line on Standard and Premium, in the static HTML, worded as a condition ("30-day free trial for new customers"). If the user is identified and `trialEligible: false`, the line gets `visibility: hidden` and keeps its space, so there is no layout shift (08).
- **Review and Confirmed**: a definitive trial note, only if `trialEligible`.

**Review consent** (Q3): one checkbox, unchecked on every show, including a bfcache restore (inv. 6). A pre-ticked box is not valid consent, and the checked state is never stored. The label comes from our catalog and Legal writes the wording: the user accepts the terms in `legalText` and asks the service to start now, under the withdrawal terms stated there. The Pay button reads "Order with obligation to pay" in each locale. Pay with the box unchecked → `aria-invalid` + `aria-describedby` error, focus moves to the checkbox, no Gate (08). With `reviewStep` off there is no checkbox (Legal risk, Q3, Q32).

## Mock scenarios → path

| Scenario | Path | Ends in |
|---|---|---|
| `happy` | Full happy path. Polling sees `paid` within ~3 s | Confirmed |
| `identity_cancelled` | StartingEid → eID → `?status=cancelled` | EidFailed(cancelled) → retry |
| `identity_slow` | Same as happy. The 8 s wait happens on the provider page, where we have no state | Confirmed |
| `rate_limited` | StartingEid → 429, `Retry-After: 30` | RateLimited → retry after countdown |
| `already_subscribed` | Anonymous: Verifying sees `activeSubscription`. Identified: Entry sees it. Gate step 3 and the order 409 also catch it | Account |
| `not_trial_eligible` | Happy path. Review shows the full price, no trial | Confirmed |
| `payment_declined` | PaymentReturn → `pending` → Polling → `failed` after ~1 s | PaymentFailed(declined) → new order on retry |
| `payment_slow` | Polling passes 20 s ("Still confirming") and sees `paid` at ~45 s | Confirmed |
| `payment_requires_action` | The mock sends the user to the challenge on its own, then returns. If polling sees `requires_action` (the user left the challenge), redirect to `actionUrl`. Approve → `paid`. Decline → `failed` | Confirmed / PaymentFailed(declined) |
| `api_500` | Plans render from the build. Entry `/v1/me` 500 → anonymous. StartingEid 500 → StartError. If already past eID: Verifying → VerifyError, Gate → retry point + error, polling → "Connection issue" → Unconfirmed after 3 min | StartError / VerifyError / Unconfirmed, never PaymentFailed |

Cases not tied to a scenario:

| Case | Trigger in mock | Ends in |
|---|---|---|
| eID expired | Wait > 5 min on the eID page, or reuse a completed session | EidFailed(expired) |
| Payment cancelled | "Cancel" on the pay page → `&cancelled=1`, order `failed` | PaymentFailed(cancelled) |
| Back from payment page | Browser Back to Review (fresh load or restored from the back-forward cache), order `pending` | Invariant 6 → Resume (same order) |
| Double tap on Pay | Two clicks | One request (in-flight guard in the handler; button `aria-disabled`, 08) |
| Reload during CreatingOrder | F5 before the 201 | Gate step 2 → "last attempt didn't finish". No payable duplicate |
| Second tab while paying | Tab A on the payment page or polling, tab B opens Plans/Review | Tab B shows Resume. No second order |
| Session expired on the payment page | Pay → return → poll 401 | IdentityLost → eID → PaymentReturn (mock: 404 → OrderNotFound, because every mock eID creates a new customer) |
| Session expired then rate-limited | IdentityLost → Verify → 429 → "Change plan" | Plans with Resume. No new order while the first is `pending` |
| Return in another browser | Open the callback URL without the cookie | OtherBrowser / IdentityLost |
| Session expired mid-flow (1 h) | Gate `/v1/me` or order POST → 401 | StartingEid (context kept) |
| Reload on Confirmed | F5 | Confirmed, `purchase` not sent again |
| Foreign or stale orderId | Poll → 404 | OrderNotFound |
