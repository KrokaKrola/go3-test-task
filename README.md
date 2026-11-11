# Nordlight: spec-driven subscribe flow

Plan → eID → Review → Pay → Confirmed for EE/LV/LT, spec first and built with AI tools against the mock server. The brief is in [`ASSIGNMENT.md`](ASSIGNMENT.md).

## Deliverables

| Path | What it is |
| --- | --- |
| [`spec/`](spec/README.md) | The spec. Start at `spec/README.md` for the reading order |
| [`app/`](app/README.md) | The thin slice: Next.js static export, unit + E2E tests |
| [`AI-LOG.md`](AI-LOG.md) | AI working log: tools, context setup, where the output went wrong |
| [`TEAM-NOTE.md`](TEAM-NOTE.md) | Top 5 risks for the product and backend leads |
| [`PLAN.md`](PLAN.md) | Phases, time budget, decisions, cut list, deferred review findings |
| `ai-log/` | Raw appendix written by hooks: every prompt (`prompts.md`) and one transcript per session |
| `docs/`, `mock-server/`, `fixtures/` | Starter material, unchanged |

## Quick start

Node 18+ for the mock. The app uses Next 16, so Node 20.9+ there.

```sh
npm run mock                 # terminal 1: mock API on http://localhost:4010
cd app && npm install
npm run dev                  # terminal 2: app on http://localhost:3000
```

Open <http://localhost:3000/ee/en/>. Pick a mock scenario (declined, slow, cancelled, …) at <http://localhost:4010>, or add `?scenario=<name>` to a URL. Use `localhost`, never `127.0.0.1`, so cookies are shared between ports.

Markets and locales: `/ee/et/`, `/ee/en/`, `/lt/lt/`, `/lt/en/`. LV (`/lv/lv/`, `/lv/en/`) is behind a flag, see [`app/README.md`](app/README.md).

## Tests

```sh
cd app
npm test                       # vitest: 469 unit/component tests
npm run e2e                    # playwright: starts mock (MOCK_TIME_SCALE=50) + app itself
npm run e2e:review-off         # same, app started with reviewStep off (flag is read at build/start)
npm run check                  # lint + typecheck + unit + format + static build
npm run test:mock              # (from root) the mock's own tests
```

E2E needs ports 3000 and 4010 free. It doesn't reuse a running server on purpose, so stop `npm run mock` / `npm run dev` first.

## Mock server

| Command or variable | Effect |
| --- | --- |
| `npm run mock:fast` | Delays divided by 10 |
| `MOCK_TIME_SCALE=50` | Delays divided by 50 (E2E) |
| `PORT=4011` | Another port |
| `WEB_ORIGIN=http://localhost:5173` | Where the fake providers send the browser |

See [`mock-server/README.md`](mock-server/README.md).

## What I cut

Built in the slice: every state in `spec/04`, both `reviewStep` arms, open order + lean Gate, analytics events and UTM carry. Cut or deferred:

- **Spec only, not built** (`spec/11` *Not in slice*): Gate step 2 (attempt marker) and Resume "Continue payment"; 404 page and client fallback redirects; LV launch and disabled-market screens; runtime flags, Review experiment, `checkout.paused`, error tracking; keyboard-only / 44 px / reflow / reduced-motion E2E; Lighthouse CI and the JS budget script.
- **E2E**: 4 specs (happy, declined + retry, slow polling, UTM carry) with axe on every screen. The other failure paths (`identity_cancelled`/expired, `already_subscribed`, `requires_action`) are covered by component tests only. E2E runs against `next dev`, not the built `out/`.
- **Cut from the spec** (`PLAN.md`): server-side `purchase` via GA4 Measurement Protocol; analytics events beyond marketing's six; partial `returnUrl` salvage (Q61).
- **Out of scope**: email/receipt (no email is collected, Q15).
- **No CMP**: consent stays `pending` (Q53), so GTM loads in Consent Mode default-denied and UTMs aren't stored.
- **Review findings**: about 60 should-fix items from the reviewer are deferred, listed per work item in `PLAN.md` under "Deferred from W-xx review".
- **Translations**: et/lv/lt strings are AI translations and need a native check.

## Time spent

From the timestamps in `ai-log/` (prompts + session transcripts, local time EET). Wall = time inside a sitting. Active = wall minus pauses over 10 min.

| Phase | Budget | Wall | Active |
| --- | --- | --- | --- |
| 0. Discovery: inconsistencies, 3 questions, 01 scope, 03 | 0:30 | 0:49 | 0:34 |
| 1. Spec (`spec/` 02, 04–11, whole-spec review) | 2:30 | 1:58 | 1:48 |
| 2. Slice (`app/`, W-01 – W-13) | 1:30 | 4:10 | 3:26 |
| 3. AI-LOG, TEAM-NOTE, README | 0:30 | ~0:30 | not measurable, mostly hand-written |
| **Total** | **5:00** | **~7:25** | **~5:50 + docs** |
| Extra, after the stop (see below) | — | 0:35 | ~0:20 |

Sittings: 10 Nov 22:22–01:05 (discovery + spec), 11 Nov 07:50–10:25 (W-01 – W-09), 11 Nov 12:50–15:00 (W-09 – W-13, docs), 11 Nov 20:00–20:35 (extra).

- I went over the 5-hour stop by about 2:25. All of it came from the slice (4:10 against 1:30), because every work item ran through a worker → reviewer → fix loop (see `AI-LOG.md`). The spec came in under budget.
- My own reading of `docs/` before the logging hooks existed isn't in the logs, so discovery is likely longer than shown
- Per-item times are in [`app/README.md`](app/README.md) and [`spec/README.md`](spec/README.md)

## Extra (after the 5-hour stop)

Manual testing after the stop found the issues below. I fixed them on extra time and kept them out of the main budget, so the table above shows what the main working hours produced. Details in `AI-LOG.md` #5, Q76 and Q77 in `spec/03`.

| # | Issue | What I did | Why it's extra |
| --- | --- | --- | --- |
| 1 | **`reviewStep` off didn't work.** After eID the app came back to Plans and never reached payment. W-10 stopped at the Gate, W-11 created orders from Review only, and the unit test stopped at `CreatingOrder`. No E2E ran with the flag off. | Plans creates the order the same way Review does. Unit tests run through POST → open order saved → payment redirect. New `npm run e2e:review-off`. Q76 | The arm was in scope, so this is a slice defect. It was found only by manual testing after the stop, and no test or reviewer caught it. It matters because Legal may not approve the Review step (Q3) |
| 2 | **Plans cards flashed between eID and payment** with `reviewStep` off | An inline script hides Plans before first paint behind an "Opening payment…" screen. E2E checks that only that screen shows while the order POST is held. Q77 | UX polish, not an acceptance criterion |
| 3 | **`market.LV` check.** LV is deferred (`spec/11` *Not in slice*), but it's the next launch | Builds with the flag off and on behave as `spec/06` says. Off: no LV pages, warnings. On: build fails on empty `legalText`. Probe in a throwaway copy with the LT content as LV: build passes, 21% VAT, Premium hidden, root picks `lv/lv`, full path to Confirmed with `market: LV` in both `reviewStep` arms. Probe deleted, nothing added | Verification of a deferred feature, no code. Open gaps, still deferred: `/lv/lv/` with the flag off shows the Next 404 instead of redirecting to `/` (08 *Fallback*); LV rollback sends returning users to a missing page (Q52) |
