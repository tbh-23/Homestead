# Setting up AI, one capability at a time

Harrington works without AI (see the README's
[What works without an AI provider](../README.md#what-works-without-an-ai-provider)).
About half of what you see can also use an AI provider: lessons, print & go
sheets, mastery tests, challenges, recall cards, activity instructions,
discussion analysis and progress reviews. This guide sets one up on the
family's own computer and switches it on **one capability at a time**,
starting with lessons only.

The plan (HAR-26):

1. Week one: no AI. Use the map, the calendar, records and manual mastery.
2. Week two: a local model, **lessons only**. Run the experiment script below
   and rate the lessons it writes.
3. Widen to other capabilities only when the lessons hold up (see
   [When to widen](#when-to-widen-capabilities)).

Lessons go first because they are the most forgiving: one call, one JSON
object, read by a parent who can skip a weak step. Mastery tests and
challenges are the least forgiving: they need strict JSON with an answer key,
and a second call that re-solves every question. Small local models often
fail one or the other.

## 1. Run a local OpenAI-compatible endpoint

Any server that answers `POST /v1/chat/completions` the way OpenAI does will
work: [Ollama](https://ollama.com), llama.cpp's `llama-server`, LM Studio or
vLLM. This guide uses Ollama.

```bash
# Install Ollama from https://ollama.com, then pull an instruction model:
ollama pull gemma4:26b
# Check it answers on the OpenAI-compatible path:
curl http://127.0.0.1:11434/v1/models
```

LM Studio works the same way: start its local server, use the base URL
`http://127.0.0.1:1234/v1`, and type the model id exactly as
`GET /v1/models` lists it (`curl http://127.0.0.1:1234/v1/models`).

### Choosing a model for JSON reliability

Harrington asks for lessons as one JSON object and refuses anything that does
not parse or lacks the lesson's shape (a non-empty objective and at least one
teaching step). It does not use a provider's "JSON mode", so the model has to
follow the instructions on its own.

- **Start with a mixture-of-experts instruct model**, such as `gemma4:26b`
  (Gemma 4 26B-A4B) or `qwen3.6:35b-a3b` (Qwen3.6 35B-A3B). Only a few
  billion of their parameters work on each token, so they answer at about the
  speed of a small model while following the JSON instructions like a large
  one.
- **Check the memory first.** At 4-bit, a 26B-A4B needs about 16 GB and a
  35B-A3B about 20 GB. A 32 GB computer runs one of these; 48 GB runs either
  comfortably.
- **Small dense models** (3B to 8B) download faster but more often wrap the
  JSON in prose, cut it off, or drop fields. Fine for trying the plumbing, not
  for judging lessons.
- **Give it room to finish.** A lesson is about 1,000 to 1,500 tokens of
  output. If lessons stop mid-sentence, raise Ollama's context
  (`OLLAMA_CONTEXT_LENGTH=8192 ollama serve`, or `num_ctx` in a Modelfile).

The experiment script measures this for you, so try two models and compare
their reports rather than trusting any list.

### How long it takes

The adapter waits up to **three minutes** per request
(`HARRINGTON_AI_TIMEOUT_MS`, in milliseconds, to change it) and then fails
closed: the parent sees "took too long" with Try again, and nothing is cached.

- **The first generation is the slowest**: the model is loaded into memory
  first, which can take from a few seconds to a minute.
- After that, a lesson from one of the models above (a few billion active
  parameters) typically takes **10 to 40 seconds** with a recent
  GPU or Apple silicon, and **1 to 3 minutes** on a CPU only. A CPU-only
  computer that keeps hitting the three-minute limit needs a smaller model or
  a longer timeout.
- Ollama unloads an idle model after five minutes. `OLLAMA_KEEP_ALIVE=1h`
  keeps it loaded during a teaching session.

Each lesson is generated once per topic and then served from the lesson cache.

## 2. Point Harrington at it, lessons only

### In the app: Settings > AI provider

Open **AI provider** in the sidebar's family box (next to Export and Import),
or go to `http://127.0.0.1:4173/#settings`.

1. Pick a preset: **Ollama on this computer** fills
   `http://127.0.0.1:11434/v1`; type the model you pulled (for example
   `gemma4:26b`). **Google Gemini** and **OpenAI-compatible (custom)** are
   below.
2. Paste an API key if the provider needs one (Ollama doesn't).
3. Under **Switched on**, leave only **Lessons** ticked.
4. **Save**, then **Test connection**. It sends one tiny request with no
   learner data and says whether the provider answered.

Changes apply at once: no restart, and the AI buttons across the app update as
soon as you save. **Remove saved settings** forgets everything saved here.

**Where the key is kept.** On the Harrington server only, in
`data/private/secrets.json` (or `secrets.json` in `HARRINGTON_DATA_DIR`),
readable by its owner only. It is never sent back to the page: the form shows
"Saved, ends in …abcd" and offers Replace and Remove. It is not part of
Export, and `npm run backup` leaves that file out, so a backup copied
elsewhere never carries the key; enter it again after a restore. A plain copy
of the Docker named volume (`harrington-data`) is a copy of the whole data
directory, so it does include `secrets.json`; the volume backup command in
[DEPLOYMENT.md](DEPLOYMENT.md#nightly-backup) leaves it out.

Until an [access token](DEPLOYMENT.md#option-3-the-built-in-access-token)
protects Harrington, these settings can only be changed (and tested) from the
computer running it, and only while Harrington is not shared with other
devices; other devices can read the page but not save. Anything else could
repoint the provider, keep the saved key, and receive every later prompt.

**Once Harrington is shared, saving here needs the access token.** Shared
means bound beyond loopback (`HARRINGTON_HOST`) or published under another
name (`HARRINGTON_PUBLISHED_HOST`, as with `tailscale serve` or Caddy in
[DEPLOYMENT.md](DEPLOYMENT.md)). Behind such a proxy every family device
reaches Harrington from this computer's own address, so that address no
longer tells this computer apart. A request that arrives through a proxy
(with `X-Forwarded-For` or a similar header) is refused for the same reason,
and so is one that names Harrington by anything other than `localhost` or a
loopback address, as a DNS rebinding page would.
With the token set, any signed-in device can save.

**Under Docker or Compose the page is read-only, even at the host computer.**
The container binds beyond loopback and sees the browser as another device,
so this is intended. There are two ways to set the provider there, as for
any shared server: set an
[access token](DEPLOYMENT.md#option-3-the-built-in-access-token) (then any
signed-in device can save here), or use the environment variables below.

### Or with environment variables (Docker and Compose)

The same settings can come from the server's environment instead, which suits
Docker. A value saved in the app wins over its variable, field by field;
removing the saved settings returns to the environment. Saving only takes
the fields you changed, with one exception: a base URL saved in the app needs
a model beside it, so changing only the base URL also saves the model shown
(the environment's) as an app value.

```bash
export HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
export HARRINGTON_AI_MODEL=gemma4:26b
export HARRINGTON_AI_CAPABILITIES=lesson
npm start
```

Restart Harrington after changing any of these. Docker on the same computer as
Ollama usually needs `HARRINGTON_AI_BASE_URL=http://host.docker.internal:11434/v1`.
The settings page shows "Configured from the server environment" with the
address and model, and the key only as its last four characters.

### Capabilities

`HARRINGTON_AI_CAPABILITIES` (or the **Switched on** boxes in the app) lists
what `/api/ai` may forward:

| Capability | What it writes |
| --- | --- |
| `lesson` | the full lesson plan |
| `printables` | print & go sheets |
| `activity` | instructions for an activity or game idea |
| `test` | topic, section and subject mastery tests (two calls: write, then verify) |
| `challenge` | the timed challenge quiz (two calls) |
| `recall` | active recall cards |
| `analysis` | advice on a recorded or typed discussion |
| `review` | the progress review on Insights |
| `explain` | "Explain simply" on the topic page |
| `quiz` | "Make a mini-quiz" on the topic page |

Plural spellings (`lessons`, `tests`) work too. Unset, blank or `all` switches
on everything, which is what a configured provider did before this setting
existed. Unknown names are ignored and logged at startup. Nothing is switched
on without `HARRINGTON_AI_BASE_URL` and `HARRINGTON_AI_MODEL`.

What the family sees with only lessons switched on:

- "Open full lesson" works everywhere it appears, and so does "Generate a
  different version" inside a lesson.
- Every other AI control shows a quiet **Not switched on yet** link (instead of
  "Needs a local AI provider"). It opens the README's
  [Optional local model](../README.md#optional-local-model-ollama) section,
  which links here. The child view leaves those actions out.
- Anything generated earlier (print sheets, activity instructions, recall
  cards) still opens from the cache.
- `/api/health` reports `aiCapabilities: ["lesson"]`, and the server refuses
  any other request with 403 even if a page asks.

### Where the variables live

When you use environment variables, they belong to the Harrington server
process and never go in family data or a committed file. Pick one of:

- **Exported in the shell** before starting, as above. They last until that
  terminal closes.
- **A `.env` file** next to `package.json`, started with Node's built-in loader
  (Node 20.6 or newer, no dependency). `.env` and `.env.*` are already in
  `.gitignore`.

  ```bash
  # .env
  HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
  HARRINGTON_AI_MODEL=gemma4:26b
  HARRINGTON_AI_CAPABILITIES=lesson
  ```

  ```bash
  node --env-file=.env server.mjs
  # the experiment reads the same file:
  node --env-file=.env scripts/ai-experiment.mjs --data-dir ./data/scratch --learner "Sample Nine" --age 6
  ```

- **Docker Compose**: keep the committed `compose.yaml` as it is and add a
  local `compose.override.yaml` (Compose merges it automatically; do not
  commit it) that points at the same `.env`:

  ```yaml
  services:
    harrington:
      env_file: .env
  ```

  An `environment:` block in that override works too. Never put a key or a
  cloud endpoint in `compose.yaml` itself.

Restart the server after any change, then check `http://127.0.0.1:4173/api/health`:
`aiConfigured` should be `true`, `aiSource` says whether the settings came from
the app (`"app"`) or the environment (`"env"`), and `aiCapabilities` lists what
is switched on (for example `["lesson"]`).

## Or: Gemini (cloud) example

The same adapter talks to Google's Gemini through Gemini's OpenAI-compatible
endpoint. No code change is needed; Harrington appends `/chat/completions` to
the base URL.

In the app: Settings > AI provider, choose **Google Gemini** (it fills the base
URL, suggests `gemini-2.5-flash` and switches on lessons only), paste the key
from Google AI Studio, Save, then Test connection.

With environment variables instead:

```bash
# .env (never committed)
HARRINGTON_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
HARRINGTON_AI_MODEL=gemini-2.5-flash
HARRINGTON_AI_API_KEY=your-key-from-google-ai-studio
HARRINGTON_AI_CAPABILITIES=lesson
```

- Create the key in [Google AI Studio](https://aistudio.google.com/apikey).
  Use a current Gemini model id; `gemini-2.5-flash` is an example.
- Harrington sends the key to Google as an `Authorization: Bearer` header, from
  the server only. The browser never sees it, and `/api/health` never reports it.
- The key lives only on the server: in `secrets.json` when saved in the app, or
  in the server's environment. Never commit it or paste it into `compose.yaml`.
  If it is ever exposed, delete it in AI Studio and create a new one.
- A cloud model answers in seconds rather than minutes, so the three-minute
  timeout is rarely an issue. The experiment script works the same way against
  it, and its report records the model, so a local and a cloud run compare
  side by side.

**Privacy.** A cloud endpoint means prompts leave the house and are handled
under Google's terms. A lesson prompt contains the topic's name, subject,
domain, age band, description and mastery evidence, and no learner data:
prompts always say "your child", never a name (HAR-19). Other capabilities send
more: discussion analysis sends the transcript with learners' names redacted
(nicknames and other people's names go as spoken), and parent notes go only
when the parent ticks "Include my notes in this request" for that one request.
The capability list (the **Switched on** boxes, or `HARRINGTON_AI_CAPABILITIES`)
is how to keep a cloud key to lessons only: the server refuses every other
request before anything reaches Google.

## 3. Run the lessons experiment

`scripts/ai-experiment.mjs` writes lessons for the next ten topics a learner's
daily choice would offer, using exactly the prompt the app uses, and writes a
report to `docs/experiments/<date>-lessons.md`. Use a **scratch data dir and a
fictional learner**, never the family's real data. It uses the provider you
saved under Settings > AI provider when you point `--settings-dir` at the
app's data dir (it only reads the settings there):

```bash
node scripts/ai-experiment.mjs --data-dir ./data/scratch --settings-dir ./data/private \
  --learner "Sample Nine" --age 6
```

or the environment, as the server would:

```bash
export HARRINGTON_AI_BASE_URL=http://127.0.0.1:11434/v1
export HARRINGTON_AI_MODEL=gemma4:26b
export HARRINGTON_AI_CAPABILITIES=lesson

node scripts/ai-experiment.mjs --data-dir ./data/scratch --learner "Sample Nine" --age 6
```

- `--learner` is read from the data dir's family state; with `--age`, a
  learner who is not there yet is used as a new learner with nothing
  mastered (nothing is written to the family state).
- `--topics id1,id2` (or bare ids) uses those topics instead.
- `--retries 1` (the default) allows one more attempt after an answer that is
  not usable; `--count` changes how many daily-choice topics.
- The script refuses to run when lessons are not switched on (in the app's
  saved settings, or `HARRINGTON_AI_CAPABILITIES`), and every prompt goes through the same learner-name
  redaction as the app (the report counts any redaction; it should be 0).
- Usable lessons are saved to the scratch data dir's lesson cache
  (`--no-save` to skip), so you can read them in Harrington:
  `HARRINGTON_DATA_DIR=./data/scratch HARRINGTON_PORT=4180 npm start`, then
  open each topic and "Open full lesson".

The report has, per topic: attempts, latency, whether the answer was valid
JSON, whether it passed Harrington's lesson check, and token counts when the
endpoint reports them. The last two columns, **parent usability rating** and
**notes**, are blank for you to fill in after reading each lesson.

### What to look for

- **Usable on the first try.** Count the lessons that were valid JSON *and*
  passed the lesson check without a retry. Retries double the wait.
- **Latency.** Ignore the first row (model loading). If the median is near
  three minutes, the timeout will bite during real use.
- **Teachability.** Would you teach it as written? Are the examples specific
  (real numbers, words, objects) rather than filler? Is it right for the age?
  Are the parent tips about *this* topic?
- **Correctness.** Any wrong fact, sum or spelling is a 1 or 2, however well
  written.
- **Australian English** spelling throughout.

## When to widen capabilities

Widen one capability at a time, and only when the lessons experiment shows:

- at least 9 of 10 lessons usable, most on the first try;
- a median parent rating of 4 or more, and no factual errors;
- a median latency the family is happy to wait for.

A sensible order, from most to least forgiving: `printables`, `activity`,
`explain`, `recall`, `quiz`, `analysis`, `review`, then `test` and
`challenge` last. Tests and challenges need strict JSON with an answer key
and a second verification call per test; if the model struggles with lessons,
keep them off. Add a capability by ticking it under Settings > AI provider, or
by extending the list (`HARRINGTON_AI_CAPABILITIES=lesson,printables`) and
restarting.

If a capability disappoints, take it back out of the list: what it already
wrote stays in the cache and keeps opening.

Using a cloud or vendor endpoint instead means prompts leave the house; see
[Or: Gemini (cloud) example](#or-gemini-cloud-example) and the README's
[URL-swap priming](../README.md#url-swap-priming-same-adapter-no-batch-job).
