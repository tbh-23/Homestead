# Harrington PM handover

Written 2 November 2026 by the outgoing product-manager agent (a Claude Code
session) for the incoming PM agent. It is a working document, not marketing:
read it top to bottom once, then keep `docs/`, Linear and `CHANGELOG.md` as the
living sources. If you read one section first, read §11.

## 1. Cutover state

| Item | State at handover |
|---|---|
| `main` | `d70becb` (the PR #59 merge, CI green when this document merged) plus the merge of this document |
| Open pull requests of ours | none (`#4` is a stale pre-existing draft from another tool; leave it or close it, it has no value) |
| Linear | HAR-66 Done, HAR-45 In Progress (slice B open as HAR-67), HAR-34 and HAR-35 In Review awaiting the owner, HAR-11 In Progress (old, see §8) |
| Dev sessions | all archived; nothing running |
| Scheduled check-ins of the outgoing PM | canceled at cutover |
| Owner's machine | runs `main` from the repo on a Mac; restarts the server by hand after `git pull` |

Everything the owner asked for up to the handover is on `main`. The last
merges were:

| PR | Merged as | What |
|---|---|---|
| #59 | d70becb | Decodable books in the app (HAR-66): per-learner Reading setup keyed off the known code, book bank, template generator, print view, library |
| #58 | 50d2a7f | Lockfile-only `npm audit fix` (dev tooling) |
| #57 | 0988659 | CLI decodable books: black text, color-in pictures, review fixes |
| #56 | 52fcf45 | CLI decodable books generator, first version |
| #55 | 1f82528 | Synology runbook, non-root Docker image, compose `.env`, CI `image` job |
| #54 | 5929e88 | Printable teaching guides |
| #51 | 8afe8d6 | Australian Curriculum v9 codes, year mode, coverage report |
| #53 | 811c740 | Follow-ups to the taxonomy refresh |
| #50 | 3dcb82e | Teaching guides from Marble's research, no-AI fallback |
| #52 | 85569f4 | Taxonomy refresh to Marble's 24 Oct 2026 revision, integrity pin, Geography |
| #37 | 6467eff | AI provider decision and in-app provider settings (HAR-26) |

### 1.1 Terms and access

- **Marble**: the publisher of the Skill Taxonomy and the teaching research
  Harrington uses (`withmarbleapp/os-taxonomy` on GitHub): ODbL 1.0 for the
  database and CC BY-SA 4.0 for the textual content, as `NOTICE` and
  `DATA-LICENSE.md` state.
- **Antigravity**: the environment the incoming PM runs in. The outgoing PM
  ran in Claude Code cloud sessions; where this document names a tool that
  exists only there, it says so.
- **Remote Control**: the Claude desktop feature that lets a cloud agent run
  commands in a folder on the owner's Mac. The Synology task needs an
  equivalent, or the owner at the keyboard.
- **Access**: the owner grants GitHub access to `simgue/harrington` and Linear
  access to team `Harrington`. In Claude Code cloud sessions GitHub's GraphQL
  is blocked, so `gh pr list` and `gh pr view` fail with 403; `gh api` REST
  calls work and this document uses them.

## 2. What Harrington is

A family learning app a parent runs at home for their own children. Vanilla
JavaScript ES modules in `src/js`, a dependency-free Node server
(`server.mjs`), family data in `data/private` (never committed), the Marble
Skill Taxonomy as the curriculum (1,845 topics, 9 subjects, pinned by hash),
optional AI through a provider the parent configures (Ollama, Gemini, or any
OpenAI-compatible endpoint). The owner is the only user today; the children
use it in a PIN-guarded child view.

Read in this order: `README.md`, `src/docs/GUIDE.md` (the in-app guide, kept
in step with `src/js/views/guide.js` by `tests/copy.test.mjs`),
`docs/CURRICULUM.md`, `docs/AI-SETUP.md`, `docs/DEPLOYMENT.md`,
`docs/security/THREAT-MODEL.md` and `docs/security/GAPS.md`, `docs/LINEAR.md`,
`CONTRIBUTING.md`, `CHANGELOG.md` (newest first).

Map of the code:

- `server.mjs`: static files, `/api/state` (versioned family document with
  `If-Match`), `/api/health`, `/api/ai` (capability allowlist), taxonomy and
  research endpoints, backups. No npm runtime dependencies, by rule.
- `lib/`: `taxonomy-pin.mjs` (pinned upstream revision and SHA-256 per file),
  `teaching-research.mjs` (splits Marble's 23.5 MB research file per topic),
  `ai-provider.mjs`, `remembered.mjs`, `loopback.mjs`.
- `src/js/`: `app.js` (router), `store.js` and `document.js` and `schema.js`
  (family document: key lists, validation, format migrations, now format 3),
  `data.js` (taxonomy loading), `mastery.js`, `curriculum.js` (AC v9),
  `teaching.js`, `phonics/` (decodable books: `sequence.js`, `decodability.js`,
  `bank.js`, `pictures.js`, `generator.js`, `imposition.js`, `reading.js`),
  `views/` (one file per screen; `guideprint.js` and `bookprint.js` are the
  print paths), `figures/` (interactive science figures, HAR-34).
- `scripts/`: `build-assets.mjs` (copies bundled fonts and icons into
  `src/vendor`), `taxonomy-check.mjs`, `backup.mjs`, `ai-experiment.mjs`.
- `tools/decodable-books/make-books.mjs`: the command-line book generator the
  owner uses today (see §6). `tools/figures/`, `tools/colorfigures/`: figure
  authoring (HAR-34).
- `tests/*.test.mjs`: Node unit and server tests. `tests/e2e/`: Playwright
  suite with five servers (`docs/e2e/README.md`).

## 3. The owner

- Works in short bursts, often from a phone, and tests on the Mac. Wants speed:
  the standing instruction is "keep everything merged as quickly as tested and
  possible". They do not want to be asked permission for routine work; they do
  want a message when something they are waiting for is ready, with the exact
  commands to run.
- Runs the app from `main` with `npm start`. After every `git pull` they must
  stop the server (Ctrl+C) and start it again, or the browser shows the
  "This server reads family data up to format N" toast. Tell them this each
  time a pull is needed.
- AI: Google Gemini is connected in the app (`gemini-3.8-flash`, Lessons on).
  LM Studio is installed on the Mac (OpenAI-compatible, port 1234) as the local
  alternative. Ollama is not needed.
- Printing: they print teaching guides and decodable books on A4; the booklet
  layout needs "double-sided, flip on the short edge".
- They do not yet know each child's phonics level; the app's Reading setup and
  "Find the level" helper were built for that.
- The owner is on Australian Eastern time; expect messages in that zone's
  morning and evening.
- Asks still open from them (chase gently when relevant): each child's current
  sounds; whether the cover should print the child's name (the app defaults to
  on, local only); the priming questions (geology region, what a quest
  contains); feedback on the level-set workbook; the next wave choice
  (security packs HAR-46..59 versus polish HAR-41/42 versus tooling HAR-60);
  the taxonomy pin policy (follow Marble's main or stay pinned until reviewed);
  sign-off on HAR-35 residual risks and the HAR-34 figures.

## 4. Rules that never bend

These came from the owner or from review decisions and are enforced in code,
tests or review. Break none of them.

1. No private data in the repository: no real names, no `data/private`
   contents, no backups, no screenshots of real children. Stories, fixtures
   and e2e data use made-up names only. A child's real name appeared in print
   and handwriting on the school materials the owner photographed: it is never
   written anywhere (tickets, code, docs, prompts, commit messages).
2. Learner names and parent notes never enter an AI prompt (HAR-19, guard
   tests). Books, lessons and guides are generated without them; the name is
   stamped locally at print time only.
3. The server stays dependency-free. Dev dependencies are allowed for build
   tooling and bundled fonts only.
4. No framework, no bundler, vanilla ES modules, Tailwind through the existing
   build, Lucide icons, the `el()` helper.
5. Never paste the owner's API key anywhere, never ask for it in chat.
6. Downloads from the internet go in their own empty directory and are never
   executed; Python that reads them runs with `-I`.
7. Licenses: the ACARA notice appears verbatim wherever Australian Curriculum
   text shows; Marble's teaching research shows its caveat verbatim from the
   pinned index plus the CC BY-SA 4.0 credit; no Colorfigures links or credit
   text inside the app (MIT notice in source only); the figure contract forbids
   third-party scripts and fonts.
8. Region or location data is never sent anywhere without opt-in.
9. User-facing text in Australian English, including "colour", "practise" (verb) / "practice" (noun), "organise" and "maths".
10. Never skip, disable or quarantine a test to get green. Never rewrite
    history on a branch someone else owns.

## 5. How work flows

The PM does not write product code. The PM designs, briefs, reviews the
reviewers, gates, merges, keeps Linear and the owner informed.

### 5.1 Delivery

- One dev session per unit of work, briefed with: goal, owner quote verbatim
  when there is one, files to read first, exact scope, rules above, tests
  required, how to verify by eye (render pages, look at images), branch name,
  draft PR against `main`, PR template filled from the diff. Sessions have
  been Claude Opus; use whatever Antigravity offers at that tier.
- Branch names: `simonguerin/<short-topic>` (Linear's suggested names also
  work). Draft PRs. The PR body says `Closes HAR-N` or `Related: HAR-N`
  (`docs/LINEAR.md`); `Closes` only when the ticket is finished by that PR.
- If a session dies on a usage limit, re-fire it with the same brief. The
  account has shown a seven-day limit warning at handover.

### 5.2 Review

Every PR gets an independent review by a separate agent that did not write it.
The review is written to a file (`review-prNN.md`, later rounds
`-round2.md` and so on) with numbered findings marked Blocking / Should fix /
Nit, the checks run with counts, and a last line `VERDICT: MERGE` or
`VERDICT: FIX-FIRST`. The reviewer runs the code: unit tests, the relevant e2e
specs on a separate port base, renders print output to images and looks at
every page, reproduces claimed behavior, traces data paths for privacy.

Review decisions already made (do not relitigate):

- Lessons saved are not curriculum-coverage evidence; observations, passed
  tests, challenges at 0.8 or better, and practice are.
- The ACARA notice appears once per page, not per chip.
- Non-`acara-v9` curriculum ids are refused.
- Start-up never waits on the standards list; no re-render while typing.
- A learner's picks are never lost by a background refresh.
- Marble's caveat is quoted verbatim from the pinned index, never paraphrased.
- Named Tailwind groups, Print button as a sibling of `<details>`, 16 px type
  in printed guides, structural page assertions in e2e rather than
  screenshots.
- Decodable books: the stage is derived from the known code and never stored;
  tricky words count as covered when ticked or decodable; the generator's
  output always passes the checker before it is shown; a tool that deletes
  files may delete only the exact names it writes.

The PM may require a fix even when the reviewer says MERGE. It happened once at
handover (PR #57: a cleanup step that deleted every PDF in a user-chosen
folder).

### 5.3 Gate and merge

Merge only when all three hold:

1. the review verdict is MERGE on the exact head;
2. GitHub CI is green on that head: `isolation` and `image` from
   `.github/workflows/test.yml`, and `e2e` from `.github/workflows/e2e.yml`.
   The e2e workflow skips docs-only changes (`paths-ignore: docs/**` and
   `**/*.md`), so a docs-only PR legitimately shows only the first two;
3. a local full-suite gate passed on that exact head merged with the current
   `main`: `npm test` (build plus unit) and `npm run e2e` (all projects).

Gate mechanics the outgoing PM used, in plain shell (the scripts lived in an
ephemeral scratch directory; recreate them where you work):

```bash
# CI of a commit, one line
gh api "repos/simgue/harrington/commits/$SHA/check-runs" \
  --jq '[.check_runs[] | "\(.name)=\(.conclusion // .status)"] | join(", ")'

# Gate: PR head merged with current main, in a scratch worktree
git fetch origin main "+refs/pull/$N/head:refs/remotes/origin/pr/$N"
git worktree add --detach /tmp/wt-pr$N origin/pr/$N
cd /tmp/wt-pr$N && git merge --no-edit origin/main      # conflict = stop
npm ci                                                  # own node_modules
E2E_CHROMIUM=/opt/pw-browsers/chromium E2E_PORT_BASE=4310 E2E_SCREENSHOTS=0 npm run e2e
# e2e first: it fills tests/e2e/.cache with the pinned taxonomy files, which
# the unit pin tests need. With CI=1 those tests fail when the cache is
# missing instead of skipping, which is what GitHub's isolation job does.
CI=1 npm test                                           # build + unit

# Un-draft, then merge. REST cannot un-draft. The ccr/ready_for_review
# endpoint exists only inside Claude Code cloud sessions; elsewhere press
# "Ready for review" in the GitHub UI or use the GraphQL mutation
# markPullRequestReadyForReview.
gh api -X POST "repos/simgue/harrington/pulls/$N/ccr/ready_for_review"
gh api -X PUT "repos/simgue/harrington/pulls/$N/merge" -f sha="$SHA" -f merge_method=merge
```

Always pass the full 40-character SHA to the merge call and re-check that the
PR head has not moved between review and merge. Merge method is a merge
commit. When two PRs are ready, merge the one the owner is waiting for first;
the other is re-gated against the new `main`.

Pitfalls met more than once:

- The repo pins Playwright 1.56, which wants `headless_shell-1194`; the cloud
  box ships Chromium 1243 at `/opt/pw-browsers/chromium`. Set `E2E_CHROMIUM`
  and never run `playwright install`.
- Two e2e runs on one machine collide on ports; use a different
  `E2E_PORT_BASE` (4410, 4510) per concurrent run.
- Re-running an older CI run on a branch cancels the newer one (concurrency).
- `pkill -f "<pattern>"` matches the shell that runs it; use `pgrep` with a
  bracket trick (`'chain-5[8]'`) or kill by pid.
- Background shell tasks die when the agent's worker restarts; write logs to
  files and re-check them, and keep a scheduled check-in as a safety net.
- A PR that adds a devDependency fails a gate that symlinks a shared
  `node_modules`; run `npm ci` per worktree.
- One flaky spot: `tests/taxonomy-pin.test.mjs` once read the server log
  before the integrity line was flushed on a busy box; a wait helper was added
  (`tests/support/wait-for-output.mjs`). A red gate with green CI deserves one
  re-run and a root cause, never a skip.

### 5.4 Linear and records

- Team `Harrington` (`HAR`). Statuses: Backlog, Todo, In Progress, In Review,
  Done, Canceled, Duplicate. Labels in `docs/LINEAR.md`.
- Every merge gets a comment on its ticket with the PR, merge SHA, what the
  review found and what was carried forward. Tickets move to Done when the
  work is on `main`, not when the PR opens.
- Decisions from the owner are quoted verbatim in the ticket.
- `CHANGELOG.md` is updated by the PR that makes the change.

### 5.5 Rhythm

- When nothing is open: a check-in every three hours (CI on `main`, owner
  replies, new pushes, Remote Control availability for the NAS task). When a
  dev session is running: every 45 to 75 minutes. Re-arm before ending a turn.
  The outgoing PM used its platform's scheduled-task tool (one-shot reminders
  delivered into the same session); use whatever Antigravity offers, or a
  cron, for the same purpose.
- Archive finished sessions. Keep a running log of merges, verdicts and owner
  asks; the outgoing PM's log was in scratch space and is summarized here.

## 6. Features the owner is actively using

### 6.1 Decodable books, command line

```bash
git pull
npm install
node tools/decodable-books/make-books.mjs decodable-books
open decodable-books
```

Since PR #59 the reading font `@fontsource/andika` is a devDependency, so a
normal `npm install` provides it. A checkout older than #59 had it as a
`--no-save` install that the next install removed; the script then prints
the one-line fix. The script finds the Mac's Chrome on its own;
`CHROME=<path>` overrides. Output: three books, each as an A4 booklet (file
name carries "print-double-sided-short-edge-flip") and a flat A5 copy, black
text and black outline pictures for coloring. The script deletes only the
exact file names it writes.

### 6.2 Decodable books, in the app (PR #59)

- Sidebar "Reading & books", or "Reading" in the learner selector, opens
  `#learner/<id>`. Tick the sounds the child reads, set by set, in the
  school's order (s a t p / i m f c / o d g l / h b n v / e qu z r / u y j k /
  x w ck sh / ch th wh ng, then adjacent-consonant clusters, then ai ay, then
  ee ea). The stage is derived and shown; "Find the level" walks one set per
  screen. Tricky words default to the stage until edited.
- `#learner/<id>/books`: "Ready to read" (books within the code), "A little
  further on" (muted, with the missing sounds named), "Make a new book"
  (focus sounds, 8 or 12 pages, Shuffle), the Library (save, print, remove).
  Print opens the browser dialog: flat A5 or A4 booklet with the short-edge
  note shown on screen only.
- Andika is bundled in `src/vendor/fonts` (SIL OFL, in NOTICE). Text is black;
  pictures are outline line art with white-filled regions.
- Known thin spots carried to HAR-67 (from the two review rounds of #59 and
  the reviews of #56 and #57): `wh` and `ng` words are few; at their own
  stage `qu` (set 5) and `k` (set 6) occur only in story names; the checker
  reads irregular tricky words ("to", "was", "he", "she", "my", "all",
  "they") letter by letter, so unticking one does not move a book to "A
  little further on"; a learner whose own name is the only readable story
  name gets a self-contradicting message; the refusal for an unknown picture
  kind is generic and a restore from a newer version is refused whole; some
  generated sentences are stilted; no split digraphs in the generator; names
  in the CLI back-page word list; two sub-millimeter unclosed regions and
  two line tangles in the CLI pictures.

### 6.3 Teaching guides and printable guides

Topic page, "Teaching guide" (Marble research, ~1,050 Mathematics and Science
topics), Print button in the header. No AI needed.

### 6.4 Australian Curriculum v9

Per-learner `curriculum: { id: 'acara-v9', year }`, code chips on topics,
soft year boost, printable coverage report (Records). The standards list loads
in the background and never blocks start-up.

### 6.5 AI provider

Settings, AI provider: presets for Ollama, Google Gemini, OpenAI-compatible.
Capability allowlist in `src/js/ai-capabilities.js` and
`HARRINGTON_AI_CAPABILITIES`. `scripts/ai-experiment.mjs` compares providers on
lessons. The owner's lesson-quality log for HAR-26 is theirs to run.

## 7. Infrastructure

- CI: `ubuntu-24.04` runners pinned, Node 20. `.github/workflows/test.yml`
  runs `isolation` (taxonomy check, `npm test`) and `image` (builds the Docker
  image, asserts uid 1000, health, a save, static files);
  `.github/workflows/e2e.yml` runs `e2e` and skips docs-only changes.
- Taxonomy: pinned to Marble revision
  `7bd8b6794cb78d9ca18216adb935f3cfd59cf5ac` with SHA-256 per file in
  `lib/taxonomy-pin.mjs`; `npm run taxonomy:check`; `/api/health` reports
  verified / outdated / integrity-failed / unchecked; custom upstreams cache
  under `taxonomy/custom-<hash>/`. Policy for following Marble's main is an
  open owner question.
- Family document: format 3 (1→2 PIN hash, 2→3 pre-#32 repair). New optional
  per-learner keys need no bump; see `schema.js`.
- Docker: non-root image (`USER node`), `compose.yaml` driven by `.env`
  (`HARRINGTON_PUBLISHED_HOST`, `HARRINGTON_ALLOWED_HOSTS`,
  `HARRINGTON_ACCESS_TOKEN`, `HARRINGTON_DATA_VOLUME`). Old volumes need a
  one-time `chown -R 1000:1000`.
- Environment variables: `HARRINGTON_DATA_DIR`, `HOST`, `PORT`,
  `HARRINGTON_PUBLISHED_HOST`, `HARRINGTON_ALLOWED_HOSTS`,
  `HARRINGTON_ACCESS_TOKEN`, `HARRINGTON_BACKUP_DIR`,
  `HARRINGTON_AI_CAPABILITIES`, `HARRINGTON_TAXONOMY_UPSTREAM`.
- e2e: `docs/e2e/README.md`. Screenshot set budget now stated as 10 MB (139
  images, about 8.9 MB).

## 8. Backlog, by priority

Open at handover (Linear is the source of truth; this is the PM's reading):

| Ticket | Title | Priority | Note |
|---|---|---|---|
| HAR-46 | G1: loopback server answers any Host name (DNS rebinding) | Urgent | Top of the security pack; owner has not chosen the next wave |
| HAR-47 | G2: uploaded recording's Content-Type served inline | High | |
| HAR-48 | G3: `/login` has no throttling or failure log | High | |
| HAR-49 | G4: family data leaves the host in plaintext without warning | High | |
| HAR-36 | Security best-practices baseline in `npm run check` | High | |
| HAR-45 | Decodable books (parent ticket) | High | In Progress; slice A done (HAR-66), slice B is HAR-67 |
| HAR-34 | Interactive "how it works" figures | High | In Review: needs the owner's sign-off on the figures; authoring idea from the Atlas of Physics repo recorded (its assets themselves were rejected: AP level, CDN scripts, analytics) |
| HAR-35 | Holistic threat model | High | In Review: owner to sign off residual risks |
| HAR-11 | Remove telemetry shim, escape strings in innerHTML | High | Marked In Progress since 3 Oct; verify whether anything remains or close it |
| HAR-67 | Decodable books slice B: bank and pictures across every stage, CLI on shared modules, optional AI drafter behind the checker | Medium | Next natural piece of HAR-45 |
| HAR-50..54, 56, 57 | G5 to G12 security gaps | Medium | See `docs/security/GAPS.md` |
| HAR-37 | Printable A3 posters and worksheets | Medium | needs-human |
| HAR-41 | Note redaction misses nicknames | Medium | |
| HAR-42 | Phone and polish findings | Medium | |
| HAR-59 | G14: plain `http://` AI base URL on a public host | Low | |
| HAR-60 | Tailwind 4 upgrade and a CSS merge driver | Low | The generated `src/css/tailwind.css` conflicts on nearly every merge; regenerate, never hand-edit |

Closed security gaps: G10 (HAR-55) and G13 (HAR-58).

## 9. Blocked and waiting on the owner

- **Synology deployment (asked explicitly: "go ahead and set it up on the
  synology").** The runbook is `docs/DEPLOYMENT.md`, section "Synology
  (Container Manager)", written for DSM 7.2 or later and not yet checked on
  a real NAS: its "(unchecked on DSM)" markers must be replaced by observed
  values once someone runs it. The owner reports DSM 7.4.1. The NAS is a
  Synology on the home LAN; its model, address, admin user and serial stay
  with the owner and are not recorded here. A cloud agent cannot reach the
  LAN. What the owner must do first: share the
  `harrington` folder on the Mac with the agent's remote-control feature,
  enable SSH on DSM, run `ssh-copy-id <admin>@<nas>` from the Mac, and give
  the admin user name. Then follow the runbook over SSH from the Mac:
  Container Manager, Git Server and Tailscale packages; clone to
  `/volume1/docker/harrington`; a Project with the bind mount and the `.env`
  token; the `tailscale serve` command exactly as step 6 of the runbook
  gives it (the runbook notes, unchecked, that the binary is not on the PATH
  on DSM); the `configure-host` boot
  task; Export and Import of the family data; re-enter
  the AI provider. The owner handles the Tailscale sign-in link.
- Owner answers listed in §3.

## 10. Risks and watch-outs

- The account's usage limits: dev sessions have stalled on the five-hour
  limit several times and a seven-day warning showed at handover. Re-fire,
  do not re-brief from memory; keep briefs in the ticket or a file.
- The owner runs an older server process after pulling without restarting;
  the format-N toast is the symptom.
- Any change to the family document shape must keep old documents loading
  (migrations in `schema.js`, validation in `document.js` that refuses
  malformed input without throwing in a view: HAR-38 rule).
- `src/css/tailwind.css` is generated and committed; regenerate with
  `npm run build:css` rather than resolving its conflicts by hand.
- Marble may move its taxonomy again; `taxonomy:check` and `/api/health` tell
  you. Refreshing the pin is a deliberate PR (see #52 for the shape: retired
  topics archived, new subjects given a color, standards re-trimmed).

## 11. Suggested first week

1. Read §2's documents and run the app locally with a synthetic learner
   (`npm ci`, `npm start`, `npm test`, `npm run e2e` with the environment
   variables above).
2. Confirm with the owner how the in-app books went on real children and
   collect each child's sounds; that unblocks HAR-67's scope.
3. Ask the owner to pick the next wave: the security pack (start with HAR-46,
   then HAR-47..49) is the PM's recommendation, because the app is about to
   move from the laptop to a NAS reachable over Tailscale.
4. Close or re-scope HAR-11.
5. Keep the Synology task warm: it starts the day the owner shares the folder
   and the SSH key.

## 12. Who did what (for context, no action)

The outgoing PM session ran from 26 October to 2 November 2026: the eleven
pull requests in §1's table, each with an independent review and a local
gate, three dev waves (taxonomy refresh and Marble research, Australian
Curriculum and printable guides, deployment and decodable books), and the
owner's setup questions (Mac spec,
LM Studio, Gemini model, Synology). Nothing is left half-done on a branch.
