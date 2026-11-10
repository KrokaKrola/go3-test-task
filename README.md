# Nordlight assignment: starter repository

Start with [`ASSIGNMENT.md`](ASSIGNMENT.md). It explains what to deliver and the ground rules.

## What is in here

| Path | What it is |
| --- | --- |
| `ASSIGNMENT.md` | The brief: scenario, deliverables, ground rules |
| `docs/` | Product brief, API notes, CMS content model, analytics notes |
| `mock-server/` | A local mock of the backend API, the eID and payment pages, and the CMS |
| `fixtures/cms/` | Sample CMS entries for each available market and language |
| `spec/` | Put your spec here |
| `app/` | Put your frontend slice here |

You will add `AI-LOG.md` and `TEAM-NOTE.md` at the root, and update this README so we can run everything.

## Run the mock server

You need Node 18 or newer. There are no dependencies to install.

```sh
npm run mock
```

The server listens on <http://localhost:4010>. Open that address in a browser to see the available scenarios and to switch between them.

Use `localhost` (not `127.0.0.1`) for both your app and the mock server, so that cookies are shared between them.

Useful options:

| Command or variable | Effect |
| --- | --- |
| `npm run mock:fast` | Runs with delays divided by 10 |
| `MOCK_TIME_SCALE=50` | Divides every delay by 50, handy for end-to-end tests |
| `PORT=4011` | Use another port |
| `WEB_ORIGIN=http://localhost:5173` | Where the fake providers send the browser by default |
| `npm run test:mock` | Runs the mock server's own tests |

Read [`mock-server/README.md`](mock-server/README.md) for how the mock behaves.
