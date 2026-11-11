# CLAUDE.md

Nordlight: a subscribe flow (plan → eID → review → pay → confirmed) for EE/LV/LT. This is an assignment repo: the spec in `spec/` drives the code in `app/`. Read `ASSIGNMENT.md` for the deliverables and `PLAN.md` for phases and time budget.

## Source of truth

1. `spec/` beats `docs/` beats `mock-server/`. Where they disagree, follow the spec and say so.
2. `spec/03-open-questions.md` holds the working assumptions. Never invent behaviour: if something is not covered, add a question with an assumption to that file and tell the user.
3. Work from one item in `spec/11-work-items.md` at a time. Meet its acceptance criteria, nothing more.

## Do not edit

`docs/`, `fixtures/`, `mock-server/`, `ASSIGNMENT.md`, `.claude/hooks/`, `ai-log/`. The `ai-log/` folder is written by hooks and is evidence for `AI-LOG.md`.

## Stack

Next.js App Router with `output: 'export'` (static, no server code, no API routes, no middleware). TypeScript strict. npm. Zustand as state library. Zod to validate API and as a source of types for API. Vitest + Testing Library for unit tests. Playwright for E2E.

## Commands

```sh
npm run mock                     # mock API on http://localhost:4010 (root)
MOCK_TIME_SCALE=50 npm run mock  # fast, for E2E
npm run test:mock                # mock's own tests
cd app && npm run dev            # app on http://localhost:3000
cd app && npm test               # vitest
cd app && npm run e2e            # playwright (starts mock + app)
cd app && npm run lint && npm run typecheck
```

## Domain rules (from open-questions; do not change silently)

- **Price**: `Math.round(priceNet * (1 + vatRate))` cents, formatted with `Intl.NumberFormat(locale, { style: 'currency', currency })`. Never render CMS `priceLabel` (Q2).
- **Market**: always send `market` in the `POST /v1/orders` body (Q1). Plans shown are those the API returns. CMS cards without a matching API plan are hidden (Q8).
- **planKey map**: `basic` ↔ `plan_basic_m`, `standard` ↔ `plan_std_m`, `premium` ↔ `plan_prem_m`. One place in code (Q11).
- **Trial**: Standard + Premium, 30 days, only if `/v1/me.trialEligible` (Q12).
- **Errors**: one adapter turns `{error}` and `{errors:[{code,message}]}` into `{status, code, message}`. UI code never reads raw error bodies (Q18).
- **Flags**: `reviewStep` (default on), `market.LV` (default off).
- **Flow context** (plan, market, locale) travels in the `returnUrl` query, because return may land in another browser (Q7). sessionStorage is only a convenience.
- **Polling** `GET /v1/orders/{id}`: every 2 s for 20 s, then every 5 s, stop at 3 min (Q9).
- **URLs**: `/{market}/{locale}/` in lowercase, e.g. `/ee/et/`. Callbacks: `/auth/callback`, `/payment/return`.

## Mock gotchas

- Use `localhost`, never `127.0.0.1`, so cookies are shared across ports. Every fetch uses `credentials: 'include'`.
- Session cookie `nl_session` is HttpOnly: use `GET /v1/me` to find out whether the user is identified.
- Pick a scenario with the `x-scenario` header (tests) or `?scenario=` (browser). `POST /__mock/reset` between E2E tests.
- eID returns `?status=ok|cancelled|expired`. Payment returns `?orderId=…[&cancelled=1]`. Payment results arrive later, so poll.
- `requires_action` comes with `actionUrl`; send the browser there.

## Code style

- Small pure modules (state machine, price, error adapter) with unit tests next to them. React components stay thin.
- Clear names over comments. Comments only for non-obvious *why*, kept short.
- No new dependency without a reason stated in the PR or commit.
- All user-facing strings come from the CMS or a per-locale dictionary. No hardcoded English in components.
- Accessibility: semantic HTML, visible focus, `aria-live` for polling status, a 44px tap target minimum (control or its label; links inside running text exempt).
