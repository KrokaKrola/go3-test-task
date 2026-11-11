---
description: Sonnet (medium) implements a task, Opus reviews it, Sonnet fixes review findings
argument-hint: <task, e.g. "W-17" or a one-line change>
---

Task: $ARGUMENTS

1. Spawn `sonnet-worker` with the task, the relevant spec/work-item paths you know of, and any constraints from this conversation.
2. When it reports, spawn `opus-reviewer` with the task and the worker's full report.
3. Verdict "Request changes" or a non-empty Must fix list → SendMessage the "Must fix" list to the same `sonnet-worker`, then send its new report to the same `opus-reviewer` for re-review. Max 2 rounds; after that stop and report what's still open.
4. Report to the user, terse: verdict, files changed, checks run, open items. Don't commit.
