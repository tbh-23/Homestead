# Changelog

All notable changes to Harrington are documented here. This project loosely
follows [Keep a Changelog](https://keepachangelog.com/). Harrington has not
tagged a release yet; everything below is on `main`.

## [Unreleased]

### Added
- Expanded the decodable book bank, picture library, import validation and CLI (`tools/decodable-books/make-books.mjs`) for generated phonics books (HAR-67, HAR-45).
- Plaintext export warning dialog (`openExportDialog()` in `src/js/views/shell.js`) advising families to store exported JSON files on an encrypted drive and never email them, alongside updated disk and backup encryption guidance in `docs/DEPLOYMENT.md` (G4, HAR-49).

### Changed
- Switched user-facing copy, AI spelling instructions, prompts and contributor documentation to Australian English, with a regression guard in `tests/copy.test.mjs` (HAR-68).

### Security
- Hardened Firebase Hosting & Cloud Firestore deployment (`HAR-69`, `HAR-35`): added a Firebase-native deployment addendum to `docs/security/THREAT-MODEL.md`, gated Firebase access by SHA-256 email digest with zero plaintext email exposure, capped `/families/default` top-level keys (`<= 40`) in `firestore.rules`, separated `create, update` vs `read, delete` in `storage.rules`, and superseded multi-device local server cookies (`G8`, `HAR-53`) with Firebase Auth.
- Fixed learner-name redaction in `src/js/redact.js` so nicknames in brackets or quotes (`Alexander (Xander) Quill`, `Elizabeth "Lizzy" Fenn`), comma-joined names (`Ivy, Rose`), and control-separated words are redacted consistently before any AI request (`HAR-41`).
- Capped unrecognised top-level family document fields to 20 keys / 64 KB combined JSON, surfaced them in the Import preview dialog, and stripped orphan/prototype keys (`__proto__`, `constructor`, non-learner IDs) from per-learner maps on load, import, and save (`G11`, `HAR-56`).
- Moved child-view PIN creation and management exclusively to the parent side (desktop sidebar and mobile learner menu) and added exponential lockout backoff after 5 wrong tries (`15s` doubling up to `5m`, persisted across modal close/reopen) (`G12`, `HAR-57`).
- Removed the unused upstream preview telemetry shim from `src/index.html` and tightened `esc()` HTML-escaping guards across all views (HAR-11).
- Enforced the `Host` allowlist on loopback bindings too, rejecting missing, duplicate or malformed `Host` headers (G1, HAR-46).
- Normalised `/api/audio/` uploads and `.meta.json` sidecars to an explicit `audio/*` allowlist, falling back to `application/octet-stream` with `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` (G2, HAR-47).
- Raised the `HARRINGTON_ACCESS_TOKEN` startup entropy floor (22+ printable ASCII characters, mixed classes, 8+ distinct characters), throttled repeated `/login` failures per socket address with exponential backoff (`429 Retry-After`) and logged failures without tokens (G3, HAR-48).

### Fixed
- Fixed phone and polish defects (`HAR-42`): eliminated horizontal dashboard scroll at 360–412 px with `min-w-0` grid/flex items, prevented `[object Object]` on empty or `null` AI responses in "Explain simply" and "Make a mini-quiz", fixed 360 px wrapping on Records headers and Topic pages, added `[overflow-wrap:anywhere]` to learner name slots, capped calendar day extras at 10 with a "Show all" toggle, cleared stale confirmation toasts when an async save is refused, and named specific mutations in multi-device conflict toasts.
- Hardened server-side security defaults across write guards, headers, file permissions, note opt-in accounting and AI provider URLs: enforced `Sec-Fetch-Site` and `application/json` checks across `/api/ai`, `/api/lessons/`, `/api/audio/` and `/api/state` (G5, HAR-50); added `Referrer-Policy: no-referrer` on all responses and tightened the app shell `Content-Security-Policy` (G6, HAR-51); restricted private data directories to `0700` and saved files and backups to `0600` (G7, HAR-52); limited `includeNotes` to `analysis` and `review` with an opt-in count in signed-in `/api/health` (G9, HAR-54); and refused plain `http://` AI base URLs on public hosts while still allowing loopback, Docker and local network addresses (G14, HAR-59).

### Added (earlier)
- Decodable books (HAR-45), with no AI provider. A learner's **Reading**
  section (sidebar **Reading & books**, or **Reading** in the learner
  selector) holds their known code: the sounds of the school's sequence they
  read (ticked one by one or a set at a time, or with **Find the level**), the
  tricky words (the default list follows the sounds until edited), their own
  sounds and words, and print preferences. The stage is worked out from the
  ticks and never stored. **Books for …** (`#learner/<id>/books`) lists the
  built-in books within the code (twelve, at least one per set through
  ee ea), those a few sounds away with what they need, **Make a new book**
  (sentence frames from a word bank, every word checked, deterministic per
  Shuffle) and a per-learner library. Books print flat (A5) or as an A4
  booklet in imposition order, in Andika (SIL OFL, bundled) with black
  outline pictures to colour in; the learner's name goes on the cover only
  when the preference is on. Stored per learner under `reading` in the family
  document (no format change). Shared modules in `src/js/phonics/`. The
  checker reads doubled consonants (ss ff ll zz tt pp mm bb dd gg nn rr) as
  one sound and refuses graphemes the sequence has not taught (oo, ar, or,
  er, igh …), split digraphs (cake, like) and "of" unless the code has them.
  A new book's cover lists only the practice sounds its words use, its title
  names the thing most of its pages are about, and its story names leave out
  the family's learners' first names. A saved book with a picture the library
  does not draw is refused on save and import, and a picture the page cannot
  draw is skipped rather than breaking it.
- Teaching guides print: **Print** in the guide's header (on the topic page
  and in the guide window) opens the whole guide as a paper page, with every
  activity written out, the check, sources as plain URLs, Marble's caveat and
  credit, and the print date. No learner's name, no AI, no request; A4 or
  Letter, in the printed lesson's type (16 px), five to seven pages for a
  typical guide.
- Teaching guides that need no AI provider. About 500 Mathematics and 550
  Science topic pages get a collapsible **Teaching guide** from Marble's
  teaching research: a summary, activities with steps and feedback for wrong
  turns, and **Check understanding** (task, question, strong answer, common
  wrong turns, response levels), with source links, Marble's own note that
  the research is "agent-authored … not empirically validated interventions"
  (verbatim, from the pinned file), and the CC BY-SA 4.0 attribution. Without an AI provider, **Open the teaching guide** comes
  before the "Needs a local AI provider" chip on the topic page, the calendar
  and the map's quest log; the observation check offers the guide's question
  as a second one. The server downloads `teaching-research.json` (23.5 MB)
  once, splits it into one file per topic and serves
  `GET /api/taxonomy/research/<topicId>`; the whole file is never sent to
  the browser. See docs/CURRICULUM.md.

- A Synology (Container Manager) runbook in docs/DEPLOYMENT.md: Package
  Center to every device signed in over Tailscale HTTPS, moving the family's
  data, updates, backups (Hyper Backup or a scheduled archive) and what the
  first start does. `compose.yaml` now reads `HARRINGTON_PUBLISHED_HOST`,
  `HARRINGTON_ALLOWED_HOSTS`, `HARRINGTON_ACCESS_TOKEN` and
  `HARRINGTON_DATA_VOLUME` (a bind-mounted folder instead of the volume) from
  `.env`, so a shared install edits no tracked file. README has an "Updating"
  procedure.

### Security
- The Docker image runs as the unprivileged `node` user (uid 1000), not root
  (GAPS.md G13, HAR-58); CI builds it and checks the user, health and a save.
  Data written by an older image needs a one-time `chown -R 1000:1000`
  (docs/DEPLOYMENT.md); the Docker restore command now does it. Files under
  `/app` are made readable by `node` whatever their modes in the build
  context, and `.env` and `backups/` are kept out of the build context.

### Fixed
- The curriculum-pin and server tests wait up to 5 seconds for a log line the
  server writes while answering a request, instead of reading the log once;
  on a busy machine the line could arrive after the response.
- The topic page no longer scrolls sideways on a phone when a topic has a
  long domain name: the header chips wrap and the columns can shrink.
- Topics in a subject Harrington has no colour for are no longer dropped
  (several views threw on one): a new subject shows in neutral grey with one
  console warning until it is added to `SUBJECTS` (HAR-55).
- Insights' "Recommended next" ranks topics within the chosen subject; a top
  six across every subject could leave a smaller subject with nothing to
  suggest though it had open topics (HAR-55).
- The calendar no longer deletes extras whose topic left the curriculum, and a
  level-set sheet holding a retired topic can still be saved (HAR-55).
- A change made just before the page was reloaded or closed is no longer
  lost while its save is still on the wire: the change stays pending until the
  server answers, a save under 64 KB keeps itself alive past unload
  (`keepalive`; one the browser refuses while an unload beacon is still
  uploading is sent again at once as a plain request), a browser without
  keepalive sends the same snapshot again as a beacon from `pagehide`, and
  when a change could not survive the page (a document too large for either,
  or a change made while a save is still on the wire) desktop browsers ask
  with their leave-page confirmation before the page is left (HAR-43).
- Restoring an older backup while a tab is open is no longer silently undone
  by that tab's next change. The tab recognised the restored document as one
  of its own earlier writes and saved its whole state over it; now a server
  document counts as the tab's own write only when its version is newer than
  the last one the tab saw, so the tab reloads the restored copy and shows the
  "Another device saved changes first" toast with Try again. Coming back to a
  tab after a restore reloads the restored copy too. The restore instructions
  say to close every Harrington tab first (HAR-44).

### Changed
- **Curriculum refresh: the Marble Skill Taxonomy moves to its 24 October 2026
  revision** (`7bd8b67`, from `96a7933` of 8 July). 1,590 → 1,845 topics,
  3,221 → 3,941 prerequisite links, 183 → 176 domain summaries, and 8 → 9
  subjects: **Geography** (22 topics) is new; Mathematics +73, English +45,
  Computing +31, Personal & Social Development +29, Science +29, History +19,
  Life Skills +7. 113 topics moved their starting age, 44 were renamed and 34
  reworded. **Today's choices may differ after the refresh**: daily choices,
  the calendar track, sections and recommendations follow the new ages. A
  section pass already recorded stays keyed to `Subject|Domain|age` as it was
  then, so a topic that moved age band now sits in a section that pass does
  not cover. An existing install moves to the new revision by itself: on first
  use the server finds its cached files do not match the pin and downloads the
  pinned ones. The trade-off, accepted: a machine with an old cache and no
  route to raw.githubusercontent.com cannot load the curriculum until it can
  reach it, rather than serve the old, unverified files (HAR-55).
- One topic was retired, `mt_3XJkeIn6J6` ("Estimating answers (age 7+)").
  Family data for a retired topic is kept and never refused on load or
  import; it no longer counts toward progress, daily choices or due recall and
  practice, Records lists it under **Archived topics**, and its old topic page
  says "This topic is no longer in the curriculum" (HAR-55).
- The taxonomy is pinned and checked (G10, HAR-55): `lib/taxonomy-pin.mjs`
  holds the commit and the SHA-256 of each file, the server downloads from
  that commit on raw.githubusercontent.com instead of jsDelivr `@main`, serves
  a cached file only if it matches (one that does not is downloaded again and
  replaced), refuses a download that does not match, and `/api/health` reports
  `taxonomy` and `taxonomyRevision` (the pin only when every file is
  verified). `HARRINGTON_TAXONOMY_UPSTREAM` still overrides it for
  experiments, with a startup warning that the files are not checked; they are
  cached in their own folder, so unsetting it serves only the verified pin
  again. New `npm run taxonomy:check` (run in CI) is a diagnostic that
  downloads and verifies the pinned files; `docs/CURRICULUM.md` documents the
  bump path.
- AI can be switched on one capability at a time with
  `HARRINGTON_AI_CAPABILITIES` (for example `lesson`; unset means all). Every
  request names its capability, the server refuses the rest with 403,
  `/api/health` reports `aiCapabilities`, and controls for a capability that is
  off show "Not switched on yet" while cached content still opens. New
  `scripts/ai-experiment.mjs` and docs/AI-SETUP.md run and record the
  lessons-only local experiment (HAR-26).
- Settings > AI provider sets the provider, its API key, the capabilities
  switched on and the timeout from the app, with presets for Ollama and
  Google Gemini and a connection test; no environment variables or restart.
  The key stays on the server in `secrets.json` (owner-only), is never sent
  back to the page (only its last four characters), and is left out of
  export and `npm run backup`. Values saved in the app win over the
  `HARRINGTON_AI_*` environment, and `/api/health` reports `aiSource`. Until
  an access token is set, only the computer running Harrington can change or
  test them, and only while it is not shared: a server bound beyond loopback
  or published under another name (such as behind `tailscale serve` or
  Caddy), a request carrying a proxy's forwarding headers, or one under a host
  name other than this computer's (DNS rebinding), needs the token (HAR-26).
- Calendar follow-ups from the HAR-18 review: rest days and breaks pause the
  daily rhythm (no pick-one choices; the dashboard and calendar name the next
  learning day), Extra practice opens its own topic's retries, a done day that
  becomes a rest day can still be reopened, the stretch only suggests
  unlocked topics, other days say "New on <weekday>", and a per-learner
  Catch-up pace setting (Catch-up first, the default, or Mixed).
- Harrington can be shared with the family's other devices: `HARRINGTON_HOST`
  chooses the bind address, `HARRINGTON_ACCESS_TOKEN` makes `/api/*` (except
  health) require a sign-in cookie set once per device by the form at `/login`
  (or a `?token=` link), a shared server answers only to the family's host
  names (`HARRINGTON_ALLOWED_HOSTS`), and `/api/health` reports `host` and
  `authEnabled`. The onboarding banner, sidebar and Guide say "Shared with
  your other devices" when the server is not loopback-only.
  `docs/DEPLOYMENT.md` covers a Tailscale mesh with HTTPS (recommended), a
  Caddy proxy with an internal CA, the token, nightly backups and upgrades
  (HAR-25).
- The notification bell lists what needs a parent, computed locally per
  learner: today's picks still open after 3 pm on a home day, no evidence in
  the last 7 days, and a backup older than 7 days (`/api/health` now reports
  `backupAgeDays` from `HARRINGTON_BACKUP_DIR` or `backups/`). With no backup
  recorded it says so once, links to the README's backup section, and a dismissal
  quiets it for 30 days. It opens on the active learner with an "All
  learners" option, items are dismissed one by one or all at once, and the
  button is named "Notifications, N new" (F13). Curriculum-change detection
  and the challenge and suggestion notifications are gone (HAR-27).
- Calendar follows the family's home days and breaks (set under Home days &
  breaks); rest days schedule nothing. Unmastered literacy and numeracy topics
  below the learner's age come first, after their prerequisites. Refreshers
  come only from mastered topics, Extra practice opens spaced practice, and
  changing the start date offers to clear moved topics (HAR-18).
- Learners can be edited (name, birth month and year, color) from the learner
  selector, and onboarding and Add student take an optional birth month. Age
  counts whole years when the month is known; the map, daily choices,
  placement and calendar follow an edited age (HAR-22).
- Selecting a skill in the skill tree keeps the page and the tree where they
  are, and "Back to graph" from a topic page returns to the same skill,
  selected, at the same scroll. The selection is in the address
  (`?skill=`) and resets when the learner changes (HAR-21).
- A learner switched away from the map (from the dashboard, say) keeps the
  skill they open next: "Back to graph" from their topic page selects it
  instead of clearing it as the previous learner's (HAR-21 follow-up).
- Skill tree follow-ups: browser Back and Forward return to the tree at the
  window and tree scroll it was left at, and clear a selection made for
  another learner. The quest log keeps its own scroll when a status changes,
  lands fully in view when revealed, and has a "Back to tree" button on
  phones (HAR-21 follow-up).
- Generated lessons, print sheets, activity instructions and recall cards are
  never cached empty or malformed, open once for rapid repeat clicks, and each
  has "Generate a different version" that keeps the previous version if it
  fails. Recall cards now persist, printed sheets show topic, subject and age,
  and cached content opens without an AI provider (HAR-20).
- A first generation the server cannot save stays on screen with "Retry save"
  instead of being discarded, and is never paid for twice. Malformed recall
  cards are left out, and counted, before a session starts, and the due count
  drops entries for cards that no longer exist. Without an AI provider, the
  topic page offers "Open saved lesson" and Records shows a "Saved lessons"
  shelf (HAR-20 and HAR-13 follow-ups).
- Welcome tour, in-app Guide, printable guide and `src/docs/GUIDE.md` describe
  only what works today. AI-backed features carry one line: "Needs a local AI
  provider; see the README." The curriculum auto-update claim is gone, and the
  live transcript is labeled as using the browser's speech service (HAR-12).
- Guide is reachable on phones from a book icon in the header (HAR-12).
- Learner names no longer reach the AI provider from the prompts, and parent
  notes reach it only when the parent opts in. Prompts say
  “your child”, every learner's name is replaced with “the child” in
  transcripts and notes before a request is built, records go out as counts
  and linked topics, and the parent's notes are sent, redacted, only when
  they tick “Include my notes in this request” for that request; record
  titles are never sent (HAR-19).
- A whole-subject test or challenge for a learner with no birth year leaves
  the age out of the prompt instead of saying “aged null” (HAR-32).
- Onboarding, the first-run notification and the YouTube reference link use
  plain, accurate wording (HAR-12).

### Added
- Australian Curriculum (version 9, Foundation to Year 6). A learner can
  follow it with an optional "Australian Curriculum year level" (onboarding
  and the learner form; it defaults from age and stays editable; saved as
  `curriculum: { id: 'acara-v9', year }`). Topic pages show the content
  descriptions Marble links them to as chips ("AC9M2N01 · Year 2 · Number"),
  with the ACARA notice below them, that open the text. Topics linked to the
  learner's year (and unmastered ones at the year below) are boosted in daily
  choices, recommendations, the map list, the finder and the placement
  default, without hiding anything. Records > Australian Curriculum coverage
  lists each content description of the year with its linked topics and a
  status from the learner's records (Linked topics mastered; Evidence, from
  a record, a passed check or challenge, or practice; Not yet; a saved lesson
  is a plan and does not count), and prints as registration evidence. The
  server derives a 165 KB `/api/taxonomy/standards/acara-v9.json` from the
  taxonomy's 2.7 MB `curriculum-standards.json`, which is never sent to the
  browser. The app never waits for it at start-up (it loads in the
  background and the page renders again when it arrives), the server gives
  up on the download after 15 seconds and answers a failure from memory for
  five minutes, and a daily pick made before the list arrives is kept.
- "See how it works": interactive, hand-inked figures for Science topics for
  ages 5 to 8, on the topic page and the child view's topic card. The first
  three: a toy cart (Pushes & Pulls), ice in the sun (Sunlight warms things
  up) and a simple circuit (Building a simple circuit). Each is a
  self-contained page, `src/figures/<topicId>.html`, shown in an iframe
  sandboxed to `allow-scripts` with a no-network CSP decided on the resolved
  file, ignoring case (only the app shell is left unsandboxed, and it sends
  `frame-src 'self'`, so a figure cannot navigate away); labels start on,
  nothing is saved, and no AI provider is needed. `GET /api/figures` lists
  the pages that meet the contract in `docs/FIGURES.md`, so a new page
  dropped into `src/figures/` needs no other change. The figure engine is a
  fork of the MIT Colorfigures engine in `src/js/figures/engine.js`, with no
  links or credit text (HAR-34).
- The family document and exports carry `schemaVersion` (now 2). Ordered
  migrations in `src/js/schema.js` run when a document is loaded or
  imported: step 0 to 1 adds the field, step 1 to 2 hashes a plain
  child-view PIN (PR #38's `migratePinSettings`). Importing a file from a
  newer data format is refused with a message to update Harrington, and the
  server refuses a plain PIN at the current format.
- Topic finder (`#find`, from the dashboard and every skill tree): a
  free-text request becomes ranked curriculum topics, the unmet required
  foundations as a path for the learner, and the next ready step with open,
  add to today, plan it and find on the skill tree. No AI. Each request is
  logged per learner (last 50) and included in export and import.
- "Check mastery by observation" on every topic page works without AI: tick
  the topic's evidence items as you watch (with its suggested question and an
  optional typed or voice note). A full tick marks the topic mastered like a
  passed quiz. A section passes once every topic in it has a passed quiz or
  observation (placed or hand-set topics do not count), and its subject's
  last section passes the subject. Records and Insights
  label these checks "observed"; the child view never shows them (HAR-24).
- Level-set workbook, from the learner selector's Workbook button next to
  Placement, works without AI. For literacy and numeracy it asks "Can
  they…?" about one area at a time, at most twelve topics a sheet, starting
  each area a year below the learner's age; the parent marks each Yes, Not
  yet or Unsure. Each area moves up or down a year on its own answers, then
  the walk follows the foundations of each Not yet and says where to start.
  Saving a sheet keeps its answers only; at the end the parent sees every
  topic Yes would mark mastered, by subject, and confirms it as one undoable
  placement record. Unsure topics then wait for an observation check. Sheets
  print, answers save as you go so sittings resume, and the workbook
  suggests a pause at twenty minutes (HAR-24).
- Today's pick-one stops record evidence for the pick: the note and voice
  forms offer an opt-in "Mark curriculum coverage" checkbox, and a pick shows
  "Evidence recorded" only once a linked record claims coverage. Each stop
  also shows a parent-only "Not yet: <topic> needs <prerequisite> first" line,
  and the dashboard captures each learner's interests as chips and free text
  (HAR-17, salvaged from PR #5).
- Platform audit of 27 September 2026 (`docs/audits/`).
- Daily literacy and numeracy pick-one choices on Today's path and in the
  child view, drawn from the POC focus domains (HAR-4, PR #7).
- Growth stages (Seed, Sprout, Bud, Bloom) in place of scores, and a child
  view opened from the dashboard with no levels, XP or percentages.
- Storybook Meadow theme with self-hosted fonts.
- Map: world map of subject realms, per-domain skill tree with quest log, and
  a list drill-down (HAR-3, HAR-5, HAR-6).
- Local OpenAI-compatible AI adapter, fail-closed until
  `HARRINGTON_AI_BASE_URL` and `HARRINGTON_AI_MODEL` are set (HAR-7).
- Dependency-free Node server storing family state, lesson caches, recordings
  and the taxonomy cache under `data/private/`; Docker and Compose bound to
  loopback; CI running `npm test` (HAR-2).

### Removed
- Dead code after the stabilization wave: the unmounted Harrington Helper
  chat, the unrouted Commune and Day Sheet views, the unlinked timeline view,
  the unused section-graph helpers, unused exports and imports, and the
  ignored client model aliases; README, SECURITY, CONTRIBUTING and the POC
  notes no longer describe them. `scripts/dead-code.mjs` lists what is left
  and flags a use of another module's export whose import is missing (HAR-23).
- Hosted sign-in, cloud storage and the hosted deploy workflow inherited from
  Homestead (HAR-2).

### Fixed
- A null entry in a learner's recall cards, practice items, records or other
  lists no longer leaves the landing page on the loading screen: such entries
  are skipped, and a page that still fails to render shows the error with
  Export and a link to the records (HAR-38).
- Data saved before the server checked every save (a name over 60
  characters, a note over 50,000, a birth year before 1990) no longer blocks
  every save: data format 3 repairs it once on load, the bell lists each
  change until it is dismissed, and the server keeps the file as it was
  (`family-state.format-2.json`). An older export is checked after the same
  repair, so it imports. Save and import errors name the learner and the
  record, the refusal names the current problem, a refused change never
  shows its confirmation, one 60-character name limit applies to both
  learner forms and every save, and a data format number that is not a
  number gets its own read-only wording (HAR-39).
- On a phone, the "refused" and "could not save" toast sits above the bottom
  navigation, and the learner sheet makes room for it, so Export and Import
  stay usable; taps beside a toast reach the page, and toast buttons are
  44 px targets (HAR-40).
- A learner entry that is not an object no longer sends every page to the
  failure screen.
- The calendar's clean-up of extras whose topic is gone no longer says "Not
  saved" while the data is read-only.
- Record cards, the recordings folder and the recorder escape every value
  they put into markup, and a source test fails on any new unescaped one in
  those files (HAR-11 follow-up).
- A stored AI analysis renders through an allowlist of the tags the app
  writes, so an imported file cannot inject markup through it.
- Import checks learner ids and fields, the active learner, progress,
  records, test and challenge results, XP, interests, calendar settings, the
  PIN and notifications (`src/js/document.js`), and refuses a malformed file
  with the reason; a hostile file could run script on the Dashboard, a topic
  page and Insights, or leave the app stuck loading (HAR-10 follow-up).
- The server runs the same check on every save (422 with the reason) and
  refuses a save in a data format newer than its own or older than the
  stored document's (409); the app shows the reason instead of dropping the
  change.
- A document saved by a newer Harrington opens read-only, with a banner and
  Import disabled, instead of being written back in the older format with
  its new fields dropped.
- While the family data is read-only, every change the parent makes says
  "Not saved" (never "Record saved" or "Marked as …"), the banner sits in the
  page beside the sidebar and below the phone's top bar, both Import buttons
  are disabled, a voice note is not uploaded, and the app's own background
  writes (today's choices) are refused without a toast.
- The server removes stored parent notes from an AI request the parent did
  not opt in to, and forwards only `{ role, content }` text messages.
- The server replaces every learner name in the family document with “the
  child” in each message it forwards to the AI provider, with the same rules
  as the browser, so a prompt that missed the browser-side redaction still
  carries no name; `/api/health` reports `redaction: "server+client"`.
- A tab that loses a save to another tab or device reloads once and shows
  one toast naming what it did not keep (a status change, a record, a note),
  with "Try again" when the change can be applied again on the fresh copy.
  Daily offers a tab writes while rendering no longer raise a conflict with
  a sibling tab; HAR-27 removed the boot writes (curriculum snapshot,
  welcome notification) that used to (e2e finding F17).
- The preview banner reads the provider status from `/api/health`: "AI
  provider set up" or "No AI provider set up; everything else works". It
  never says "connected", since a configured provider can be unreachable (F4).
- A learner younger than the taxonomy's youngest band (a 3-year-old) gets
  that band's daily choices and stepping stones, and "Everything available
  is mastered" shows only when it is true (F3).
- The child view's "Plant something new" offers a topic not yet started; the
  one in progress comes back only when nothing else is open, as "Keep
  growing" (F18).
- Recent growth leaves out topics set back to "Not started" (F12).
- The Calendar page rendered blank without an AI provider (`gateAi` was
  called but not imported); a source test now checks every file that uses an
  `ai-status.js` helper imports it (HAR-18, HAR-20).
- The in-app Guide and `src/docs/GUIDE.md` no longer say the child's name is
  sent to the AI provider; README, SECURITY and both guides state the same
  data, including which requests carry the learner's exact age (HAR-19).
- README, SECURITY and both guides list every request that sends topic text
  (printables, activities, “Explain simply” and mini-quizzes included), say a
  linked discussion analysis sends the topic's age and the exact age, name
  the adaptive “excelling” flag, and keep the caveat that a nickname is sent
  as spoken (HAR-32).
- Export and Import are reachable on a phone or tablet, at the bottom of the
  learner selector, with the same preview and confirm as on a computer
  (e2e finding F6).
- Icon-only buttons are named for what they act on ("Remove learner …",
  "Delete record …", "Delete recording …", "Remove extra …"). On a phone
  every tap target there is at least 44 px: the learner selector's
  placement, edit and remove buttons get a labeled line of their own (so the
  name is no longer cut off), Switch and Add grow, the delete and remove
  buttons get a 44 px hit area around the same icon, and the "Include my
  notes" checkbox is larger in a 44 px clickable label (e2e finding F14).
- Counts are printed one way everywhere ("1,590", American grouping whatever
  the browser's locale) with the right singular or plural: the dashboard said
  "1590 topics" where the map said "1,590", and the map said "1 domains"
  and "1 required skill still sit" (e2e finding F15).
- The child-view PIN is stored and exported only as a salted SHA-256 hash
  (a random salt per family); a plain PIN from an older family document,
  another tab's save or an export is hashed whenever a document is applied,
  so no save writes it back, and a malformed hash or salt is dropped. SECURITY and both guides say plainly
  that a 4-digit PIN is a gentle barrier, not a lock (e2e finding F16).

## Forked from Homestead (2026-08-11)

Harrington started as a fork of
[Homestead](https://github.com/tbh-23/Homestead) under the MIT License.

### Inherited from Homestead 1.0.0

Most of these remain in the codebase. Features marked (AI) need a local AI
provider in Harrington; Commune and the Helper chat are disabled.

- Mastery ladder: topics, sections and subjects gated at 90%+.
- Curriculum from the Marble Skill Taxonomy's prerequisite graph, with a
  "How this connects" flow and an age-ordered timeline.
- Lessons, print & go materials and activity instructions (AI).
- Topic, section and subject mastery tests, digital or printable, with
  certificates (AI).
- Recall cards with spaced repetition (AI), and spaced practice for missed
  test questions (fed only by AI-generated tests).
- Timed challenges and parent-approved adaptivity (AI).
- Day-by-day calendar with moves, done days and extras.
- Records, voice recording with live transcript, recordings folder, and
  discussion analysis (AI).
- Insights with progress reviews (AI) and recommended next topics.
- XP, levels, badges and celebrations; notification center; streak tracker;
  downloadable guide and welcome tour.
- Commune shared teaching and the Helper chat (disabled in Harrington).
