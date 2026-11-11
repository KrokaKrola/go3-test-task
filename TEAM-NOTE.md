# Team note: Nordlight subscribe flow

**To:** Product lead, Backend lead · **From:** Frontend · 11 Nov 2026

The subscribe flow works end to end against the mock API: pick a plan, identify with eID, review, pay, see the confirmation. The unhappy paths work too: a declined card, a slow payment, a cancelled or expired eID, a customer who already has a subscription, and the payment provider sending the customer to an extra check.

Where the spec was silent we made 75 assumptions, listed in `spec/03-open-questions.md` (the Q numbers below point there). Most of them are frontend details we can own. Five could cost money, break consumer law or lose a paying customer, and we can't settle those on our side.

## How the flow works, briefly

The site is a set of static pages with no frontend server, so the customer's browser calls the API directly. During checkout the browser leaves our site twice, once for eID and once for payment, and each provider sends it back to a return page on our site. The payment result isn't known when the customer comes back, so we ask the API for the order status every few seconds, for up to 3 minutes.

| # | Risk | Severity | Who decides |
|---|---|---|---|
| 1 | Wrong VAT can be charged | Critical | Backend |
| 2 | One purchase can become two charges | Critical | Backend |
| 3 | No legally required review before payment | Critical | Product + Legal |
| 4 | Customer returns in another browser; eID return is unprotected | High | Backend + Security |
| 5 | A paying customer may never hear from us | High | Product + Backend |

## 1. The order doesn't say which country it's for (Q1, Q4)

A plan id like `plan_std_m` is the same in Estonia, Latvia and Lithuania, but VAT isn't: 24% in EE, 21% in LV and LT. `POST /v1/orders` takes only `planId`, so the backend has to guess the market. The mock also accepts a plan in a country that doesn't sell it, so a Latvian customer can order Premium. The order response has no amount, currency or trial flag, so neither the customer nor analytics can see what was charged.

**Our ask:** accept `market` in the order body (we already send it) and reject, with a 4xx, a plan that market doesn't sell. Return `amount`, `tax`, `currency` and `trial` on the order. We'd treat this as a launch blocker.

## 2. One purchase can turn into two charges (Q19, Q34, Q37, Q39)

The API will create a second order for the same purchase, and both can be paid. Everyday things cause it: a double tap on a slow phone, a retry after a timeout, a reload while the order is being created, two open tabs. We disable the button after one click, share the unpaid order across tabs and check for one before creating another. That makes duplicates rarer but can't stop them, because after a timeout the browser can't know whether the order was created.

**Our ask:** support an `Idempotency-Key` header on `POST /v1/orders`, so the same key always returns the same order, and allow that header in CORS (the mock rejects it today). If the customer already has an unpaid order, answer `409 pending_order_exists`. We already handle any 409 by re-reading the order (Q41), so this needs no frontend work.

## 3. Nothing stands between eID and payment (Q3, Q32, Q50, Q12)

In the brief, eID leads straight to payment. EU consumer law says that right before paying, the customer must see the final price and the trial terms and press a button that clearly says they are ordering with an obligation to pay. We only know the final price and trial eligibility after eID, so this can't go on the plan page.

We added a Review step between eID and payment: price, trial terms, an unchecked consent box and the pay button. It sits behind the `reviewStep` feature flag, which is on. We wrote the wording ourselves, as a placeholder.

**Our ask:** keep Review as a permanent step. Legal writes the consent text, the button label and the trial terms, including what a trial charges today (0 €, or a small card check). Keep the flag only as an emergency off switch, and don't A/B test the flow without Review until Legal says that version is lawful.

## 4. Customers come back in a different browser, and the eID return is unprotected (Q7, Q33, Q6, Q40)

70% of customers are on phones. There, eID often opens a separate app, and links from Instagram or Facebook open in the apps' own browsers. The customer often comes back in a different browser that doesn't have our session cookie. On top of that, the eID return has no `state` parameter, so we can't check that the browser coming back is the one that started. An attacker could use that to log a victim in as the attacker (login CSRF).

The return parameters (`?status=`, `?orderId=`, `cancelled=1`, `actionUrl`) and the CORS and cookie rules exist only in the mock. We built against them and don't know whether production matches.

The plan, market, language and UTM tags travel in the return URL, not only in browser storage. So a customer who loses the session repeats eID once, but keeps their plan and doesn't create a second order.

**Our ask:**
- Add a `state` parameter to eID start and check it on the callback.
- Publish the return parameters and cookie settings (`SameSite`, domain, lifetime; Q17) as the real contract.
- Confirm the API accepts cookie-carrying requests from the `www` origin.

## 5. A paying customer may never hear from us (Q15, Q9)

There's no sign-up form, so we don't have the customer's email. Payment confirmation is "usually seconds, occasionally minutes". If we still have no answer after 3 minutes, the customer sees "we'll confirm shortly" and an order number, and that's all. They get no receipt, and if the payment fails later we have no way to tell them. EU law also requires the contract to be confirmed on a durable medium, which in practice means something like an email.

**Our ask:** product picks a contact channel before launch: ask for an email on Review, or get one from the eID or payment provider. Backend adds a "my orders" endpoint or a push, so a customer who closed the tab can still find out what happened.
