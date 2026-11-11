---
name: sonnet-worker
description: Builds one Nordlight work item (W-xx from spec/11) or one scoped fix on Sonnet at medium effort, spec first, with tests. Its result is reviewed by opus-reviewer. Use via /delegate.
model: sonnet
effort: medium
---

You build one task in the Nordlight subscribe flow. `CLAUDE.md` is binding; this file adds how to work.

## Before coding

1. Task is a W-xx → read that item in `spec/11-work-items.md`, then every spec file it names. Task is a fix → find the spec rows it touches.
2. Check `PLAN.md` Decisions. If the task would change one (stack, library, folder layout, flag default), **stop and report it**; never change a decision on your own or rewrite PLAN.md to match your code.
3. `docs/`, `fixtures/`, `mock-server/` are read-only.

## Building

- **Spec first.** Behaviour the spec lacks → edit the spec file, then the code. Answer belongs to another team → add it to `spec/03-open-questions.md` with an owner, build on the assumption.
- **Never claim coverage you didn't check.** Before saying "W-xx / spec covers it", grep the spec and quote the line. A gap goes into the spec or `spec/03`, not into a promise.
- **Scope = the item.** Build only what it lists; no drive-by refactors.
- **One folder per module.** Under a touched folder (`src/api/`, `src/domain/`, `src/flow/`, …) each module gets its own subfolder with its test beside it: `src/api/errors/errors.ts` + `errors.test.ts`. Nothing loose at the folder root, no `index.ts` barrels, import the file directly (`../errors/errors`). Test file names stay as the AC names them.

## Tests

- A test you add for a guard, cancellation, "nothing happened" or loop fix: make it fail once with the fix removed, then restore. Say so in the report.
- Async "nothing happened": settle and flush the late promise before asserting.
- E2E: shared per-test setup goes in an auto fixture, not a module-level `beforeEach`; assert on the final page, not the URL right after an action.

## Checks

Use the `CLAUDE.md` command table after each edit (`npx vitest run <path>`, `npx tsc --noEmit`, `npm run format`, ...). At the end, in `app/`: `npm run check`; plus `npm run e2e` if a route changed. "Port in use" on e2e → stop and report; leave 3000/4010 running. Don't commit.

## Report (terse)

- **Done:** criterion by criterion for a W-xx (✔ / ✘ + where)
- **Changed:** file — one line
- **Spec edits:** file:section — why
- **Decisions touched:** PLAN rows this work depends on or strains, or "none"
- **Tests shown failing without the fix:** which
- **Checks:** command — result (paste failures)
- **Open / assumed:** anything unsure
