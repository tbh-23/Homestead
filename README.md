# Harrington

**A family learning platform built around interests, projects, and clear paths
to mastery.**

Harrington is a family-specific fork of
[Homestead](https://github.com/tbh-23/Homestead). It keeps the useful learning
mechanics while we test a much smaller proof of concept: can Marble's connected
curriculum help parents see progress and possible paths to mastery without making
the child's day feel school-like, score-led, or predetermined?

Start with the [Harrington proof-of-concept brief](docs/POC.md) and its
[small learning spine](docs/POC-SPINE.md). Work is tracked in Linear on the
[Harrington](https://linear.app/karatgurk/team/HAR/overview) team; see
[docs/LINEAR.md](docs/LINEAR.md). Homestead remains an upstream code reference,
not a Harrington deployment or service dependency.

## Current self-hosted preview

Harrington no longer requires an external account. Its own Node server stores
family state, lesson caches, and recordings in a family-controlled data
directory. Lesson generation is optional: it stays fail-closed until you point
Harrington at a local OpenAI-compatible endpoint (Ollama is the documented
example).

This preview binds to the local computer only by default. To use it from the
family's other devices, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): one
host runs the server, every other device is a browser. Use synthetic learner
names until encrypted backups are implemented.
Never send a real child's name into a model prompt. Generators say “your child”,
and names of learners in this app are replaced with “the child” in the browser
before a request is built (accents, hyphens and apostrophe variants included).
The server does the same again on every message it forwards, with the same
rules, for every learner in the family document (`/api/health` reports
`redaction: "server+client"`), and removes any stored parent note from a
request the parent did not opt in to. Because the server applies the name
rules to the whole prompt, a learner whose name is also a common word pays
for it: a learner called Will turns every “will” in the instructions and
topic text into “the child” (“will” appears in dozens of the taxonomy’s
topics), which can make answers worse. A nickname avoids it.
When an AI provider is configured, this is what still leaves the machine:

- topic text: topic names, descriptions and mastery evidence, and the activity
  idea being expanded;
- the topic's age from the curriculum (lessons, printables, activities,
  “Explain simply”, mini-quizzes, recall cards, topic and section tests,
  challenges, and a discussion analysis linked to a topic);
- the learner's exact age for whole-subject tests (left out when no birth year
  is set), discussion analyses (alongside the linked topic's age) and progress
  reviews (“age unknown” when no birth year is set), and for a topic test or
  challenge only when the topic has no curriculum age;
- the adaptive “excelling” flag on topic and section tests, once the parent
  has approved harder questions for that domain;
- for progress reviews: mastered, in-progress and total topic counts and the
  mastery percentage, recent topic names and statuses, record counts by type,
  the topics they link to and the average confidence rating;
- a discussion transcript, when the parent asks for an analysis;
- the parent's notes, only when they tick “Include my notes in this request”
  for that one request (record titles are never sent).

Harrington never puts a learner's name, birth month or year, or interests
into a prompt itself. It replaces the learner names it knows (in transcripts
and notes in the browser, in the whole message on the server), so the
replacement has limits: a nickname, especially one that is
an ordinary word, is sent as spoken, as are other people's names; a
one-letter name is not replaced; and a name in a script written without
spaces (for example Chinese) is not matched when it runs straight into other
text.

## What works without an AI provider

Out of the box, with no AI provider configured, Harrington runs on this
computer only and these work:

- **Learners** — add, edit and switch learners (name, birth month and year,
  colour).
- **Dashboard** — Today's path with the daily literacy and numeracy choices,
  stepping stones to try next, subject progress, recent growth and evidence.
- **Child view** — the garden, story time and number time picks, and "Tell
  about my day", with no scores.
- **Map** — the world map, per-domain skill trees with the quest log, and the
  list drill-down, showing required and helpful foundations.
- **Growth stages and manual mastery** — Seed, Sprout, Bud and Bloom; you set
  a topic's status from the quest log or the topic page.
- **Calendar** — the day-by-day plan on your chosen home days, with breaks:
  move topics, mark days done, add extras.
- **Decodable books** — a learner's reading setup (the sounds and tricky
  words they know, ticked set by set or with "Find the level"), built-in
  books within that code, new books made from a word bank, a library, and
  printing as an A4 booklet or flat A5 pages, black outlines to colour in.
- **Records and recordings** — notes, observations and voice recordings saved
  on this computer. The live transcript uses your browser's speech service,
  which may send audio to the browser vendor.
- **Insights** — subject summaries and recommended next topics.
- **Teaching guides** — on about 500 of 576 Mathematics topics and 550 of 576
  Science topics, a collapsible guide from Marble's teaching research: a
  summary, activities with steps and what to say after a wrong turn, and a way
  to check understanding. Where a lesson needs AI, "Open the teaching guide"
  comes first. Other subjects have no guides yet. Every guide ends with
  Marble's own note on them: "Agent-authored teaching research and proposed
  learning activities; not empirically validated interventions." The server
  downloads the research once (about 24 MB) the first time a topic page is
  opened (or, without AI, the calendar or the map's quest log) and keeps it.

Lessons, print & go sheets, mastery tests, challenges, recall cards, activity
instructions, discussion analysis, progress reviews and adaptive suggestions
need a local AI provider (see [Optional local model](#optional-local-model-ollama)).
Without one, those buttons are replaced by a quiet "Needs a local AI provider"
link (and left out of the child view); with a provider but a capability not
switched on, the link reads "Not switched on yet" (see
[docs/AI-SETUP.md](docs/AI-SETUP.md)). Lessons and print & go sheets saved
on the server earlier still open: the topic page shows "Open saved lesson", and
Records lists them under "Saved lessons". The curriculum is downloaded at the
revision pinned in `lib/taxonomy-pin.mjs` and verified against its SHA-256s;
a cached file that does not match the pin is downloaded again and replaced,
and a matching cache is served with no further downloads; see
[docs/CURRICULUM.md](docs/CURRICULUM.md) for how the pin moves and what
happens to topics a new revision retires.

## Highlights

- **Mastery ladder** — Topics → Sections → Subjects, each gated at 90%+ so
  learning always builds on solid foundations.
- **Curriculum graph** — parents start at a subject and drill into domains,
  age-banded sections, and topics. Prerequisites and unlocks stay visible;
  mastery stays in the parent view.
- **Ready-to-teach lessons** — **Open full lesson** calls the family-controlled
  `/api/ai` adapter, then caches the result once per topic (`topic:{id}`) on the
  family server. Unconfigured servers keep returning 503. Do not pre-generate the
  whole taxonomy.
- **Verified tests (retained)** — generation and independent re-solving require
  a future AI provider adapter; digital and printable test mechanics remain.
- **Active recall (retained)** — generated memory cards require the same future
  provider adapter; the spaced-review mechanics remain.
- **Spaced practice** — mastery-test questions a child misses are queued and
  resurfaced on an expanding review schedule until they stick, extending spaced
  repetition from facts to problem-solving.
- **Adaptivity** — timed challenges and parent-approved difficulty increases when
  a child excels.
- **Adaptive daily calendar** — a day-by-day plan you can reschedule, mark done,
  and add extra practice to.
- **Records & voice capture** — log observations and store lesson recordings on
  the family server. AI coaching is disabled in this preview.
- **Daily pick-one choices** — Today's path offers a short literacy choice and
  a short numeracy choice, two options each, drawn from the POC focus domains
  (see docs/POC-SPINE.md). In-progress work and domains that have gone quiet
  come first. The child picks one on the dashboard or in the child view, and
  the day's offers and picks are saved with the family's data.
- **Growth stages instead of scores** — progress is shown as a plant: Seed
  (foundations not yet in place), Sprout (ready to start), Bud (being learned)
  and Bloom (mastered). Parents see the stage beside the underlying numbers;
  the child view shows only plants and words.
- **Child view** — opened from the dashboard header, it shows the child's
  garden, big activity buttons and "Tell about my day", with no levels, XP or
  percentages. The inherited XP, levels, badges and celebration effects remain
  in the codebase for evaluation.
- **Insights & notifications**, a **streak tracker**, and a **downloadable guide**.

## Research-Backed Evidence

Harrington is built on learning-science foundations, not ad hoc design choices.
Each one below comes with its main caveat too — the lab effect and the
classroom effect aren't always the same size.

- **Mastery learning** — requiring students to reach a high level of
  proficiency (Harrington uses 90%+) on one unit before advancing to the next
  produces large, consistent achievement gains, especially for struggling
  learners. See Kulik, Kulik & Bangert-Drowns (1990), *Effectiveness of
  Mastery Learning Programs: A Meta-Analysis*, Review of Educational
  Research — [SAGE Journals](https://journals.sagepub.com/doi/10.3102/00346543060002265).
  *Caveat:* the largest effect sizes come mostly from shorter studies using
  experimenter-made tests aligned to the intervention; effects measured with
  independent, standardized tests over full courses tend to be smaller
  (though still positive). Mastery gating also only helps if there's a real
  remediation loop behind it, not just a repeated pass/fail gate.
- **Active recall (retrieval practice)** — testing yourself on material,
  rather than re-reading or re-watching it, produces stronger and more
  durable learning than nearly every other studied technique. See Dunlosky
  et al. (2013), *Improving Students' Learning With Effective Learning
  Techniques*, Psychological Science in the Public Interest —
  [APS summary](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html).
  *Caveat:* the effect is strongest for material tested the same way it was
  practiced (facts, definitions, recall-type questions); it transfers less
  reliably to novel problem-solving or far-transfer tasks, which is part of
  why Harrington also spaces problem-solving retries, not just flashcards.
- **Spaced (distributed) practice** — spreading study of the same material
  over expanding intervals, instead of massing it into one session, is the
  other top-rated technique alongside testing. See Cepeda, Pashler, Vul,
  Wixted & Rohrer (2006), *Distributed Practice in Verbal Recall Tasks: A
  Review and Quantitative Synthesis*, Psychological Bulletin 132(3):
  354–380 — [author's copy](https://www.yorku.ca/ncepeda/publications/CPVWR2006.html)
  — and Hattie & Donoghue (2021), *A Meta-Analysis of Ten Learning
  Techniques*, Frontiers in Education —
  [open access](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full).
  Harrington's memory cards use a Leitner-style expanding schedule, and
  missed mastery-test questions are now queued for spaced retry the same
  way, extending the effect from facts to problem-solving.
  *Caveat:* the effect is less bulletproof in real classrooms than in the
  lab. A 2025 study in real primary-school settings found the retrieval
  (testing) effect held up, but the spacing-interval manipulation itself
  did not reach significance for those students — see [Retrieval practice
  enhances learning in real primary school settings, whether distributed or
  not](https://pmc.ncbi.nlm.nih.gov/articles/PMC12372469/).

## Tech

- Browser app: HTML + CSS + vanilla JavaScript (ES modules), styled with a
  locally built Tailwind stylesheet and vendored Lucide icons.
- Dependency-free Node server for static files, family state, lesson caches, and
  recordings.
- No external account or application bundler. `server.mjs` is the entry point;
  the committed browser assets are regenerated with `npm run build`.
- Marble remains an open runtime curriculum source. AI is optional and
  fail-closed until `HARRINGTON_AI_BASE_URL` and `HARRINGTON_AI_MODEL` are set.

## Running locally

Install and start Harrington:

```bash
npm install
npm start
```

Then open `http://127.0.0.1:4173`. No login is required. Private preview data is
written under `data/private/` and excluded from Git.

To use AI, open **AI provider** in the sidebar (or `#settings`) and set a
provider there; no restart is needed. Once Harrington is shared (Docker or
Compose, another bind address, or a proxy such as `tailscale serve`), that
page is read-only until you set an access token; or use the environment
variables below. See
[docs/AI-SETUP.md](docs/AI-SETUP.md).

### Optional local model (Ollama)

The simplest way is in the app: **AI provider** in the sidebar, choose
"Ollama on this computer", type the model, Save, then Test connection. The
environment variables below do the same for Docker and Compose; a value saved
in the app wins over its variable.

Lesson generation stays off until a base URL and a model are both set. There
is no default cloud URL or API key.

```bash
# Install Ollama from https://ollama.com, then pull one instruction model
# (a mixture-of-experts model; about 16 GB of memory at 4-bit, see docs/AI-SETUP.md):
ollama pull gemma4:26b

export HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
export HARRINGTON_AI_MODEL=gemma4:26b
# Optional. Ollama usually needs none; some reverse proxies want Bearer:
# export HARRINGTON_AI_API_KEY=your-proxy-token

npm start
```

Restart Harrington after changing these variables. `/api/health` reports
`aiConfigured: true` only when both the base URL and model are set, and
`aiSource` (`app` or `env`) says where they came from. The browser
sends only the messages and the capability they are for; every request uses
`HARRINGTON_AI_MODEL`.

To switch AI on one capability at a time, list them in
`HARRINGTON_AI_CAPABILITIES` (for example `HARRINGTON_AI_CAPABILITIES=lesson`;
unset means all). Controls for the others show "Not switched on yet", and the
server refuses them. **[docs/AI-SETUP.md](docs/AI-SETUP.md)** covers choosing a
model for reliable JSON, expected latency, where the variables live (shell,
`.env`, Docker), a Gemini (cloud) example with an API key, the lessons-only
experiment (`scripts/ai-experiment.mjs`) and when to widen.

Local models can take a while to write lesson JSON. The adapter waits up to
three minutes (`HARRINGTON_AI_TIMEOUT_MS` to override) and then fails closed.

Docker on the same machine as Ollama typically needs
`HARRINGTON_AI_BASE_URL=http://host.docker.internal:11434/v1`. Do not publish a
key or a cloud endpoint in `compose.yaml`.

LM Studio is an alternative local server: start its server and use
`http://127.0.0.1:1234/v1` as the base URL, with the model id exactly as
`GET /v1/models` lists it.

### URL-swap priming (same adapter, no batch job)

The adapter is URL-swappable. Point `HARRINGTON_AI_BASE_URL` at any
OpenAI-compatible `/v1` (Ollama, llama.cpp, vLLM, or a vendor/LiteLLM endpoint
on the family server) without code changes.

Do **not** pre-generate all ~1,845 Marble topics. The lesson cache is
generate-once per topic the family actually opens. If a local model's JSON is
weak, you may temporarily point at a stronger endpoint to fill **only the
topics you open** (or a small focus band later), then switch back to Ollama.
A cloud or vendor endpoint receives everything the list at the top of this
README names: topic text, ages, transcripts, and any notes the parent
includes. Never use Puter.
Never put learner names in prompts.

There is no chat. The inherited Harrington Helper and Commune views were never
reachable in Harrington and were removed on 2 October 2026 (HAR-23); a fail-closed
Commune stub remains only so the isolation test can prove nothing calls out.

Docker is also supported:

```bash
docker compose up --build
```

## Backup and restore

Everything the family has created lives in `data/private/` (or
`HARRINGTON_DATA_DIR`): `family-state.json` holds learners, progress, records,
plans and settings; `audio/` holds recordings; `lessons/` and `taxonomy/` are
caches; `secrets.json` holds the AI provider settings saved in the app,
including any API key, readable by its owner only. **That directory is the
complete backup set.** Copy it somewhere safe, or run:

```bash
npm run backup
```

which writes `backups/harrington-<timestamp>.tar.gz` (Git ignores `backups/`).
It leaves out `secrets.json` on purpose, so a backup never carries an API key;
after a restore, enter the key again under Settings > AI provider.
To restore, stop Harrington, close it on every device (a tab left open would
otherwise see its next change refused and offer to put it back on the restored
data), replace `data/private/` with the archive's
contents (`tar -xzf backups/harrington-<timestamp>.tar.gz -C data`), and start
it again. With Docker, back up the `harrington-data` volume instead; the
backup and restore commands are in docs/DEPLOYMENT.md, "Nightly backup" (the
restore ends with the `chown` the `node` user needs).
Set `HARRINGTON_BACKUP_DIR` to write somewhere else; the server reads the same
variable, and the notification bell reminds you when the newest archive there
is more than 7 days old. With no archive at all it shows "No backup recorded"
once, with a link to this section; under Docker, where backups are of the
volume, dismiss it and it stays quiet for 30 days.

In the app, **Export** in the sidebar's family box (on a phone, at the bottom
of the learner selector) downloads
`harrington-family-<date>.json`: the full family document plus `exportedAt`
and `taxonomyVersion`. **Import** checks a file, previews its learners and
record counts, and after you confirm replaces the family data on this server.
The check (`src/js/document.js`) covers learner fields (id, name, birth year
and month, start date, a hex colour, and an Australian Curriculum setting,
which must be `{ id: 'acara-v9', year }` with a year of F or 1 to 6), progress statuses, records (type,
rating, bounded text, numeric dates, a placement's topic list), test and
challenge results (scores and counts as numbers), XP and badges, the shape of
each learner's suggestions, plan (moves, done days, extras lists of
objects), daily choices (offers lists), adaptations, recall cards and
practice items (each an object) and activity,
interests, calendar settings, the child-view PIN hash and salt, dismissed
alerts and notifications (including their details), and says what it
refused. Other fields are not checked. An active learner that is not in the
file becomes its first learner. A learner colour outside the palette
is moved to the nearest palette colour, and the preview says how many were.
The server applies the same check to every save and answers 422 with the
reason. The JSON file does not contain recordings or the AI provider
settings, so keep a `data/private/` backup too. The child-view PIN is stored and exported only as
a salted SHA-256 hash; a plain PIN in an older file is hashed when it is
loaded or imported.

The family document carries `schemaVersion`, its data format (currently 3).
Older documents and exports are migrated when they are loaded or imported
(`src/js/schema.js`; step 1 to 2 hashes a plain PIN; step 2 to 3 repairs
values saved before the server checked every save, shortening a name over 60
characters or an over-long note, clamping a birth year and dropping unreadable
entries), and a load that migrated saves the result once. The notification
bell lists each change the repair made until it is dismissed, and the first
save in the new format keeps the stored file as it was (without a plain
child-view PIN), beside `family-state.json`, as `family-state.format-<n>.json`;
the bell names that file. An older export is checked after the same
migration, so it imports as it would load; the server keeps no copy of an
import. A document whose `schemaVersion` is not a whole number also opens
read-only, with its own banner. A file from a newer version of Harrington is
refused at import; a document from a newer version already on the server
opens read-only, with a banner, and nothing is saved until this Harrington is
updated. Top-level fields this version does not know are kept as they are.

Saves are versioned: if another tab or device saved first, Harrington reloads
the latest data and says so instead of overwriting it. Changes still pending
when a tab is hidden or closed are sent with `navigator.sendBeacon`; browsers
cap beacons at about 64 KB, so a larger family document falls back to a normal
save, which a closing tab may cut short. `/api/health` reports
`stateVersion` and `stateBytes`; saves are limited to 5 MB and a banner
appears if the family data grows past that. Export then downloads this tab's
copy, marked `unsavedChanges: true`.

## Deployment

**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** is the runbook for using
Harrington from tablets, phones and other computers. The short version: one
always-on host runs `node server.mjs` with one data directory; every other
device is a browser; never run two servers against a synced folder. For a
Synology NAS, its [Synology (Container Manager)](docs/DEPLOYMENT.md#synology-container-manager)
section goes from Package Center to every device signed in over HTTPS.

- `HARRINGTON_HOST` (default `127.0.0.1`) chooses the bind address.
- `HARRINGTON_ACCESS_TOKEN` makes every `/api/*` request except
  `/api/health` need a sign-in cookie; each device signs in once at `/login`.
  Once shared, Harrington answers only to the family's host names and IP
  addresses (`HARRINGTON_ALLOWED_HOSTS` adds names).
- The microphone needs HTTPS on every device other than the host. The
  recommended setup is a WireGuard mesh such as Tailscale with its HTTPS
  certificates; a local reverse proxy with its own certificate authority
  (Caddy `tls internal`) also works. Harrington does not terminate TLS itself.

The included container runs as the unprivileged `node` user (uid 1000),
stores private data in the `harrington-data` volume (or a folder named by
`HARRINGTON_DATA_VOLUME` in `.env`) and publishes only to `127.0.0.1:4173`.
Data written by an older, root-run image needs a one-time
`chown -R 1000:1000` (docs/DEPLOYMENT.md, "The container runs as `node`").
Do not expose Harrington to the public internet.

### Updating

1. Export in the app, and run `npm run backup`.
2. Stop the server (Ctrl+C, or your service manager).
3. `git pull`, then `npm install`.
4. `npm start` with the same environment variables as before.
5. Reload Harrington on every device.

Stop the server before pulling, not after. A running server keeps the old
code in memory but serves the new browser files from disk, so a tab reloaded
in between saves in a newer data format than that server knows, and the
server refuses it ("This server reads family data up to format 2; the save is
format 3"): that refusal is the safety net that stops an old server from
mangling data it does not understand. Restarting the server on the new code
clears it.

Browsers may keep the old app's scripts and styles for up to an hour (the
server lets them cache everything but the page itself for that long), so a
reloaded tab can run the old app for a while. That is harmless: the old app
opens data in a newer format read-only, with a banner, and saves nothing. The
cache belongs to the browser, so closing the tab does not clear it: wait out
the hour, hard-refresh (Cmd-Shift-R on a Mac, Ctrl-Shift-R elsewhere), or on a
tablet clear the site's data in the browser settings. It matters only when an
update changes the data format, and the format checks keep that harmless.

With Docker, `git pull` and then `docker compose up -d --build`. The first
update to an image that runs as `node` (uid 1000) needs a one-time
`chown -R 1000:1000` of the data, or every save fails with `EACCES`; the
commands for a volume and for a folder are in docs/DEPLOYMENT.md, "The
container runs as `node`". On a Synology NAS, see that section of
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#updating).

## The curriculum data

The curriculum is **not** committed to Git. The local Harrington server fetches
the open-source **Marble Skill Taxonomy** once, caches it under
`data/private/taxonomy/`, and serves it to the browser at `/api/taxonomy/*`:

- https://github.com/withmarbleapp/os-taxonomy

The first launch needs the network for that download. Later launches use the
on-disk cache; it does not update on its own.

## Licensing

Harrington is derived from Homestead under the MIT License. The original
copyright and licence notice are preserved, and Homestead remains configured as
the `upstream` Git remote for future comparison and selective updates.

- **Application code:** MIT — see [`LICENSE`](LICENSE).
- **Figure engine:** `src/js/figures/engine.js`, which draws the "See how it
  works" figures, is forked from the Colorfigures skill by April Zhu (built on
  iso-glow by April Zhu and iso-figure by Tolga Cohce), MIT. Its notice is in
  the file's header comment and in [`NOTICE`](NOTICE).
- **Curriculum data:** licensed separately by its authors (ODbL 1.0 for the
  database, CC BY-SA 4.0 for the text) and **must be attributed**. See
  [`NOTICE`](NOTICE) and [`DATA-LICENSE.md`](DATA-LICENSE.md) for details and
  obligations.

Using the taxonomy inside this app is a "produced work," so the MIT license on
the code is compatible — you only owe attribution (and share-alike if you ever
redistribute a *modified copy of the dataset itself*).

### Required attribution

> Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) ·
> https://withmarble.com · licensed under ODbL 1.0 (database) and
> CC BY-SA 4.0 (content).

The teaching guides carry their own line, shown at the end of every guide:

> From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc.
> (Marble) · CC BY-SA 4.0

See [docs/CURRICULUM.md](docs/CURRICULUM.md#teaching-research) for what that
license asks of Harrington.

### Australian Curriculum

The topic pages and the coverage report show Australian Curriculum
(version 9) content descriptions from the taxonomy's
`curriculum-standards.json`, with this notice:

> © Australian Curriculum, Assessment and Reporting Authority (ACARA) 2009 to present, unless otherwise indicated. This material was downloaded from the ACARA website (https://www.australiancurriculum.edu.au/) (accessed 20 October 2026) and was modified only to normalize whitespace and render equation fractions as text. The material is licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). ACARA does not endorse any product that uses ACARA material or make any representations as to the quality of such products. Any product that uses material published on this website should not be taken to be affiliated with ACARA or have the sponsorship or approval of ACARA. It is up to each person to make their own assessment of the product.

The links between topics and content descriptions are the Marble Skill
Taxonomy's alignment, a map rather than a certificate, so Harrington says a
topic is "linked to" a code and never that it meets one.

## Contributing

Work is tracked in Linear, not GitHub Issues. See [`docs/LINEAR.md`](docs/LINEAR.md).
Pull requests are welcome. By contributing, you agree your contributions are
licensed under the MIT License. Please don't commit copies of the taxonomy
dataset into this repository — Harrington caches it locally at runtime.
