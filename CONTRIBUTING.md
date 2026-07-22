# Contributing to Homestead

Thanks for your interest in improving Homestead! Contributions of all kinds are
welcome — bug fixes, features, docs, and design.

## Ground rules

- By contributing, you agree your contributions are licensed under the
  **MIT License** (see [`LICENSE`](LICENSE)).
- **Do not commit a copy of the curriculum dataset.** Homestead loads the
  Marble Skill Taxonomy at runtime from its open repository. Bundling or forking
  the data has separate licensing obligations (see [`DATA-LICENSE.md`](DATA-LICENSE.md)).
- Keep the curriculum attribution intact — in the app UI, `NOTICE`, and README.

## Project setup

There is **no build step**. It's plain HTML + CSS + vanilla JavaScript (ES
modules), Tailwind via CDN, with auth/storage/AI provided by
[Puter.js](https://puter.com).

Run it with any static server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the served URL and sign in with a Puter account.

## Code layout

```
index.html            App shell + error reporting + script/style includes
css/styles.css        Small custom styles on top of Tailwind
js/
  app.js              Router, boot, sign-in, and top-level render
  store.js            State + persistence (Puter KV), all data accessors
  data.js             Loads the taxonomy and builds the graph
  mastery.js          Mastery ladder logic, sections, stats
  scheduler.js        The day-by-day calendar plan
  adapt.js            Adaptivity engine (difficulty suggestions)
  curriculum-sync.js  Detects upstream curriculum changes -> notifications
  ai.js               All AI helpers (lessons, tests, recall, chat, etc.)
  recorder.js         Voice recording + live transcript
  ui.js               DOM helpers, modals, toasts, icons
  views/              One module per screen/feature (dashboard, timeline,
                      topic, calendar, records, insights, recall, challenge,
                      masterytest, lesson, printables, recordings, guide,
                      assistant, notifications, shell)
docs/GUIDE.md         The full written feature guide
```

## Style

- Match the existing patterns: small focused modules, the `el()` helper for DOM,
  Tailwind utility classes, and Lucide icons (never emoji).
- Keep the app dependency-free (no bundler, no framework).
- Use American English in user-facing text.
- Test your change signed in with at least one student before opening a PR.

## Pull requests

1. Fork and create a branch: `git checkout -b my-change`.
2. Make focused commits with clear messages.
3. Describe what you changed and how you tested it in the PR.

## Reporting issues

Open an issue with steps to reproduce, what you expected, what happened, and your
browser. Please don't include any personal/child data in reports.
