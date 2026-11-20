# Threat-model gaps: reproduction and fixes (HAR-35)

The gaps from [THREAT-MODEL.md](THREAT-MODEL.md) section 5, most severe
first, one per ticket. Line numbers are those of `main` at `fc59f0b`. Every
token and key below is a placeholder; use fake ones.

The sandbox used throughout:

- **Default host:** `npm start` with no environment variables, which means
  loopback on port 4173 with no token.
- **Shared host:** `HARRINGTON_HOST=0.0.0.0` and a 16+ character
  `HARRINGTON_ACCESS_TOKEN`.
- **Second device:** curl with `--interface` set to the host's non-loopback
  address (written `192.0.2.2` below).
- **AI provider, for G5, G9 and G14:** add `HARRINGTON_AI_BASE_URL` and
  `HARRINGTON_AI_MODEL` pointing at a stub that records each request, such as
  `node tests/e2e/mock-ai-server.mjs --port 4311` (its `GET /__log` lists every
  prompt it received) with `HARRINGTON_AI_BASE_URL=http://127.0.0.1:4311/v1`
  and any model name. Without
  them, `/api/ai` answers 503 "AI is not configured" and those steps cannot
  show anything.

**Count: 1 Blocker, 3 Major, 10 Minor.** The findings the exploratory tester
already filed (HAR-38 to HAR-41, HAR-43, HAR-44) are listed in the threat
model and not repeated here.

## Blocker

### G1: the default loopback server answers any Host name (DNS rebinding)

- **Status:** fixed (HAR-46). `hostAllowed()` now checks `Host` on every
  request regardless of bind address, accepting only `localhost`, valid IPv4
  and bracketed IPv6 literals, the bind and published names, and
  `HARRINGTON_ALLOWED_HOSTS`, and refusing missing, duplicate or malformed
  `Host` headers with `400` or `421`. A default loopback server now answers
  `421` to `rebind.attacker.test` across `/`, `/login`, `/api/health` and
  `/api/state` (`tests/server.test.mjs`). The lines below describe `fc59f0b`.

- **Code:** the Host allowlist applies only once the server is shared
  (`server.mjs:550`, `if (!shared) return true`). `tests/server.test.mjs` "a
  loopback server answers to any host name, as before" pins this behavior.
- **Who is exposed:** a family running Harrington on one computer with no
  token (the default) that opens a hostile page in that computer's browser.
  After the rebind, the page and Harrington share an origin, so
  `Sec-Fetch-Site` reads `same-origin` and the `/api/state` write check
  passes.
- **Browsers:**
  - Chrome, Edge and recent Firefox ask before a public page reaches a
    loopback address (a local-network permission prompt). That lowers the
    risk but does not remove it, because a family member can allow it.
  - Safari was not checked.
  - The reproduction below skips the browser's own defenses, so it shows what
    the server allows. No browser's behavior was tested here.
- **With #37:** its settings writes are allowed from a loopback socket, so a
  rebinding page could repoint the AI provider and receive the stored key
  (THREAT-MODEL.md section 7).
- **Reproduce:**
  1. Start the default host.
  2. Run `curl -H 'Host: rebind.attacker.test' http://127.0.0.1:4173/api/state`.
     It returns the whole family document.
  3. Launch Chromium with
     `--host-resolver-rules="MAP rebind.attacker.test 127.0.0.1"`, which
     stands in for the rebinding DNS answer.
  4. Open `http://rebind.attacker.test:4173/`. From that page, run
     `fetch('/api/state')`, change a learner's name, and `PUT` the document
     back with `If-Match` set to the ETag. Observed: the read lists the
     learners and the write returns 204.
  5. For comparison, the same request to the shared host answers 421.
- **Fix:**
  1. Always check Host, whatever the bind address. Accept `localhost`,
     loopback addresses, IP literals, the published and bind names, and
     `HARRINGTON_ALLOWED_HOSTS`.
  2. Flip the pinned test to expect 421 for a foreign name on a loopback
     server.
- **Until then:** set `HARRINGTON_ACCESS_TOKEN` even on one computer. A
  foreign Host then gets 401, because the cookie belongs to the real host
  name. This is item 1 of the family checklist.

## Major

### G2: an uploaded recording's Content-Type is served back inline

- **Status:** fixed (HAR-47). `PUT /api/audio/<key>` now normalises the header
  to an allowlist of clean `audio/*` essence types (`audio/webm`, `audio/ogg`,
  `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/wave`, `audio/x-wav`,
  `audio/aac`, `audio/x-m4a`, `audio/flac`), storing anything else as
  `application/octet-stream`. `GET` and `HEAD /api/audio/<key>` re-check the
  stored `.meta.json` sidecar (covering older folders and restored backups),
  always send `Content-Security-Policy: sandbox`,
  `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`, and force
  `Content-Type: application/octet-stream` with
  `Content-Disposition: attachment` whenever the stored type is outside the
  allowlist (`tests/server.test.mjs`). The lines below describe `fc59f0b`.

- **Code:** `server.mjs:764` stores the request's `Content-Type`. `:748`
  serves it back with no `X-Frame-Options`, no CSP and no
  `Content-Disposition`.
- **Who is exposed:** a guest with a borrowed or lost signed-in device, or
  anyone on a server without a token, can plant a script that runs as
  Harrington. The script keeps working after the token is changed, and a
  backup restore brings it back.
- **Reproduce:**
  1. From a signed-in device, run:

     ```js
     fetch('/api/audio/x', {
       method: 'PUT',
       headers: { 'Content-Type': 'text/html' },
       body: '<script>fetch("/api/state").then(r=>r.text()).then(t=>document.title="LEAK "+t.length)</script>',
     })
     ```

     It returns 204.
  2. Open `/api/audio/x`. The title becomes "LEAK 890": the script ran and
     read the family document.
- **Fix:**
  1. Accept only `audio/*` types. Store anything else as
     `application/octet-stream`.
  2. Serve recordings with `Content-Security-Policy: sandbox`,
     `X-Frame-Options`, and `Content-Disposition: attachment`, unless the
     stored type is `audio/*`.
  3. Add a server test.

### G3: `/login` has no throttling, no failure log and no entropy floor

- **Status:** fixed (HAR-48). Startup now refuses `HARRINGTON_ACCESS_TOKEN`
  values shorter than 22 characters, containing spaces or non-printable
  characters, using fewer than two character classes, or having fewer than 8
  distinct characters. `/login` tracks failed attempts per normalised socket
  `remoteAddress` (bounded to 1,024 entries, ignoring `X-Forwarded-For`),
  enforcing exponential backoff after five failures (`1s` doubling up to `60s`,
  answering `429` with `Retry-After`) and logging one warning line per `401` or
  `429` with the source address and failure count, never the submitted or
  expected token (`tests/server.test.mjs`). The lines below describe `fc59f0b`.

- **What happens:** any 16-character token is accepted, including a
  dictionary phrase. One device can make about 590 guesses a second, and
  nothing is logged.
- **Reproduce:**
  1. Send 2,000 wrong `POST /login` requests from `192.0.2.2`, 32 in
     parallel. All get 401, in 3.4 s.
  2. The right token still works straight away.
  3. The server log has no line for any of the failures.
- **Fix:**
  1. Per-address backoff: after 5 failures, double a delay up to 60 s and
     answer 429.
  2. Log each failure with the source address, never the token.
  3. Refuse tokens below about 128 bits, such as fewer than 22 base64url
     characters or a single character class.
  4. Add server tests.

### G4: family data leaves the host in plaintext, with no warning

- **What happens:** exports (often emailed), backups (often on a USB stick)
  and the host disk (a lost laptop) all hold notes, transcripts, recordings
  and the PIN hash in plain text. A 4-digit PIN falls out of the hash in
  0.011 s.
- **Reproduce:**
  1. Run `npm run backup`.
  2. Extract the archive with `tar -xzf`.
  3. Run `grep` for a word from a parent note in `data/family-state.json`.
     It is there in plain text.
  4. Export from the app: the same content is in the file.
- **Fix:**
  1. The family checklist in `docs/DEPLOYMENT.md`: disk encryption, an
     encrypted backup drive, don't email exports.
  2. A warning in the Export dialog.
  3. Later, optional passphrase encryption for exports and backups.

## Minor

### G5: `/api/ai`, lesson writes and recording writes skip the write guard

- **What happens:** these routes skip the `Sec-Fetch-Site` and JSON
  content-type checks that `/api/state` has. On a server without a token, any
  web page can make the server call the AI provider, which spends credit and
  runs the page's prompt.
- **Reproduce:** run

  ```bash
  curl -H 'Content-Type: text/plain' -H 'Sec-Fetch-Site: cross-site' \
    -X POST -d '{"messages":[{"role":"user","content":"x"}]}' \
    http://127.0.0.1:4173/api/ai
  ```

  It returns 200, and the provider receives the request.
- **Fix:** one guard for every write route. `Sec-Fetch-Site` must be
  `same-origin` or `none`, and JSON routes must be `application/json`.

### G6: no Content-Security-Policy or Referrer-Policy on app pages

- **What happens:** the resource links (Khan Academy, YouTube, Wikipedia,
  BBC) receive the host's origin, such as the tailnet name. If an escaping
  slip ever happens, no CSP limits what the injected script can do.
- **Reproduce:** run `curl -I http://127.0.0.1:4173/`. It shows only
  `X-Content-Type-Options` and `X-Frame-Options`.
- **Fix:**
  1. Send `Referrer-Policy: no-referrer` on every response.
  2. Add a CSP: `default-src 'self'; script-src 'self' 'sha256-…'` (the hash
     covers the inline error script in `index.html`), plus
     `object-src 'none'; frame-ancestors 'self'; base-uri 'none'`.
  3. Add a test that asserts the headers.

### G7: data folder, files and backups are readable by every local user

- **Reproduce:** with umask 022, run `ls -l data/private backups`. Folders
  are 0755; `family-state.json`, recordings and archives are 0644.
- **Fix:**
  1. Create folders with mode 0700.
  2. Write files with mode 0600, using `chmod` after the write because the
     umask narrows the mode given to `writeFile`.
  3. Create backup archives with mode 0600.

### G8: one static 400-day cookie for every device

- **What happens:** the cookie is the same on every device. A lost device can
  be signed out only by changing the token for everyone.
- **Reproduce:**
  1. Sign in from two browser contexts. The cookie value is identical.
  2. The only way to revoke it is to change `HARRINGTON_ACCESS_TOKEN`.
- **Fix:**
  1. A random session id per device, stored on the server.
  2. A "Signed-in devices" list with sign-out.
  3. A shorter lifetime that renews on use.

### G9: `includeNotes` is trusted as the request states it

- **What happens:** any script on the origin (see G2) or a bug in a view can
  send the parent's notes to the provider.
- **Reproduce:** `POST /api/ai` with `includeNotes: true` and a stored note
  quoted verbatim. The note reaches the provider.
- **Fix:**
  1. With #37, accept the flag only for the `analysis` and `review`
     capabilities.
  2. Count opted-in requests in the signed-in health response.

### G10: the taxonomy is downloaded from a moving branch with no integrity check

- **Status:** fixed (HAR-55). `lib/taxonomy-pin.mjs` pins a commit and the
  SHA-256 of each file. The server serves a cached file only if it matches;
  one that does not (including a cache filled from another upstream) is
  downloaded again at the pin, and a download that does not match is refused
  and reported in `/api/health`. A custom upstream is allowed with a warning,
  no check and its own cache folder, so unsetting it serves only the verified
  pin. The repro below now gets the pinned files back, not the other
  server's. How to move the pin: [docs/CURRICULUM.md](../CURRICULUM.md). The
  lines below describe `fc59f0b`.

- **Code:** `server.mjs:37` defaults the upstream to `@main`. `:503`
  downloads the files and caches the first answer for good.
- **Reproduce:** point `HARRINGTON_TAXONOMY_UPSTREAM` at any server. Its
  `topics.json` is cached and served.
- **Fix:**
  1. Pin a commit.
  2. Ship the expected SHA-256 of each file and refuse a mismatch.
  3. Document how to refresh the files.

### G11: the validator keeps unknown top-level fields and non-learner keys

- **What happens:** a crafted import can carry up to the 5 MB body limit of
  hidden data, which persists and is re-exported.
- **Reproduce:** save, or import, a document with:
  - `"smuggled"` holding 4.9 MB of text;
  - `records: { "__proto__": [ … ], "not_a_learner": [ … ] }`.

  The save is accepted (204), and both are kept.
- **Fix:**
  1. Cap unknown fields, for example at 64 KB in total, and list them in the
     import preview.
  2. Drop per-learner keys that are not a learner id.

### G12: the first person to press Grown-ups sets the family PIN

- **What happens:** a child can set the PIN before a parent does, and there
  is no limit on wrong attempts.
- **Reproduce:**
  1. In a family with no PIN, open the child view.
  2. Press Grown-ups and type any 4 digits twice. They become the PIN on
     every device.
- **Fix:**
  1. Set or change the PIN only from the parent side.
  2. Add a delay after 5 wrong tries.

### G13: the Docker image runs as root

- **Status:** fixed (HAR-58). The runtime stage creates `/data` owned by
  `node` and switches to `USER node` (uid 1000). The CI `image` job checks the
  image user, that the server process is uid 1000, and that a save lands in a
  fresh volume. Data written by an older root-run image needs a one-time
  `chown -R 1000:1000`; DEPLOYMENT.md ("The container runs as `node`") has the
  commands for a named volume and a bind-mounted folder.
- **Code (before the fix):** the final stage of `Dockerfile` has no `USER`.
- **Fix:**
  1. Add `USER node` and `chown node /data`.
  2. Document how to fix the volume's ownership for existing installs.

### G14: a plain `http://` AI base URL on a public host is accepted

- **Code:** `aiSettings()` (`server.mjs:315`) does not check the scheme.
  Found by code reading.
- **What happens:** with a public host over plain HTTP, the key and every
  prompt cross the internet unencrypted. Plain HTTP that stays on the
  computer or the home network is fine:
  - loopback;
  - the README's Docker address,
    `http://host.docker.internal:11434/v1` (`README.md:231-232`);
  - private addresses (`10/8`, `172.16/12`, `192.168/16`, the tailnet's
    `100.64/10`, `fc00::/7`);
  - `.local` names.
- **Reproduce:** start with
  `HARRINGTON_AI_BASE_URL=http://203.0.113.10/v1` (a documentation address
  standing in for a public host). The server starts and sends requests there
  without a warning.
- **Fix:**
  1. Refuse plain `http://` only when the host is public; allow, or only warn
     for, loopback, `host.docker.internal`, private addresses and `.local`
     names.
  2. #37's base-URL validation is the place for this check.
