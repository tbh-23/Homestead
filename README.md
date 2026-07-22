# Homestead

**A mastery-based homeschool platform for ages 5–13.**

Homestead turns an open, connected curriculum of ~1,590 micro-topics into a clear
learning path where every idea is genuinely mastered before the next begins — and
the whole experience adapts to the child. It's built for a homeschooling parent
teaching one or more children.

**Live at [homestead.puter.site](https://homestead.puter.site).**

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
- **Spaced practice** — mastery-test questions a child misses are queued and
  resurfaced on an expanding review schedule until they stick, extending spaced
  repetition from facts to problem-solving.
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

## Research-Backed Evidence

Homestead is built on learning-science foundations, not ad hoc design choices.
Each one below comes with its main caveat too — the lab effect and the
classroom effect aren't always the same size.

- **Mastery learning** — requiring students to reach a high level of
  proficiency (Homestead uses 90%+) on one unit before advancing to the next
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
  why Homestead also spaces problem-solving retries, not just flashcards.
- **Spaced (distributed) practice** — spreading study of the same material
  over expanding intervals, instead of massing it into one session, is the
  other top-rated technique alongside testing. See Cepeda, Pashler, Vul,
  Wixted & Rohrer (2006), *Distributed Practice in Verbal Recall Tasks: A
  Review and Quantitative Synthesis*, Psychological Bulletin 132(3):
  354–380 — [author's copy](https://www.yorku.ca/ncepeda/publications/CPVWR2006.html)
  — and Hattie & Donoghue (2021), *A Meta-Analysis of Ten Learning
  Techniques*, Frontiers in Education —
  [open access](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full).
  Homestead's memory cards use a Leitner-style expanding schedule, and
  missed mastery-test questions are now queued for spaced retry the same
  way, extending the effect from facts to problem-solving.
  *Caveat:* the effect is less bulletproof in real classrooms than in the
  lab. A 2025 study in real primary-school settings found the retrieval
  (testing) effect held up, but the spacing-interval manipulation itself
  did not reach significance for those students — see [Retrieval practice
  enhances learning in real primary school settings, whether distributed or
  not](https://pmc.ncbi.nlm.nih.gov/articles/PMC12372469/).

## Tech

- Static front end: HTML + CSS + vanilla JavaScript (ES modules), styled with
  Tailwind (CDN).
- Backend, auth, storage, and AI via [Puter.js](https://puter.com).
- No build step. The site is served from the [`src/`](src) directory —
  `src/index.html` is the entry point.

## Running locally

Any static file server works, pointed at `src/`, for example:

```bash
npx serve src
# or
cd src && python3 -m http.server 8000
```

Then open the served URL. Sign in with a Puter account when prompted; each
parent's students, progress, records, and recordings are stored privately in
their own account.

## Deployment

Pushes to `main` deploy automatically to
[homestead.puter.site](https://homestead.puter.site) via the
[`Deploy to Puter`](.github/workflows/deploy.yml) GitHub Actions workflow, which
runs [`scripts/deploy-puter.mjs`](scripts/deploy-puter.mjs).

The script uploads `src/` to Puter hosting with its directory structure
preserved, into a fresh `release-<timestamp>` folder, then atomically re-points
the `homestead` subdomain at it (zero downtime) and prunes old releases. It uses
the [`@heyputer/puter.js`](https://www.npmjs.com/package/@heyputer/puter.js) SDK
directly rather than the Puter CLI, because the CLI flattens nested directories
(so `src/js/views/dashboard.js` would 404). You can also run it from the Actions
tab via **workflow_dispatch**.

Deployment requires a `PUTER_AUTH_TOKEN` repository secret (generate one at
`puter.com/dashboard` → **Create token**). If it's missing, the workflow fails
fast before touching the live site.

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
