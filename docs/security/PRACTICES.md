# Security practices for HAR-36 (baseline)

These are the practices that would have prevented the gaps in
[THREAT-MODEL.md](THREAT-MODEL.md) and [GAPS.md](GAPS.md), or the findings
already filed from exploratory testing. Each one names the gap or ticket it
comes from, followed by how HAR-36 enforces it.

## Server and routes

1. **One write guard for every state-changing route.** The guard checks, in
   order:
   1. `Sec-Fetch-Site` is `same-origin` or `none`;
   2. the body has a JSON content type on JSON routes;
   3. the cookie gate passes (and in Firebase mode, `isFamilyMember()` in
      `firestore.rules` / `storage.rules`).

   - **Enforced by:** `tests/security-baseline.test.mjs` (static write-route
     inventory of `server.mjs` plus live 401/403 checks on every `PUT`, `POST`,
     and `DELETE` `/api/*` route) and `tests/server.test.mjs`. (G5)
2. **The `Host`-header allowlist is always on**, whatever the bind address.
   - **Enforced by:** `hostAllowed()` in `server.mjs`, tested across loopback
     and shared servers in `tests/server.test.mjs` and
     `tests/security-baseline.test.mjs`. (G1)
3. **Security headers come from one helper / static config:** a
   Content-Security-Policy, `Referrer-Policy: no-referrer`, `X-Frame-Options`,
   `nosniff`, and a `Permissions-Policy` / strict CSP that locks down scripts,
   frames, and outbound hosts.
   - **Enforced by:** `send()` / `serveStatic()` in `server.mjs`,
     `firebase.json` headers, `tests/security-baseline.test.mjs` (outbound host
     allowlist + response header checks), `tests/server.test.mjs`, and
     `tests/figures.test.mjs`. (G6)
4. **Stored uploads have an `audio/*` content-type allowlist.** The server
   never echoes a client's `Content-Type` back, and serves non-audio user
   content with `sandbox` and `attachment`.
   - **Enforced by:** `safeAudioContentType()` in `server.mjs` and
     `isSafeAudioType()` in `storage.rules`, tested by `tests/server.test.mjs`
     and `tests/firebase-backend.test.mjs`. (G2)
5. **Authentication failures are rate-limited and logged** with the source
   address. The secret itself is never logged.
   - **Enforced by:** `accessTokenProblem()` + `signIn()` in `server.mjs`,
     tested by `tests/server.test.mjs` and `tests/security-baseline.test.mjs`;
     child-view PIN throttling via `createPinThrottle()` in `src/js/pin.js`,
     tested by `tests/pin.test.mjs`. (G3, G12)
6. **Proxy headers only ever act in the safe direction.** `X-Forwarded-Proto:
   https` (and `Forwarded: proto=https`) is used solely to add the `Secure`
   flag on the `/login` cookie (and `X-Forwarded-Proto: http` never strips
   `Secure` from a TLS socket). Identity and locality forwarding headers
   (`Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-Real-IP`) are never
   trusted to allow access: `/login` throttling uses `req.socket.remoteAddress`,
   and `canChangeAiSettings()` refuses (`403`) whenever any forwarding header is
   present without a token.
   - **Enforced by:** `requestIsHttps()`, `clientAddress()`, and
     `canChangeAiSettings()` in `server.mjs`, tested by `tests/server.test.mjs`
     and `tests/security-baseline.test.mjs`, and documented in
     `SECURITY.md`. (TB1)
7. **Settings that send a secret elsewhere never trust "loopback" behind a
   proxy.** Once Harrington is shared or behind forwarding headers, changing the
   AI provider requires the access token (or Firebase family auth). Plain
   `http://` AI base URLs on public hosts are refused.
   - **Enforced by:** `canChangeAiSettings()` in `server.mjs`,
     `plainHttpPublicHost()` in `lib/ai-provider.mjs` and
     `src/js/firebase-backend.js`, tested by `tests/server.test.mjs` and
     `tests/firebase-backend.test.mjs`. (#37, G14, threat model §7)

## Data and secrets

8. **Secrets live only in the environment or a `0600` file (or Firebase
   Auth/Firestore in Firebase mode).** They never appear in the family
   document, an export, a backup, or a log. Zero plaintext personal emails
   appear in Firebase rules, build scripts, or client bundles.
   - **Enforced by:** `scripts/backup.mjs` (`secrets.json` exclusion),
     `tests/security-baseline.test.mjs` (planted fake token/key sweep across
     responses, logs, and backup archives + Firebase zero-PII guard), and
     `tests/firebase-backend.test.mjs`. (TB6, FB-2)
9. **File modes:** private folders `0700`, private files and backup archives
   `0600`, with `chmod` after each write, because the umask narrows the mode a
   write asks for.
   - **Enforced by:** `ensurePrivateDir()` / `writeFileAtomic()` in `server.mjs`
     and `scripts/backup.mjs`, tested by `tests/server.test.mjs` and
     `tests/security-baseline.test.mjs`. (G7)
10. **Every stored field has a `document.js` rule (and `firestore.rules`
    parity), and documents are validated on load, import, and save.** Unknown
    fields are capped (`20` keys / `64 KB`; `<= 40` keys in Firestore) and
    orphan/`__proto__` keys are stripped.
    - **Enforced by:** `validateDocument()` and `stripOrphanLearnerKeys()` in
      `src/js/document.js`, `isValidFamilyState()` in `firestore.rules`, tested
      by `tests/import-validation.test.mjs`, `tests/firebase-backend.test.mjs`,
      and `tests/security-baseline.test.mjs`. (G11, HAR-38, HAR-39)
11. **Sync rules:**
    - adopt a server document as the tab's own write only if its version
      moved forward;
    - never mark a change saved before the server confirms it.
    - **Enforced by:** `store.js`, `server.mjs` (`If-Match` / `412`), and
      `firebaseSaveState()` (`currentDocument.updateTime`), tested by
      `tests/store-unload.test.mjs`, `tests/store-conflict.test.mjs`,
      `tests/server.test.mjs`, and `tests/firebase-backend.test.mjs`.
      (HAR-43, HAR-44)

## AI and external content

12. **Every prompt goes through `ask()` or `askJson()`,** so browser and
    server redaction both apply (`redactNames()`, plus `includeNotes` gated to
    `analysis` and `review`). Stored names are split on all punctuation, and
    tests cover each name shape.
    - **Enforced by:** `tests/security-baseline.test.mjs` (`src/js/ai.js` scan
      verifying `backend.chat()` is only called via `ask()`/`askJson()`),
      `tests/ai.test.mjs`, `tests/server.test.mjs`, and
      `tests/firebase-backend.test.mjs`. (G9, HAR-41)
13. **External content is pinned and verified, with zero runtime npm
    dependencies:** the taxonomy by commit and SHA-256, dev dependencies via
    `npm ci`, and outbound URL hosts restricted to an explicit allowlist.
    - **Enforced by:** `lib/taxonomy-pin.mjs`, `tests/taxonomy-pin.test.mjs`,
      and `tests/security-baseline.test.mjs` (zero `dependencies` + outbound host
      allowlist). (G10)

## Process

14. **Containers run as a non-root user (`USER node`, uid `1000`).**
    - **Enforced by:** `Dockerfile`, `scripts/ci-local.mjs`
      (`verifyDockerfileContract()` + container smoke test), and
      `tests/security-baseline.test.mjs`. (G13)
15. **New attack surface updates the threat model, and sensitive changes get
    an adversarial review.** A PR that adds a route, a stored field, an external
    call, or a secret updates `docs/security/THREAT-MODEL.md`; PRs touching
    security-sensitive modules require an adversarial review pass.
    - **Enforced by:** `.github/pull_request_template.md` checklist and
      `CONTRIBUTING.md` release/security review rules (manual governance; see
      `CONTRIBUTING.md` for why threat-model judgement and owner sign-off on
      residual risks `R1`–`R9` are not automated).
16. **Tests run with a fake token and a fake key set,** and assert that neither
    appears in any response, backup archive, or log line.
    - **Enforced by:** `tests/security-baseline.test.mjs` (runs in
      `npm run check` under 30 seconds without a build) and `tests/server.test.mjs`.
