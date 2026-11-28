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
- Before committing, run `npm run check` (fast security baseline, isolation,
  dead-code, copy, and AI-status checks — under 30 seconds, no build);
  `npm test` runs everything.

## Stitch-first design workflow

Google Stitch (`projectId: 16580032727805820358`, bound in `.stitch.json`) and
[`DESIGN.md`](DESIGN.md) are the design source of truth for Harrington:

- **Start UI changes in Stitch:** Design new screens or edit existing ones on
  Stitch Canvas (`stitch open project 16580032727805820358`), grounded in
  Harrington's Storybook Meadow design system (`DESIGN.md`).
- **Pull designs into code:** Inspect or download updated Stitch screen HTML
  and screenshots (`stitch get screen <id>`, `stitch download screen <id>`) and
  translate them into Harrington's vanilla ES modules (`src/js/views/*`) and
  Tailwind tokens (`tailwind.config.cjs`, `src/css/styles.css`), keeping
  Australian English, `esc()` escaping, and zero runtime dependencies intact.
- **Sync code updates back to Stitch:** After shipping UI changes, re-capture
  affected views with synthetic data (`stitch capture browser`) and re-upload
  (`stitch upload screen ... --route <route>`), and sync token changes with
  `stitch upload design DESIGN.md`. Never capture or upload real family data.

## Release and pre-merge checklist

Before cutting a release or merging a PR:

1. Run `npm run check` (must pass with zero failures in under 30 seconds).
2. Run `npm test` (full build, unit, server, Firebase, and isolation tests).
3. Run `npm run e2e` (or `npm run ci` to run the full local pipeline, including
   taxonomy integrity verification and the Docker smoke test).
4. Review [`SECURITY.md`](SECURITY.md) and
   [`docs/security/THREAT-MODEL.md`](docs/security/THREAT-MODEL.md) to confirm
   they accurately describe any changed behaviour or new attack surface.
5. Update [`CHANGELOG.md`](CHANGELOG.md) under `[Unreleased]`.
6. **Docker releases:** verify the image runs as non-root (`USER node`, uid
   `1000`) with no `.env`, `data/`, or baked-in secrets (`npm run ci` checks
   this automatically when Docker is running).
7. **Firebase deploys:** run `npm run build:firebase` and verify zero PII or
   plaintext email addresses appear in `dist/` (and validate `firestore.rules`
   and `storage.rules` whenever modified).

## Security review rules

Any PR that modifies security-sensitive code — `server.mjs`, `src/js/store.js`,
`src/js/document.js`, `src/js/pin.js`, `src/js/ai.js`, `src/js/redact.js`,
`src/js/views/shell.js`, `src/js/firebase-backend.js`, `firestore.rules`,
`storage.rules`, or E2E auth/safety specs (`tests/e2e/access-token.spec.mjs`,
`tests/e2e/hostile-import.spec.mjs`, `tests/e2e/data-safety.spec.mjs`) —
**requires an adversarial security review pass** before merge:

- Test hostile and malformed inputs, boundary lengths, and unexpected types.
- Verify write-route guards (`refuseCrossSite()`, cookie gate, `If-Match`, and
  `validateDocument()` / Firestore rules parity).
- Confirm zero secret, token, API key, or PII leakage in HTTP responses, logs,
  exports, backups, or built client bundles.
- Record the adversarial review pass and its checks in the PR body.
- Any PR that adds a route, a stored field, an external call, or a secret must
  also update [`docs/security/THREAT-MODEL.md`](docs/security/THREAT-MODEL.md).

### Practices enforced manually (not automated)

Some practices in [`docs/security/PRACTICES.md`](docs/security/PRACTICES.md)
cannot be fully verified by automated tests and rely on review and release
discipline:

- **Threat-model judgement (Practice 15):** tests can check that the PR
  template includes a threat-model checkbox, but deciding whether a change adds
  a new trust boundary, attacker capability, or data flow requires human review.
- **Owner sign-off on residual risks (`docs/security/THREAT-MODEL.md` §6 & §9.2):**
  accepting residual risks (`R1`–`R9`) is a product-owner governance decision.
- **Host, network, and cloud infrastructure controls:** TLS termination
  (`Caddy` / `tailscale serve`), host disk encryption (FileVault / LUKS / DSM
  encrypted folders), off-host encrypted backup media, and live Firebase project
  configuration sit outside the repository and cannot be verified locally.
- **Novel logic flaws:** static scans catch known patterns (`esc()`, `ask()`,
  `refuseCrossSite()`), whereas subtle authorisation or prompt-context edge
  cases require human adversarial review.

## Pull requests

1. Fork and create a branch: `git checkout -b my-change`.
2. Make focused commits with clear messages.
3. Describe what you changed and how you tested it in the PR.

## Reporting issues

File work in the Linear Harrington team (`HAR`). Include steps to reproduce,
what you expected, what happened, and your browser. Please don't include any
personal or child data in reports.
