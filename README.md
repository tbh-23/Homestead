# Homestead

**A mastery-based homeschool platform for ages 5–13.**

Homestead turns an open, connected curriculum of ~1,590 micro-topics into a clear
learning path where every idea is genuinely mastered before the next begins — and
the whole experience adapts to the child. It's built for a homeschooling parent
teaching one or more children.

## Highlights

- **Mastery ladder** — Topics → Sections → Subjects, each gated at 90%+ so
  learning always builds on solid foundations.
- **Connected timeline** — every topic shows its prerequisites and what it
  unlocks, straight from the curriculum's dependency graph.
- **Ready-to-teach lessons** — full plans with parent notes, plus low-prep,
  printable “print & go” materials (worksheets, flashcards, and more).
- **Verified tests** — topic, section, and subject mastery tests, written and
  then independently re-solved so answers are trustworthy; digital or printable.
- **Active recall** — spaced-repetition memory cards per topic, with due reviews.
- **Adaptivity** — timed challenges and parent-approved difficulty increases when
  a child excels.
- **Adaptive daily calendar** — a day-by-day plan you can reschedule, mark done,
  and add extra practice to.
- **Records & voice analysis** — log observations and record lesson conversations
  with live transcripts and AI coaching for the parent.
- **Homestead Helper** — an AI chat coach for parents, grounded in the child's
  real progress.
- **Gamified for kids** — XP, levels, collectible badges, celebration effects,
  and a colorful full-screen **Kid Mode**.
- **Insights & notifications**, a **streak tracker**, and a **downloadable guide**.

## Tech

- Static front end: HTML + CSS + vanilla JavaScript (ES modules), styled with
  Tailwind (CDN).
- Backend, auth, storage, and AI via [Puter.js](https://puter.com).
- No build step. Serve the folder over HTTP and open `index.html`.

## Running locally

Any static file server works, for example:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the served URL. Sign in with a Puter account when prompted; each
parent's students, progress, records, and recordings are stored privately in
their own account.

## The curriculum data

The curriculum is **not** bundled — Homestead fetches the latest data at runtime
from the open-source **Marble Skill Taxonomy**:

- https://github.com/withmarbleapp/os-taxonomy

This means the curriculum stays up to date automatically, and the app notifies
you when topics are added or removed upstream.

## Licensing

- **Application code:** MIT — see [`LICENSE`](LICENSE).
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

## Contributing

Issues and pull requests are welcome. By contributing, you agree your
contributions are licensed under the MIT License. Please don't commit copies of
the taxonomy dataset into this repository — Homestead loads it at runtime.
