# Spec

The spec for the Nordlight subscribe flow. People and AI tools build from it. Where it disagrees with `docs/` or the mock, the spec wins and says so.

## Files

| File | Covers |
| --- | --- |
| [01-scope.md](01-scope.md) | Goal, scope, non-goals |
| [02-system-context.md](02-system-context.md) | Upstream (API, eID, payment, CMS, GTM, CDN), downstream (GA4, account app, marketing), cross-origin rules |
| [03-open-questions.md](03-open-questions.md) | Assumptions register: 75 questions, each with an owner and the working assumption we build until answered |
| [04-user-flow-state-machine.md](04-user-flow-state-machine.md) | Invariants, states, events, guards, failure and recovery, what survives a browser switch |
| [05-api-contract.md](05-api-contract.md) | The API as the frontend uses it, field provenance, error adapter, return params, backend requests |
| [06-cms-contract.md](06-cms-contract.md) | `PlanPage` fields, planKey map, empty-field and validation rules |
| [07-analytics.md](07-analytics.md) | GA4 events, params, once-rules, UTM carry, consent |
| [08-quality.md](08-quality.md) | i18n and URLs, accessibility (WCAG 2.2 AA), performance budget |
| [09-testing.md](09-testing.md) | Test levels, mock scenario → test matrix, E2E setup, what isn't tested |
| [10-rollout.md](10-rollout.md) | Config, flags, launch stages, monitoring, alerts, rollback |
| [11-work-items.md](11-work-items.md) | Work items W-01 – W-13 sized for one AI session, each with testable AC; *Not in slice* list |

## Reading order

- **People**: 01 → 04 → 03 (P0/P1) → 05/06 → the rest as needed. `../TEAM-NOTE.md` has the top 5 risks.
- **AI tools**: `../CLAUDE.md` first, then one item in 11. Each item lists the sections to read (**Read**), the files it may touch and its dependencies. Never invent behaviour: add a question to 03 instead.

## Conventions

- `Q-nn` points to `03-open-questions.md`.
- Field marks: **[D]** in `docs/`, **[M]** mock only, **[F]** fixtures only, **[R]** requested from backend, **[A]** our own rule.
- `slice` = built now in `app/`; `post-slice` = spec only.

## Time spent

From `ai-log/` session timestamps, 10 Nov 22:22–01:05 EET. Active = session time minus pauses over 10 min.

| Session | Active |
| --- | --- |
| Discovery (check my 15 findings against docs + mock, rank, pick 3 questions) + 01 Scope + 03 Open questions | 0:32 |
| 02 System context | 0:15 |
| 04 State machine | 0:11 |
| 05 API contract | 0:08 |
| 06 CMS contract | 0:10 |
| 07 Analytics + 08 Quality (split out of 07) | 0:22 |
| 09 Testing | 0:09 |
| 10 Rollout | 0:09 |
| 11 Work items | 0:10 |
| Whole-spec review | 0:14 |
| **Total** (incl. 0:02 hooks setup) | **2:22** (wall 2:47) |
