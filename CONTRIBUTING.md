# Contributing to Harrington

Thanks for your interest in improving Harrington! Contributions of all kinds are
welcome — bug fixes, features, docs, and design.

## Ground rules

- By contributing, you agree your contributions are licensed under the
  **MIT License** (see [`LICENSE`](LICENSE)).
- **Do not commit a copy of the curriculum dataset.** Harrington loads the
  Marble Skill Taxonomy at runtime from its open repository. Bundling or forking
  the data has separate licensing obligations (see [`DATA-LICENSE.md`](DATA-LICENSE.md)).
- Keep the curriculum attribution intact — in the app UI, `NOTICE`, and README.
- **Linear is the tracker**, matching Yew, FamousFor, and AskBetter. Do not
  open GitHub Issues for backlog work. See [`docs/LINEAR.md`](docs/LINEAR.md).

## Project setup

The browser app is plain HTML + CSS + vanilla JavaScript (ES modules), served
by Harrington's dependency-free Node server. A small asset build compiles the
local Tailwind stylesheet and copies Lucide into `src/vendor/`; it does not
bundle the application code.
Family state, lesson caches, and recordings are stored on that server. AI is
optional, through a local OpenAI-compatible provider; there are no
shared-family features.

Run it with Node:

```bash
npm start
```

Then open `http://127.0.0.1:4173`. No external account is required.

## Code layout

```
server.mjs            Static server + private state/lesson/audio API
src/index.html        App shell + error reporting + script/style includes
src/css/styles.css    Small custom styles on top of Tailwind
src/js/
  app.js              Router, server connection, onboarding, and top-level render
  backend.js          Same-origin Harrington API client
  store.js            State + server persistence, all data accessors
  data.js             Loads the taxonomy from the local server cache
  graph.js            Subject → domain → section hierarchy helpers
  mastery.js          Mastery ladder logic, sections, stats
  scheduler.js        The day-by-day calendar plan
  adapt.js            Adaptivity engine (difficulty suggestions)
  alerts.js           What the notification bell lists (open picks, evidence, backup)
  ai.js               All AI helpers (lessons, tests, recall, feedback, etc.)
  recorder.js         Voice recording + live transcript
  ui.js               DOM helpers, modals, toasts, icons
  figures/            "See how it works" figures: engine.js (inlined into each
                      page), contract.js (what a page must meet) and index.js
                      (the list the server sends)
  views/              One module per screen (dashboard, graph, topic,
                      calendar, records, insights, recall, challenge,
                      masterytest, lesson, printables, recordings, guide,
                      notifications, kidmode, shell, and their helpers)
src/figures/          Figure pages, one per topic id (see docs/FIGURES.md)
src/docs/GUIDE.md     The full written feature guide
```

## Style

- Match the existing patterns: small focused modules, the `el()` helper for DOM,
  Tailwind utility classes, and Lucide icons (never emoji).
- Keep the app dependency-free (no bundler, no framework).
- Use Australian English in user-facing text.
- Test your change with at least one synthetic student before opening a PR.
- Before committing, run `npm run check` (dead-code checker, copy and AI-gating tests, a few seconds, no build); `npm test` runs everything.

## Pull requests

1. Fork and create a branch: `git checkout -b my-change`.
2. Make focused commits with clear messages.
3. Describe what you changed and how you tested it in the PR.

## Reporting issues

File work in the Linear Harrington team (`HAR`). Include steps to reproduce,
what you expected, what happened, and your browser. Please don't include any
personal or child data in reports.
