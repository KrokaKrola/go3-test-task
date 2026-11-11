# 01 · Scope

## Goal
A visitor in EE, LV or LT picks a plan, identifies with national eID, pays on
the provider's hosted page and lands in the app as a subscriber. No sign-up form.

Success = +15% visitor → paid conversion by end of Q1. There is no baseline
or funnel definition yet.

## Brief → scope
1. Choose plan, eID, pay, done. Plan → eID → **Review** → Pay → Done. Review is behind a flag 
2. Mobile-first, since 70% of users mobile
3. Basic / Standard / Premium plans. 30-day free trial on Standard and Premium only, for new customers (`trialEligible` from `/v1/me`). The source of truth for plans and prices is the API.
4. Prices incl. VAT, monthly. Prices are in EUR. Gross computed from `priceNet` and `vatRate` fields from API
5. eID is an account of user
6. Existing subscribers go to their account 
7. Initial launch is EE and LT, LV comes in a month
8. Marketing edits copy, badges, FAQ. All plan page copy from the CMS
9. Failure and recovery, details in `04-user-flow.md`. Every failure ends with a clear next action, never pays twice: eID cancelled / expired / 429, already subscribed, payment cancelled / declined + retry, `requires_action`, slow confirmation, return in another browser, API down.

## Non-goals
1. Promo codes and gifts. Should be easy to integrate
2. Sign-up form
3. Payment method UI, hosted by payment providers
4. Logout
