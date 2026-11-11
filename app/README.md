# App

The subscribe flow (Plans → eID → Review → Pay → Confirmed) against the mock server. Built from `spec/11-work-items.md`, one work item per AI session.

Stack: Next.js 16 App Router with `output: 'export'` (static, no server code), TypeScript strict, Zustand, Zod, Vitest + Testing Library, Playwright + `@axe-core/playwright`.

## Run

Node 20.9+. Start the mock from the repo root first.

```sh
npm run mock          # repo root: http://localhost:4010
cd app
npm install
npm run dev           # http://localhost:3000 → redirects to /ee/<browser lang>/
npm run build         # static export to out/
```

`.env` points the app at the mock. Override in `.env.local`:

| Variable                       | Default                              | Meaning                                                       |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE`         | `http://localhost:4010`              | API, eID and CMS origin                                       |
| `NEXT_PUBLIC_ACCOUNT_URL`      | `http://localhost:3000/account-stub` | Where existing subscribers go. The mock has no account page   |
| `NEXT_PUBLIC_GTM_ID`           | unset                                | `GTM-…`. Unset means no GTM script                            |
| `NEXT_PUBLIC_FLAG_REVIEW_STEP` | `true`                               | `false` skips Review; the retry point becomes Plans (Q3, Q38) |
| `NEXT_PUBLIC_FLAG_MARKET_LV`   | `false`                              | `true` builds `/lv/lv/` and `/lv/en/` (Q13)                   |

Flags are read at build time. Restart `npm run dev` after changing them.

## Routes

| Route                        | Screen                                                    |
| ---------------------------- | --------------------------------------------------------- |
| `/`                          | Redirects to `/ee/{locale}/`                              |
| `/{market}/{locale}/`        | Plans, eID start, Gate, retry point                       |
| `/{market}/{locale}/review/` | Review + Pay (flag `reviewStep`)                          |
| `/auth/callback/`            | eID return: `?status=ok\|cancelled\|expired`              |
| `/payment/return/`           | Payment return, polling, Confirmed / failed / unconfirmed |

Flow context (plan, market, locale, UTMs) travels in the `returnUrl` query, so a return in another browser still works (Q7).

## Code map (`src/`)

| Folder        | What                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `domain/`     | Pure rules: price with VAT, planKey ↔ planId map, markets, locales                               |
| `api/`        | Typed endpoints, Zod schemas, one error adapter (`{status, code, message}`)                      |
| `flow/`       | State machine (`machine/`), store, Gate, open order, poller + schedule, `returnUrl` context, UTM |
| `analytics/`  | GTM loader, consent adapter, `track()` for the six events                                        |
| `cms/`        | Load and validate the `PlanPage` entry, merge with API plans                                     |
| `i18n/`       | Per-locale dictionaries                                                                          |
| `components/` | Thin React screens                                                                               |
| `app/`        | Next routes                                                                                      |

Each module has its test next to it.

## Test

```sh
npm test              # vitest, 454 tests in 41 files
npm run e2e           # playwright; starts the mock (MOCK_TIME_SCALE=50) and next dev itself
npm run lint && npm run typecheck
npm run check         # lint + typecheck + unit + format check + build
```

E2E specs in `e2e/`: `happy`, `payment-declined` (retry creates a second order), `payment-slow` (still confirming → confirmed), `utm` (UTMs + context in both `returnUrl` bodies), `smoke`. Each runs axe on every screen it reaches and checks unique titles and the order count from `/__mock/state`.

- Ports 3000 and 4010 must be free. `reuseExistingServer: false` on purpose: a busy port fails instead of being reused.
- Serial (`workers: 1`): the mock has one in-memory store.
- No `waitForTimeout`. Timers run on Playwright's fake clock (`spec/09` _E2E setup_).

Not covered by E2E (unit/component only): eID cancelled/expired, already subscribed, `requires_action`, `reviewStep` off. Full matrix: `spec/09-testing.md`.

## Known gaps

About 60 reviewer findings are deferred, per work item, in `../PLAN.md` ("Deferred from W-xx review"). The ones that matter most:

- `/payment/return` reached through a bfcache restore doesn't restart polling.
- "Check again" buttons have no in-flight guard (double GET, no busy text).
- `out/404.html` has no `<html lang>`.
- et/lv/lt strings are AI translations, not native-checked.

## Time spent

From `ai-log/` session timestamps. Active = session time minus pauses over 10 min. Commit = local time of the item's commit.

| Item                                   | Active   | Commit    |
| -------------------------------------- | -------- | --------- |
| W-01 Scaffold + quality gates          | 0:16     | 08:10     |
| W-02 Domain: money, plans, markets     | 0:07     | 08:21     |
| W-03 HTTP adapter + error model        | 0:14     | 08:36     |
| W-04 State machine                     | 0:21     | 08:58     |
| W-05 Flow context + UTM                | 0:06     | 09:05     |
| W-06 Analytics                         | 0:14     | 09:19     |
| W-07 App shell, routes, i18n, switcher | 0:23     | 09:45     |
| W-08 Plan page                         | 0:17     | 10:02     |
| W-09 eID start + callback              | 0:18     | 12:58     |
| W-10 Open order + Gate + retry point   | 0:22     | 13:21     |
| W-11 Review + order creation           | 0:20     | 13:41     |
| W-12 Payment return + polling          | 0:16     | 13:58     |
| W-13 E2E + axe                         | 0:12     | 14:29     |
| **Total**                              | **3:26** | wall 4:10 |

Budget was 1:30. Each item ran worker → reviewer → up to 2 fix rounds, which is where the time went (`../AI-LOG.md`). W-09 spans the morning break, and long E2E runs in W-13 count as pauses, so wall time is the better upper bound.
