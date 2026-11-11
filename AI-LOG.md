# AI working log

## Tools

- **Claude Code** (CLI) for everything: spec drafting, reviews, code, tests, commits.
- **Claude Opus** for the main session and the reviewer agent. **Claude Sonnet** (medium effort) as the worker that writes code.
- Project hooks (`.claude/hooks/log-conversation.mjs`) log every prompt and session to `ai-log/`. That folder is the raw appendix.

## How I set up the context

**Fixed context, loaded every session**
- `CLAUDE.md`: source-of-truth order (`spec/` > `docs/` > `mock-server/`), read-only folders, stack, the domain rules everyone forgets (price formula, planKey map, polling timings, `localhost` not `127.0.0.1`), and "never invent behaviour, add a question to `spec/03`".
- `spec/03-open-questions.md` works as the assumptions register. When the AI hits a gap, it adds a Q with an owner and a working assumption and keeps building. It went from 15 of my own findings to 75 entries.
- `PLAN.md`: phases, decisions and the cut list. The AI may not change a decision without asking me.

**Spec phase (one file per session)**
1. I write the intent or a sketch: the flow, the invariants, what I already know. Then I ask for a draft "with nothing else to read" from a named list of sources, a line limit, and "ask me up to 3 questions first".
2. A second prompt reviews the draft **against the sources, not against itself**: back every row with a line in `docs/` or the mock, walk every state for a dead end, map every mock scenario to a row, and try to break the invariants with concrete event sequences (double click, reload mid-POST, two tabs, Back from payment).
3. The AI fixes what it can and gives me options for anything that needs a decision.

**Build phase (`/delegate W-xx`, one work item per session)**
- `sonnet-worker` builds one item from `spec/11`, spec first and tests next to the code. It reports criterion by criterion.
- `opus-reviewer` doesn't trust that report. It reads the diff, the spec rows and `CLAUDE.md`, and proves each suspected bug with a throwaway `*.probe.test.ts` before reporting it.
- At most 2 fix rounds. I decide what's left: fix now, add a Q, or defer. Deferred items go in `PLAN.md` under "Deferred from W-xx review", then I commit.
- On the first review, 10 of 13 items came back with **Request changes**. Every worker report before that said green.

## Where the output was wrong or weak

**1. Invented behaviour in the spec (spec/02).** The draft had failure rows like "5xx on load → show plans, check again after eID" that no doc or mock line supports. They looked plausible, and that's the danger: an AI builder would have implemented them as requirements. *Fix:* I asked for a review that marks each row ✅ (source line), **Q** (assumption in 03) or ❌ (invented), then dropped the ❌ rows. Every later spec review used the same check (05: "is every field's source marked?", 06: "run each fixture through the rules").

**2. Silent scope cuts.** While drafting `spec/11`, the AI tagged analytics and UTM carry `post-slice`. It was following an old PLAN line and only mentioned it in a bullet afterwards. Later I found the Review step in the cut list too, which I hadn't put there either. Both are core to the brief. *Fix:* I rolled both back and updated PLAN, 07 and 09. I also saved a standing rule: ask before writing any cut, even one already in PLAN.md. PLAN.md now separates Decisions from the Cut list, and only I edit the cut list.

**3. Green tests, broken happy path (W-04 state machine).** All 110 tests passed, but Pay with no open order entered a Gate that never left, so no order was ever created. The tests started from hand-built mid-flow states and never chained Gate into the next step. 7 mutants survived the whole suite. *Fix:* chained transition tests (Review → pay → meLoaded → CreatingOrder), exit-table assertions on payloads as well as state names, and a worker rule: every guard or "nothing happened" test must fail once with the fix removed.

**4. Privacy and analytics bugs the tests asserted (W-05, W-08).** W-05 stored UTMs in sessionStorage before consent, via the flow-context copy, even though its own consent check said not to persist. W-08 tracked `plan_selected` on every click, so Basic, Basic, Standard sent Standard to GA while the flow was buying Basic. A test named "on every select" asserted that bug. The worker also reported "bundle budget not measured", and zod had entered the client bundle (215 KB against a 200 KB budget). *Fix:* UTMs are stored only through the consent-gated `nl_utm`, `plan_selected` fires only on the Plans → select edge, and the bundle is measured on every item. Raising the budget to 230 KB was my call, recorded as Q54.

**5. The `reviewStep` off flag never worked.** I tested by hand with the flag off: after eID the app came back to Plans and never went to payment. This flag matters because Legal may not approve the Review step (Q3). The unit test for this path asserted `CreatingOrder` and stopped there, so nothing checked that an order was actually POSTed. This is the same pattern as #3. No E2E covered it either, because the flag is read at build time and the suite only ran with it on. When I asked, the AI admitted it had never verified the flag. *Fix:* Plans now runs the same order step as Review, with unit tests chained through to the payment redirect, plus a separate `npm run e2e:review-off` run. Q76 records the gap. A second manual pass showed the Plans cards flashing between eID and payment. Now an inline script hides them before first paint behind an "Opening payment…" screen (Q77), and the E2E checks that only that screen shows while the order request is held. *Lesson:* every flag feature gets its own E2E run, and a test of a flow step must assert what happens next (POST, redirect), not only the state the machine enters.

**Smaller, recurring problems**
- The worker kept leaving modules loose at the folder root. After the second time I made “one folder per module, test beside it” an agent rule.
- The worker almost never ran E2E (“I did not run npm run e2e”), so the reviewer ended up catching route-level problems.
- The et/lv/lt strings, including the consent wording, are AI translations. They’re flagged for a native check and shouldn’t be trusted until then.
- The reviewer is thorough, but it piles up work. About 60 should-fix items are deferred in PLAN.md, and I deffered them on later stages rather than fixing them all.

## What I'd keep / change

**Keep:**
- Reviewing against the sources, not against the draft.
- A reviewer that must prove each bug with a probe.
- The assumptions register as the AI's only way to fill gaps.

**Change:**
- Make the worker run E2E for any change to a route.
- Put the bundle measurement into npm run check, so it doesn’t depend on someone remembering.
- Reviewing every step seemed like a good idea, but it ate too much time. I’ll cut the review down so it costs the reviewer less.
- The whole thing looks overengineered for 5 hours of work. I should have said up front that the architecture had to favor simplicity and speed.

## Appendix

- `ai-log/prompts.md`: every prompt, timestamped, with its session.
- `ai-log/transcripts/<session>.md`: one full transcript per session (25 sessions), including the worker and reviewer reports.
- `.claude/agents/`, `.claude/commands/delegate.md`: the agent definitions and the delegate loop.
