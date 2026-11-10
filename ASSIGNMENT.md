# Senior Frontend Assignment: Spec-Driven Checkout

Thank you for continuing with us. This assignment mirrors how we want to work: a product idea arrives half-finished, and you turn it into a spec that people and AI coding tools can build from safely.

## The scenario

Nordlight is a fictional video streaming service in Estonia, Latvia and Lithuania. Product wants a new web flow where a visitor chooses a plan, identifies themselves with a national eID, pays, and lands in the app as a subscriber. The product brief, API notes, CMS content model and analytics notes are in `docs/`. They are realistic, which means they are incomplete and not fully consistent with each other.

Engineering plans to build this feature mostly with AI coding tools. Your job is to write the spec that makes that possible, then prove it works.

## What to deliver

1. **The spec (about 60% of your effort).** Markdown files in the `spec/` folder. It must cover:
   - scope and non-goals;
   - the systems the frontend depends on and the systems that depend on it;
   - assumptions and open questions, each with who should answer;
   - the user flow as a state machine, including failure and recovery;
   - what you need from the API and the CMS;
   - analytics, i18n, accessibility and performance expectations;
   - a test strategy;
   - rollout and monitoring;
   - a breakdown into work items small enough for an AI tool to complete in one session, each with acceptance criteria.
2. **A thin slice (about 30%).** A working frontend of the flow from plan selection to confirmation against the mock server, in `app/`. Cover the happy path and at least two failure paths of your choice. Build it with AI tools, driven by your spec. Include unit tests and at least one end-to-end test.
3. **An AI working log** (`AI-LOG.md`). What you asked the tools to do, how you structured the context you gave them, and at least three specific places where the output was wrong or weak and what you did about it. A curated one to two pages is enough; raw transcripts are welcome as an appendix.
4. **A note to the team** (`TEAM-NOTE.md`, one page, about 10%). Written to the product lead and the backend lead: the five questions or risks that matter most, and your recommendation on each.

## Ground rules

- **Time.** Plan on 4 to 5 hours and stop at 5. Tell us what you cut. A sharp spec with a small slice beats the reverse.
- **AI use is expected.** Use any tools you like and tell us which. You are accountable for everything you submit, including what the tools wrote.
- **Stack.** TypeScript with a component framework you know well (Vue or Nuxt, React or Next, or similar). No real provider integrations; use the mock server in `mock-server/`.
- **Questions.** You may send up to three questions to your recruiter contact. We reply within one working day. Good questions count in your favour.
- **Submission.** A git repository or zip with a README that explains how to run everything, the spec, the log and the note.

## What happens next

We read your submission, then spend 60 minutes together walking through it. Expect us to ask why you made specific choices and what you would do differently with another week.
