# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not open a public issue**.
Instead, report it privately to the maintainer (see the contact in the
repository profile). Include steps to reproduce and the potential impact. We'll
acknowledge your report and work on a fix as quickly as we reasonably can.

## Scope & notes

- Harrington includes a small local server. It binds to `127.0.0.1` by default
  and stores family state, lesson caches, and recordings under
  `data/private/` (or `HARRINGTON_DATA_DIR`), with `0700` folders and `0600`
  files and backup archives.
- `HARRINGTON_HOST` changes the bind address. When Harrington is shared with
  other devices, set `HARRINGTON_ACCESS_TOKEN` (at least 22 printable ASCII
  characters with 2+ character classes and 8+ distinct characters): every
  `/api/*` request except `/api/health` then needs an `HttpOnly`,
  `SameSite=Strict` cookie set via `/login` (password form or `?token=` link;
  compared in constant time; derived from the token, never the token itself).
  `/login` throttles repeated wrong guesses per normalised socket address
  (ignoring `X-Forwarded-For`) with exponential backoff after 5 failures
  (`1s` doubling to `60s`, returning `429` with `Retry-After`) and logs
  failures without the token. Whatever the bind address, the server answers
  only to `localhost`, IP literals, configured bind/published names, and
  `HARRINGTON_ALLOWED_HOSTS` (`421` otherwise) to block DNS rebinding.
  Harrington does not terminate TLS; put a WireGuard mesh with HTTPS (such as
  Tailscale) or a local reverse proxy with an internal certificate authority in
  front of it ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). Harrington trusts
  `X-Forwarded-Proto: https` (and `Forwarded: proto=https`) solely to add the
  `Secure` flag to the `/login` cookie (a safe fail-closed direction) and never
  trusts forwarding headers for rate limiting or settings access. There are no
  local user accounts, and the token is a single family secret: do not expose
  the local server to the public internet.
- What the local token does not protect:
  - a `?token=` sign-in link stays in browser history, address-bar
    suggestions and synced history (the form avoids this);
  - the cookie is a 400-day credential, identical on every device, and the
    only way to sign out one device is to change the token for everyone;
  - over plain HTTP the token and the cookie cross the network in clear;
  - `/api/health` is open and reveals whether the server is shared and
    whether the token is on (no family data);
  - anyone holding a signed-in device, a child included, has full access.
- For remote multi-device access, Harrington also supports a Firebase
  deployment (`HARRINGTON_FIREBASE_CONFIG` via `npm run build:firebase`):
  Firebase Hosting serves the static app over HTTPS with strict CSP headers;
  Firebase Authentication (Google OAuth 2.0 and email/password) issues 1-hour
  JWT ID tokens and individually revocable per-device refresh tokens, gated on
  an invite-only SHA-256 email digest allowlist plus `email_verified == true`
  with zero plaintext email in the bundle or rules; Cloud Firestore
  (`australia-southeast2`) rules enforce schema bounds, `validateDocument()`
  key parity, and monotonic version updates; Cloud Storage enforces an
  `audio/*` allowlist; and `firebase-backend.js` applies the same name and
  note redaction and plain-HTTP refusal before calling the AI provider.
- AI generation is disabled until `HARRINGTON_AI_BASE_URL` and
  `HARRINGTON_AI_MODEL` are set (or saved in app settings, excluding
  `secrets.json` from exports and `npm run backup`). Plain `http://` AI base
  URLs on public hosts are refused. When configured, requests go only to that
  OpenAI-compatible endpoint. Harrington never puts a learner's name, birth
  month or year, interests or record titles into a prompt itself. It replaces
  the learner names it knows with “the child” in transcripts and notes in the
  browser before any request is built, and again before forwarding to the
  provider, with the same matching rules; stored parent notes are also removed
  unless the parent opted in for `analysis` or `review`. A learner name that
  is a common word ("Will": dozens of taxonomy topics contain "will") is
  replaced wherever it appears in the prompt, instructions and topic text
  included, which can degrade the answer. What still leaves the machine: topic
  text (for lessons, printables, activities, “Explain simply”, mini-quizzes,
  recall cards, tests and challenges) and the topic's age from the
  curriculum; the learner's exact age for whole-subject tests, discussion
  analyses (alongside a linked topic's age) and progress reviews; the adaptive
  “excelling” flag on topic and section tests; mastery counts and percentages,
  topic statuses, record counts and the average confidence rating for progress
  reviews; a discussion transcript when the parent asks for an analysis; and
  parent notes only when the parent opts in for that request. Only names
  entered in Harrington are replaced: a nickname, especially one that is an
  ordinary word, and other people's names in a transcript are sent as spoken,
  a one-letter name is not replaced, and names in scripts written without
  spaces (for example Chinese) are not matched when they run straight into
  other text. There are no features shared between families.
- An imported family file is checked before it replaces the family data, and
  the server applies the same check (`src/js/document.js`) to every save,
  answering 422; a save in a data format newer than the server's, or older
  than the stored document's, gets 409. A file from a newer data format
  (`schemaVersion`) is refused at import, and such a document already on the
  server opens read-only. Learner, record and result values are escaped in
  every view, and a stored AI analysis is rendered through an allowlist of
  the tags Harrington writes, never as raw HTML.
- The child-view PIN is a gentle barrier, not a lock. The PIN is set and
  cleared only from the parent side (never from inside the child view), and 5
  wrong guesses trigger an exponential cooldown (`15s` doubling up to `5m`,
  kept in `sessionStorage`). Four digits are 10,000 guesses, and reloading the
  page always returns to the parent view. The family document (and every
  export) keeps only a SHA-256 hash of the PIN with a random per-family salt
  (`settings.parentPinHash` and `settings.parentPinSalt`), never the digits. A
  plain `parentPin` from an older document or export is hashed when it is
  loaded or imported (data format step 1 to 2); the server refuses a
  current-format save that still carries one. Anyone who can read the data
  folder or an export can still recover a 4-digit PIN by trying them all; the
  hash only keeps it out of plain sight.
- The "See how it works" figures (`src/figures/*.html`) run in an iframe
  sandboxed to `allow-scripts`, so in an opaque origin with no access to the
  app, its cookie or its storage. The server decides each file's policy on
  its resolved path, ignoring case: only the app shell (`index.html`) gets
  `frame-src 'self'`, so a figure cannot navigate its frame to another
  origin; every other HTML page and every file under `src/figures/` gets
  `default-src 'none'` and `sandbox allow-scripts`, so a figure cannot load
  anything even when it is opened directly, by any spelling of its address
  (`/figures//x.html`, `/figures/%2Fx.html`, or `/FIGURES/x.html` on a
  case-insensitive file system). `/api/figures` lists only pages that pass
  `src/js/figures/contract.js` (no URL, external script, link or frame tag).
- Please never include real children's personal data in a report.

Thank you for helping keep families using Harrington safe.
