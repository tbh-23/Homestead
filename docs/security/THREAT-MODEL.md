# Harrington threat model (HAR-35)

This is a review of Harrington as one deployed system: a host computer, a
token cookie, phones and tablets on the home Wi-Fi or a mesh VPN, a child with
the tablet, an export file that travels by email, an AI provider on the other
end and backups on a USB stick. Each earlier security change (HAR-10 data
safety, HAR-15 child-view PIN, HAR-19 prompt redaction, HAR-25 LAN and access
token, the hardening PR #32) was reviewed inside its own PR. This document
looks at how they fit together.

- **Code reviewed:** `main` at `1b9cce0` (PR #32 merged), then re-checked
  against `fc59f0b`. What landed in between changes no control cited here:
  #45 is a tool under `tools/` that the server does not serve and the image
  does not ship; #39 is copy, docs and prompt wording for a learner with no
  birth year; #33 adds the level-set workbook and its `document.js` rule.
  Line numbers are those of `fc59f0b`. Open PRs (#37, #40, #41, #42) are
  not probed. Section 7 notes what they change.
- **Method:** each control below was read in the code and checked by running
  the test that pins it. The gaps were reproduced against a sandbox deployment
  (section 8). PR descriptions were used only to find claims to check.
- **Severity:** **Blocker**: fix before a family shares Harrington beyond one
  computer, or before #37 lands. **Major**: fix in the next cycle; a realistic
  attacker gets family data or keeps access the family thinks it removed.
  **Minor**: hardening, defense in depth, or a documented limit worth closing.

## 1. Assets

| # | Asset | Where it lives | Why it matters |
| --- | --- | --- | --- |
| A1 | Family document: learner names, birth year and month, progress, records, parent notes, discussion transcripts, AI analyses, the PIN hash and salt | `data/private/family-state.json` (`HARRINGTON_DATA_DIR`), every export file, every backup | Children's personal data. Notes and transcripts can hold health, family and third-party details. |
| A2 | Recordings | `data/private/audio/*.bin` and `.meta.json`, and backups | Children's voices. They are not in exports. |
| A3 | Lesson cache | `data/private/lessons/` | Low sensitivity, but it is rendered in the app (integrity). |
| A4 | Access token, and the session cookie derived from it | Host environment (shell, `.env`, service unit); the cookie in every signed-in browser for 400 days | Whoever holds either one reads and changes A1 and A2. |
| A5 | AI provider API key | `HARRINGTON_AI_API_KEY` in the host environment (on #37: also `data/private/secrets.json`) | Billing, plus the provider account's history of family prompts. |
| A6 | Child-view PIN | Hashed in A1 | A screen gate only (SECURITY.md). |
| A7 | Integrity of the app and the curriculum | `src/` served by the host; the taxonomy downloaded from upstream into `data/private/taxonomy/` | Code and content that run in every family browser. |
| A8 | Availability of family data | One host, one data folder, backups | Loss of a child's records is the most likely harm of all. |

## 2. Trust boundaries

| # | Boundary | What crosses it |
| --- | --- | --- |
| TB1 | Browser to server (loopback, LAN or mesh, optionally through Caddy or `tailscale serve`) | Pages, `/api/*`, the session cookie, recordings |
| TB2 | Other web pages in the same browser to Harrington's origin | Cross-site requests, framing, DNS rebinding, `window.opener` |
| TB3 | Child to the parent side of the same signed-in browser | Child-view overlay, PIN, reload |
| TB4 | Server to AI provider | Prompts (topic text, ages, statistics, transcripts, opted-in notes), the API key |
| TB5 | Server to taxonomy upstream | Curriculum JSON, cached for good |
| TB6 | Files leaving and entering the host: export, import, backup, restore | A1 and A2 in transit and at rest, on USB sticks and in mailboxes |
| TB7 | Host operating system: other local users, a lost or stolen laptop, the Docker container | Data folder, backups, environment holding A4 and A5 |
| TB8 | Time: a newer or older Harrington reading the same data | Data format (`schemaVersion`) and migrations |
| TB9 | Device to device (sync): several tabs and devices saving one family document, and a restore under an open tab | Versioned saves, the 412 conflict path, the unload beacon |

## 3. Attacker profiles

| # | Profile | Starting position | Wants |
| --- | --- | --- | --- |
| P1 | Curious child with the tablet | A signed-in browser, the child view on screen | Leave the child view, mark things mastered, see the parent's notes |
| P2 | Guest on the Wi-Fi (or a shared tailnet node) | Network access to the host, no token | Read or change family data, spend AI credit |
| P3 | Malicious export or import file | The parent imports it | Run script in the app, hide data, break the app |
| P4 | Compromised or logging AI provider | Receives every prompt; controls every response | Learn about the children; inject content |
| P5 | Lost or stolen host laptop, USB backup, or mailbox holding an export | Offline access to files | Read A1 and A2, recover A4 and A5 |
| P6 | Hostile web page open in a family browser | Can run script on its own origin and steer DNS for its own name | CSRF, clickjacking, tab-nabbing, DNS rebinding |
| P7 | A later (or earlier) Harrington reading older (or newer) data | The same data folder | Loss or corruption through migration, or writing back a format it doesn't understand |

## 4. STRIDE per boundary

Columns: **threat**; **current control** (code and the test that pins it,
all run during this review); **gap** (the G-number from section 5, or
"none found"); **severity**; **proposed fix** (details in section 5).
S = spoofing, T = tampering, R = repudiation, I = information disclosure,
D = denial of service, E = elevation of privilege.

### TB1: browser to server

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| S | A device without the token reads or writes `/api/*` | Cookie gate before every `/api/*` route except health (`server.mjs:691`); HMAC-derived cookie, compared in constant time (`server.mjs:558`, `:564`). `tests/server.test.mjs` "with a token /api/* needs the cookie and static assets stay open", "login sets an HttpOnly SameSite=Strict cookie only for the right token"; `tests/e2e/access-token.spec.mjs`; `tests/e2e/api.spec.mjs`. Probed: state, taxonomy, lessons, audio, ai and settings all answer 401 to a second device. | none found | | |
| S | Token guessed online | 16-character minimum (`server.mjs:28`, `:834`); constant-time compare. SECURITY.md documents that attempts are not limited. | G3: no throttling, no log line for failures, low-entropy tokens accepted (590 guesses a second from one device) | Major | Per-address backoff, a log line for failures, entropy floor |
| S | Token leaks through a URL | Form is the main path; `/login?token=` redirects 303 to `/` with `Referrer-Policy: no-referrer` (`server.mjs:640`); the server logs no URLs. Probed: no referrer reaches the app, no log line holds the token. The link stays in browser history (documented). | Documented limit; G8 covers recovery | Minor | Keep the form primary; see G8 |
| I | Cookie or token read on the network | `Secure` when the request came over TLS or `X-Forwarded-Proto: https` (`server.mjs:586`, `:637`), HttpOnly (probed: `document.cookie` cannot see it). Plain HTTP on the LAN is documented as cleartext. | Documented limit (option 3 alone); `X-Forwarded-Proto` is trusted from any client (harmless direction; in HAR-36) | | Use option 1 or 2 |
| I | Unauthenticated health reveals deployment | Reduced health for signed-out devices (`server.mjs:674`) | Documented limit | | |
| T | Path traversal into the data folder or repository | Static paths resolved and confined to `src/` (`server.mjs:800`); lesson and audio keys base64url-encoded (`server.mjs:294`). Probed `/../` and `%2e%2e` paths: 404. | none found | | |
| T/E | Stored content executed as script on the app origin | Every view interpolates through `esc()` (`src/js/ui.js:9`); stored AI analysis through an allowlist (`ui.js:121`). `tests/isolation.test.mjs` (template scan, `esc()` breakouts, analysis allowlist); `tests/e2e/hostile-import.spec.mjs`. | G2: a recording upload stores any `Content-Type` and `GET /api/audio/*` serves it inline: `text/html` runs as Harrington. G6: no CSP as a backstop. | Major / Minor | Allowlist `audio/*`, `Content-Disposition: attachment`, `CSP: sandbox` on recordings; a CSP for the app |
| R | No record of who changed what | Versioned saves with a `writeId` (`server.mjs:186`). No per-device identity exists (one shared token). | Accepted (no accounts by design) | | Residual R4 |
| D | Disk filled through uploads | 5 MB JSON and 100 MB per recording (`server.mjs:34`); signed-in devices only | Accepted for a family; noted in HAR-36 | | |
| E | Signed-out device escalates | None possible beyond health and static files (probed) | none found | | |

### TB2: other web pages to Harrington's origin

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| S/T/I | DNS rebinding: a page re-points its own name at the host and reads and writes as same-origin | Host-name allowlist, **only once the server is shared** (`server.mjs:549`, `:550`). `tests/server.test.mjs` "a shared server answers only to the family's host names and IP addresses" passes; "a loopback server answers to any host name, as before" pins the gap. | G1: the default loopback server answers any name. Reproduced in Chromium, with `--host-resolver-rules` standing in for the rebinding DNS answer: the page read the learners and saved a change (204). That flag skips the browser's own defenses, so it shows what the server allows, not which browsers let a page get that far. Chrome, Edge and recent Firefox ask before a public page reaches a loopback address (a local-network permission prompt), which lowers the risk there but does not remove it, since a family member can allow it. Safari was not checked, and no browser's behavior was tested here. | **Blocker** | Always check Host: `localhost`, loopback and IP literals, plus the configured names |
| T | CSRF on family data | `Sec-Fetch-Site` must be same-origin or none and the body JSON (`server.mjs:212`, `:219`); SameSite=Strict cookie when the token is on. `tests/server.test.mjs` "rejects cross-site and non-JSON state writes without touching the file". | none found for `/api/state` | | |
| T/D | CSRF on the AI relay | None: `/api/ai` parses a `text/plain` body (a simple request, no preflight) | G5: with no token, any page makes the server call the provider (reproduced) | Minor | Apply the `/api/state` checks to every write route |
| T | CSRF on lessons and recordings | `PUT` and `DELETE` need a CORS preflight, which the server never grants (probed: OPTIONS gets 405) | none found (but see G5 for consistency) | | |
| T | Clickjacking | `X-Frame-Options: SAMEORIGIN` on pages and API (`server.mjs:60`, `:813`) | Recordings lack it (part of G2); no `frame-ancestors` | Minor | In G2 and G6 |
| T | Reverse tab-nabbing | Every `target="_blank"` link has `rel="noopener"` (`views/topic.js:364`, `views/notifications.js:123`); print windows are same-origin `about:blank` | none found | | |
| I | Referer leaks the host's name | Sign-in and 401 pages send `no-referrer` (`server.mjs:603`) | G6: app pages send none, so resource links (Khan Academy, YouTube, Wikipedia, BBC) get the host's origin, such as the tailnet name | Minor | `Referrer-Policy: no-referrer` on every response |

### TB3: child to the parent side

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| E | Child leaves the child view | PIN prompt (`views/kidmode.js:55`), parent shell `inert` underneath. `tests/e2e/child-view.spec.mjs` "the parent shell is inert", "Grown-ups: set a PIN the first time, then it is required". Probed: a reload or a new tab returns to the parent view (documented). | Documented: a gentle barrier, not a lock. G12: whoever first presses Grown-ups sets the family PIN, and there is no attempt limit. | Minor | Set the PIN from the parent side; OS guided access in the family guide |
| T | Child writes through the parent side | Same signed-in browser, so full access once out of the overlay (documented in SECURITY.md) | Accepted residual R2 | | Separate child sessions are out of scope today |
| I | Child reads the PIN | Salted SHA-256 only (`src/js/pin.js`); `tests/pin.test.mjs`; `tests/e2e/data-safety.spec.mjs` "export … the PIN only as a salted hash" | Documented: 10,000 guesses (recovered in 0.011 s from a backup) | | |

### TB4: server to AI provider

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| I | Learner names reach the provider | Redacted in the browser (`src/js/ai.js:48`) and again on the server from the stored names (`server.mjs:413`). `tests/server.test.mjs` "replaces every learner name in the family document before forwarding". Replayed: "Ada Fakename" and "Will" became "the child" in every body. | HAR-41 (known, a fixable bug): a stored name that carries punctuation is matched only with that punctuation, so a nickname typed into the learner's name in parentheses or quotes, and a comma-joined name, leave the machine (reproduced, see section 5). Documented limits: a nickname that is not part of the stored name ("Addy"), other people ("Grandma Odile in Lyon"), and a common-word name degrading text ("what the child the child be able to do") | | Fix HAR-41 in `src/js/redact.js`; the rest is residual R1 |
| I | Parent notes reach the provider without consent | Browser leaves notes out unless the parent opts in (`ai.js:447`, `:479`); the server removes stored notes, whole and line by line, unless `includeNotes: true` (`server.mjs:385`, `:409`). `tests/server.test.mjs` "removes stored parent notes unless the request says the parent opted in". Replayed: no note without the opt-in. Probed: a verbatim note is replaced by `[note removed]`, a paraphrase is not. | G9: `includeNotes` is trusted as the request states it, for any request | Minor | Tie it to the capability on #37; residual R1 |
| I | Transcripts reach the provider | Sent whenever the parent asks for an analysis; documented | Accepted (R1) | | |
| I | Cookie, client IP or other headers forwarded | The server builds a fresh request with only `model` and `{ role, content }` (`server.mjs:362`, `:446`). Logged at the provider: `Content-Type`, `Authorization` and Node's defaults only. `tests/server.test.mjs` "refuses messages that are not { role, content: string } with 400". | none found | | |
| I | API key leaked | Key only in the `Authorization` header; provider errors are generic (`server.mjs:466`). `tests/server.test.mjs` "keeps provider failures fail-closed without leaking secrets". | G14: a plain `http://` base URL on a public host is accepted, so the key and prompts cross the internet in clear. Plain HTTP that stays on the computer or the home network (the README's Docker URL `http://host.docker.internal:11434/v1`, loopback, private addresses) is fine. | Minor | Refuse plain `http://` to public hosts only |
| T | Provider response injects markup | Responses are escaped (`ai.js:8`, views use `esc()`); stored analysis through the allowlist. Probed: `<img onerror>` from the provider rendered as text. | none found | | |
| D/T | Anyone spends AI credit | Cookie gate when the token is on | G5 (no-token cross-site), G1 (rebinding) | | |

### TB5: server to taxonomy upstream

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| T | Changed or hostile curriculum content | Only four file names (`server.mjs:36`); views escape taxonomy strings (`tests/isolation.test.mjs` "views escape learner, record and taxonomy strings"; `hostile-import.spec.mjs` "a topic title with markup shows as text") | G10, fixed by HAR-55: the default upstream is the commit pinned in `lib/taxonomy-pin.mjs` and each download must match its SHA-256 (`tests/taxonomy-pin.test.mjs`); a custom `HARRINGTON_TAXONOMY_UPSTREAM` is unchecked, with a startup warning and health `unchecked` | Minor | Done; see docs/CURRICULUM.md |

### TB6: export, import, backup, restore

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| T/E | Crafted import runs script or breaks views | One validator on import and on every save (`src/js/document.js:255`, `server.mjs:161`); learner colors forced to the palette. `tests/import-validation.test.mjs`; `tests/e2e/hostile-import.spec.mjs`; `tests/e2e/data-safety.spec.mjs` "import refuses files that are not a family export", "an imported analysis renders as text, not markup". Probed: markup in a name is stored and shown as text. | G11: unknown top-level fields (a 4.9 MB one was accepted), and lists under keys that are no learner (including `__proto__`), are kept and re-exported | Minor | Cap and report unknown fields; drop orphan keys |
| I | Export by email, backup on a USB stick | None: plaintext JSON and `tar.gz` | G4: no encryption, no warning at export, no guidance | Major | This PR adds the family guidance; add the warning, then optional encryption |
| I | Export or backup carries the token or the key | Neither is in the data folder on `main`. Probed: no token or key in a backup archive. On #37, `scripts/backup.mjs` leaves out `secrets.json` (code read only). | none found on `main` | | Keep `secrets.json` out (residual R5) |
| D | Restore loses data | `npm run backup`; health warns when the newest archive is over a week old (`server.mjs:269`); `tests/server.test.mjs` "health reports the age in days of the newest archive" HAR-44 (fixed, PR #49): a tab left open under a restore now reloads the restored copy and shows the conflict toast (TB9). Docker restore not run (no daemon here). | | Family checklist item 10: close Harrington on every device first |

### TB7: host operating system

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| I | Lost or stolen host laptop | None in the app; data is plaintext | G4: no disk-encryption guidance | Major | In this PR's family section |
| I | Other local users read the data | None: files 0644, folders 0755 under the usual umask (probed), backups 0644 | G7 | Minor | 0700 folders, 0600 files and archives |
| E | Container escape surface | Data in a named volume; port published on loopback | G13, fixed by HAR-58: the image runs as the unprivileged `node` user (uid 1000) and CI's `image` job checks the image user, the server's uid and a save to a fresh volume | Minor | Done; see docs/DEPLOYMENT.md, "The container runs as `node`" |
| I | Token or key in the environment | Startup log never prints the token (probed) or the key; `.env` is gitignored | Accepted; family guidance | | |

### TB8: versions over time

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| T | Older data loaded by a newer app | Ordered migrations (`src/js/schema.js`); a plain PIN hashed on load (`src/js/store.js:155`). `tests/schema.test.mjs`, `tests/family-data.test.mjs`, `tests/pin.test.mjs` "a plain PIN from an older family document migrates to the hash". Probed: the legacy sandbox document (no version, plain PIN) came back hashed after the first load. | none found | | |
| T | A stored document the validator refuses, or that hangs a view | The server validates every write (`server.mjs:161`) but not reads; the store loads `/api/state` without validating it (`store.js:184`, against `validateDocument` at `:605` for imports only). `document.js:141-142` does refuse a non-object recall or practice entry, so such a document cannot be saved, but one already on disk loads. | Known: HAR-38 (a null recall or practice entry hangs the landing route), HAR-39 (pre-#32 data blocks every save) | | Validate and repair on load |
| T | Newer data written back by an older app | Read-only in the browser (`store.js:146`); the server refuses a newer format (409) and a save older than the stored one (409) (`server.mjs:165`, `:195`). `tests/server.test.mjs` "refuses a save the app could not render (422) or a data format it does not know (409)"; `tests/e2e/data-safety.spec.mjs` read-only tests. Probed both directions with curl. | none found | | |

### TB9: device to device (sync)

Every tab on every device edits the one family document on the host. There
is no merge: a save carries the version it started from, and the server
accepts it only if that is still the current version.

| | Threat | Current control | Gap | Severity | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| T | Two devices save at once and one overwrites the other | Compare-and-swap inside the state file's write queue (`server.mjs:186`); `If-Match` required, else 428 (`server.mjs:230`); a stale save gets 412 with the current document, and the browser reloads it and names the change it lost, with Try again (`store.js:469`, `:374`). `tests/server.test.mjs` "lets only one of several concurrent writers with the same version succeed", "rejects a stale or missing If-Match without writing"; `tests/store-conflict.test.mjs` "a losing status change is named once and Try again re-applies it"; `tests/e2e/data-safety.spec.mjs` "two tabs: the losing tab says which change it discarded…". | none found | | |
| T | A tab adopts the server's document as its own earlier write when it is not | On 412, a document is taken as the tab's own earlier write only when its `writeId` is one of the tab's last 16 writes and its version is newer than the last one the tab saw (`isOwnNewerWrite`, `store.js`); otherwise the tab reloads the server copy and shows the conflict toast with Try again. The same rule applies on return to the tab, which also reloads when the version went backwards. `tests/store-unload.test.mjs` "a 412 carrying an old write of this tab at an older version"; e2e `data-safety.spec.mjs` "a backup restored while a tab is open". | Fixed: HAR-44 (PR #49). Residual: the check is the version number, so a restore is still undone if another tab's saves bring the server's version back up to the stale tab's before it edits (the server cannot tell a restore from a stale version). | | Follow-up: a restore marker or epoch in the document, so a version number alone cannot collide. The family checklist says to close Harrington everywhere before restoring. |
| D | A change in flight is lost when the page reloads or closes | The unload beacon carries the version in its body (`server.mjs:227`, `backend.js`); `tests/server.test.mjs` "accepts an unload beacon with the version in the body"; `tests/e2e/access-token.spec.mjs` saves through a real beacon. A change stays pending until the server answers: PUTs under 64 KB are sent with `keepalive` (and sent again at once as a plain request if the browser refuses the keepalive one while a beacon is uploading), a browser without keepalive beacons the snapshot in flight again from `pagehide`, and a document over 64 KB, or a change pending on top of a save in flight, gets the browser's leave-page confirmation (`handleBeforeUnload`, `store.js`). `tests/store-unload.test.mjs`; e2e `data-safety.spec.mjs` "a reload in the middle of a slow save" and "a document too large for a beacon". | Fixed: HAR-43 (PR #49). Residual: mobile browsers show no leave-page confirmation, so a family over 64 KB closed mid-save on a phone can still lose that one change. | | Follow-up: keep every family under the unload budget (compressed or chunked saves). |
| T/D | A restore or a second server under open tabs | One host and one data folder (DEPLOYMENT.md "The one rule"); never two servers on one folder or a synced folder. The server cannot see a restore. | HAR-44 fixed in the tab (row above); the server cannot tell a restore from a stale version, see the residual there | | Family checklist line: close Harrington on every device before restoring |
| R | Which device made a change | A random `writeId` per save, kept only to recognize the tab's own writes | Accepted residual R4 | | |
| E | A signed-out device joins the sync | With the token on, every `/api/state` read and write is behind the cookie gate (TB1). With it off, any device that reaches the server reads and writes the document. | none found with the token on; with it off, documented (DEPLOYMENT.md option 3, family checklist item 1) | | |

## 5. Gaps

Each gap was reproduced in the sandbox (section 8) unless it says "by code
reading". **[GAPS.md](GAPS.md) has each gap's reproduction steps and
proposed fix**, so each one can become a ticket. The practices that would
have prevented them, for HAR-36, are in [PRACTICES.md](PRACTICES.md).

| # | Severity | Gap | Boundary, profile | Status |
| --- | --- | --- | --- | --- |
| G1 | **Blocker** | The default loopback server answers any Host name, so DNS rebinding gives any web page read and write access to family data and the AI relay | TB2, P6 | Fixed (`HAR-46`, PR #63) |
| G2 | Major | A recording upload's `Content-Type` is stored and served back inline, so HTML uploaded as a "recording" runs as Harrington; it outlives a token change and comes back with a restore | TB1, P2 with a borrowed or lost signed-in device, P1 | Fixed (`HAR-47`, PR #63) |
| G3 | Major | `/login` has no throttling, no failure log and no entropy floor | TB1, P2 | Fixed (`HAR-48`, PR #63) |
| G4 | Major | Family data leaves the host in plaintext (export, backup, lost laptop) with no warning or guidance | TB6, TB7, P5 | Fixed (`HAR-49`, PR #64) |
| G5 | Minor | `/api/ai` (and lesson and recording writes) skip the `Sec-Fetch-Site` and JSON checks that `/api/state` has | TB2, P6 | Fixed (`HAR-50`, PR #66) |
| G6 | Minor | No Content-Security-Policy or Referrer-Policy on app pages | TB1, TB2, P4, P6 | Fixed (`HAR-51`, PR #66) |
| G7 | Minor | Data folder, files and backups are readable by every local user | TB7 | Fixed (`HAR-52`, PR #66) |
| G8 | Minor | One static 400-day cookie for every device; a lost device can be signed out only by changing the token for everyone | TB1, P5 | Superseded by Firebase Auth (`HAR-53` canceled, 28 Nov 2026) |
| G9 | Minor | `includeNotes` is trusted as the request states it | TB4, P4 | Fixed (`HAR-54`, PR #66) |
| G10 | Minor | Taxonomy downloaded from a moving branch with no integrity check, cached for good | TB5 | Fixed (`HAR-55`, PR #52) |
| G11 | Minor | Validator keeps unknown top-level fields and lists under non-learner keys | TB6, P3 | Fixed (`HAR-56`) |
| G12 | Minor | The first person to press Grown-ups sets the family PIN; no attempt limit | TB3, P1 | Fixed (`HAR-57`) |
| G13 | Minor | Docker image runs as root | TB7 | Fixed (`HAR-58`, PR #55) |
| G14 | Minor | A plain `http://` AI base URL on a public host is accepted (by code reading) | TB4, P2 | Fixed (`HAR-59`, PR #66) |

Count: **1 Blocker, 3 Major, 10 Minor.**

### Already known from exploratory testing (not counted above)

The exploratory tester has already reported these, so they are not gaps in
this list. They are placed in the model so the tickets can cite it.

| Ticket | Finding | Where it sits here |
| --- | --- | --- |
| HAR-38 | A null entry in the active learner's recall or practice section hangs the landing route on the loading screen, with no Export available | A8 (availability), TB8. The server validates writes but not reads, and the store loads `/api/state` without validating it (`store.js:184`). `document.js:141-142` does refuse a non-object recall or practice entry, so such a document cannot be saved now, but one already on disk (written before #32, or edited by hand) loads and stops the app, with Export behind it. |
| HAR-39 | Data saved before #32 that the validator now refuses blocks every save, with no repair path, and the toast names a position rather than the learner | A8, TB8 (a later version reading older data): the server refuses with 422, so the family is stuck rather than losing data |
| HAR-40 | The persistent refusal toast covers Export, Import and the bottom navigation at 390 px | A8: the same recovery path as above, on a phone |
| HAR-41 | Redaction misses a nickname in parentheses or quotes, and comma-joined names | TB4, a fixable bug, not a residual risk. `src/js/redact.js:10` splits a stored name only on whitespace, hyphens and apostrophes (`NAME_SEP`), so other punctuation stays inside a name token, and that token matches only with its punctuation. Reproduced with `redactNames()`: stored "Alexander (Xander) Fakename" leaves a bare "Xander" in the text (only "(Xander)" is replaced); stored `Elizabeth "Lizzy" Fakename` leaves "Lizzy"; stored "Fakename, Ivy" leaves "Fakename". Fix: split stored names on any run of characters that are not letters or digits (keeping the hyphen and apostrophe variants), plus a test for each case. |
| HAR-43 | A change in flight is lost silently when the page reloads or closes before its PUT finishes | TB9, A8; fixed in PR #49 (residual on phones noted in TB9) |
| HAR-44 | Restoring an older backup while a tab is open is silently undone by that tab's next edit | TB9, TB6, A8; fixed in PR #49, family checklist line added (residual: a version brought back up by another tab, noted in TB9) |

## 6. Residual risks for the owner to sign

These remain after every gap above is fixed. They follow from the product's
design (one family secret, no accounts, an optional cloud AI). Each needs the
owner's explicit acceptance.

| # | Risk | Why it stays | Mitigation in place | Accepted by / date |
| --- | --- | --- | --- | --- |
| R1 | A cloud AI provider receives topic text, ages, statistics, discussion transcripts (a nickname that is not part of a learner's stored name, and other people's names, as spoken) and, when the parent opts in, notes | Redaction can only match names Harrington knows, and not a one-letter name (SECURITY.md); once HAR-41 is fixed, that includes a nickname typed into the learner's name; a transcript is the input the parent asked to analyze | Browser and server redaction, notes opt-in, local-provider-first rollout (#37), family guidance | |
| R2 | Anyone holding a signed-in device, a child included, has full read and write access | One family token, no accounts or roles | Child-view PIN as a screen gate; OS guided access in the family guide | |
| R3 | The child-view PIN is recoverable from any export or backup in milliseconds | 4 digits; the hash only keeps it out of plain sight | Documented in SECURITY.md | |
| R4 | No record of which device made a change | No per-device identity | Versioned saves, conflict messages | |
| R5 | When #37 lands, the AI key may live in `secrets.json` on the host disk | Needed for in-app settings | Mode 0600, kept out of export and `npm run backup` (code read on #37, not probed) | |
| R6 | Over plain HTTP on the LAN (option 3 alone), the token and cookie are readable on the Wi-Fi, and the microphone cannot work | Harrington does not terminate TLS | Runbook recommends options 1 or 2 | |
| R7 | Losing the host disk without a second-place backup loses the family's records | One host, one data folder | Backup bell, runbook | |

## 7. Near-term changes (open PRs, not probed)

- **#37 (HAR-26, in-app AI provider settings, capability allowlist).** Adds
  `PUT/DELETE /api/settings/ai` and `POST /api/settings/ai/test`, allowed when
  the token is on or when the socket's address is loopback
  (`canChangeAiSettings`, `server.mjs:447-448` on its head `3eb7e92`). An
  omitted field is left unchanged (`server.mjs:368` there), so a write that
  changes only the base URL (plus a model, if none is stored: `server.mjs:411`
  there refuses a base URL without one) keeps the stored key and sends it to the new
  address. Two paths reach that write without the token (both by code
  reading, not probed):
  - **Through the documented reverse proxies.** `tailscale serve` and Caddy
    (`reverse_proxy 127.0.0.1:4173`, DEPLOYMENT.md options 1 and 2) connect to
    Harrington from 127.0.0.1, so every family device, and every other device
    on the tailnet or the home network, looks like loopback. With the token
    off, any of them can repoint the provider and receive the key and every
    later prompt.
  - **Through DNS rebinding (G1).** A rebinding page's requests arrive from the
    loopback address with `Sec-Fetch-Site: same-origin`.

  **Ordering conditions for #37:** G1 lands before or with it; and when
  Harrington is shared (bind or published address not loopback), either drop
  the loopback exception or refuse settings writes while the token is off.
  #37 also makes `notesAllowed()` check the capability (G9), and must pass
  the guarded messages, never `body.messages`, to its provider call (its own
  merge note). `secrets.json` is written 0600 and excluded from
  `npm run backup` and the documented Docker volume backup (R5).
- **#33 (HAR-24, evidence checklist and level-set placement), merged as
  `fc59f0b`.** `levelset` is now a listed field with an outer-shape rule in
  `document.js`; the inside of a session is checked when it is read.
- **#39 (copy and docs sweep), merged as `f8c43e6`.** Its SECURITY.md
  wording on what reaches the provider matches R1 and section 4 TB4.
- **#40, #41, #42 (calendar, recall shelf, topic finder).** New stored fields
  and AI calls: each new field needs a `document.js` rule, and each new
  prompt goes through `ask()` so both redaction layers apply.

## 8. How this was checked

Sandbox on the review machine, all secrets fake:

1. **Shared host, option 3:** `HARRINGTON_HOST=0.0.0.0`, port 4400,
   `HARRINGTON_ACCESS_TOKEN` set, a data folder seeded with a **legacy family
   document** (no `version`, no `schemaVersion`, plain `parentPin`, a parent
   note naming a third person and a health detail), and
   `HARRINGTON_TAXONOMY_UPSTREAM` pinned to commit `96a7933`.
2. **Default host:** loopback, port 4401, no token, same document.
3. **Second device:** curl bound to the host's non-loopback address
   (`--interface 192.0.2.2`) and a separate Chromium context opening
   `http://192.0.2.2:4400`.
4. **Logging AI provider:** a 20-line OpenAI-compatible server writing every
   request body and header name to a file. Prompts were replayed through the
   app's own `ai.js` in the page (the `ask()` to `backend.chat()` path every
   view uses), with and without the notes opt-in, and as crafted `/api/ai`
   bodies.
5. **Crafted documents:** a newer format, a 4.9 MB unknown field, `__proto__`
   and orphan learner keys, a format-1 document with a plain PIN, markup in a
   learner name, all sent as saves (the server runs the import validator).
6. **Docker:** no daemon in the sandbox. Reviewed from `Dockerfile` and
   `compose.yaml`: `node:22-alpine` as root, data in the `/data` volume
   (`harrington_harrington-data`), port published on `127.0.0.1:4173`,
   `HARRINGTON_PUBLISHED_HOST=127.0.0.1`.
7. **Tests run:** `node --test tests/server.test.mjs tests/pin.test.mjs
   tests/family-data.test.mjs tests/isolation.test.mjs
   tests/import-validation.test.mjs tests/schema.test.mjs
   tests/hosting.test.mjs` (187 passed at `1b9cce0`, 194 at `fc59f0b` after
   #33 added tests), and the desktop project of
   `access-token`, `api`, `child-view`, `data-safety` and `hostile-import`
   e2e specs (21 passed).
8. **Review round 1 (on `fc59f0b`):** the sync rows (TB9) and HAR-41 were
   checked by reading `store.js`, `backend.js` and `redact.js` at the cited
   lines and by calling `redactNames()` with the three name shapes; #37's
   settings gate was read on its head `3eb7e92`.

---

## 9. Firebase-Native Deployment Addendum (`HAR-69`, `australia-southeast2`)

Added 28 November 2026 after Harrington's remote production hosting moved from a self-hosted home NAS to **Everything in Firebase** (`https://harrington-learning-au.web.app`, [PR #67](https://github.com/simgue/harrington/pull/67) & [PR #68](https://github.com/simgue/harrington/pull/68)). Local `node server.mjs` remains unchanged for offline development and the Playwright E2E suite.

### 9.1 Firebase Assets & Trust Boundaries

| # | Boundary / Component | Security Control Enforced | Verification |
| --- | --- | --- | --- |
| **FB-1** | **Firebase Hosting CDN** (`firebase.json`, `scripts/build-firebase.mjs`) | Automatic HTTPS TLS; pre-verified Marble taxonomy & 1,049 teaching guides built at deploy time after SHA-256 verification against `lib/taxonomy-pin.mjs`; `APP_CSP` (with Firebase Auth/Firestore/Storage/Gemini `connect-src` origins), `FIGURE_CSP` (`sandbox allow-scripts`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`. | `tests/firebase-backend.test.mjs`, live header verification on `harrington-learning-au.web.app` |
| **FB-2** | **Firebase Authentication & Invite-Only Beta Gate** (`src/js/firebase-backend.js`, `firestore.rules`, `storage.rules`) | Google OAuth 2.0 & Email/Password via Identity Toolkit (`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`); short-lived 1-hour JWT `idToken` + individually revocable per-device `refreshToken` (superseding `G8` / `HAR-53`). **Zero plaintext email** appears on the sign-in modal, client JS bundle, or git repository; access is gated client-side and server-side by the lowercase email's SHA-256 hex digest (`3630ac935b7662b92f7637f6ca90495fd5fe6d1fb563ae61e4a143d7c4b43edf`) plus `email_verified == true`. Unverified email/password accounts fail closed at Firestore and Cloud Storage. | `tests/firebase-backend.test.mjs` (asserts 403 on uninvited accounts and zero `@gmail.com` leaks across rules/code) |
| **FB-3** | **Cloud Firestore (`australia-southeast2` Melbourne)** (`firestore.rules`) | Default-deny catch-all (`match /{document=**} { allow read, write: if false; }`); every collection under `/families/default/**` enforces `isFamilyMember()` via Firebase-signed JWT claims; `/families/default` validates schema types, `students.size() <= 20`, `notifications.size() <= 200`, `data.keys().size() <= 40` (G11 parity), monotonic `version == resource.data.version + 1` on `update`, and forbids `delete`. `firebaseSaveState()` enforces `validateDocument()` and Firestore `currentDocument.updateTime` preconditions (`412` on conflict). | Red-team audit (`firebase-security-rules-auditor`), `firebase deploy --only firestore:rules --dry-run` |
| **FB-4** | **Cloud Storage for Firebase** (`storage.rules`) | Default-deny catch-all; `/families/default/audio/{audioId}` separates `allow read, delete` from `allow create, update`, enforces `isFamilyMember()`, `audioId` length `1..500`, `request.resource.size <= 100 MiB`, and the 10-type `audio/*` MIME allowlist (`HAR-47`). *(Note: remote Cloud Storage bucket provisioning requires Firebase Blaze; Hosting, Auth, and Firestore run on Spark.)* | Red-team audit, `tests/firebase-backend.test.mjs` |
| **FB-5** | **Browser to Gemini AI API** (`src/js/firebase-backend.js`) | `firebaseChat()` enforces the same client-side redaction layer as `server.mjs`: replaces all stored learner names via `redactNames()` and strips verbatim stored parent notes (`>= 20` chars) unless `includeNotes === true` on `analysis` or `review`; refuses plain `http://` AI base URLs on public hosts (`HAR-59`). | `tests/firebase-backend.test.mjs` |

### 9.2 Additional Residual Risks for Firebase Mode (for Owner Sign-Off)

| # | Risk | Why it stays | Mitigation in place | Accepted by / date |
| --- | --- | --- | --- | --- |
| **R8** | **Firebase ID/refresh tokens live in `localStorage` and the Gemini API key is readable by the authenticated browser session** | Zero-backend static Firebase architecture (no Cloud Functions relay) keeps hosting at A\$0/mo and avoids server-side secret infrastructure. Any XSS in the app origin would therefore have access to the signed-in session token and AI key. | Strict `APP_CSP` (`script-src 'self'`), 100% `esc()` isolation scanner (`tests/isolation.test.mjs`), `FIGURE_CSP` sandboxing, and short-lived 1-hour JWTs + Google Account session revocation. | |
| **R9** | **A signed-in browser's email hash is present in client-side JS and public rules** | Client-side allowlist rejection happens before Firestore calls, and rules live in the public repo. A SHA-256 hash without salt can in theory be tested offline against a known candidate email address (though it prevents casual scraping and never displays the email on screen). | Server-side enforcement still requires a valid Google/Firebase-signed OAuth/ID token for that exact verified email (`request.auth.token.email_verified == true`), so knowing the email address grants zero access without controlling the Google account. | |
