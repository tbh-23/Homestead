# Data licensing & attribution

Homestead's **application code** is MIT-licensed (see [`LICENSE`](LICENSE)). The
**curriculum data** it uses is *not* Homestead's and is under separate licenses.
This document explains what applies and what your obligations are if you fork,
distribute, or build on this project.

> This is a plain-language summary, not legal advice. When in doubt, read the
> upstream licenses in full or contact the data authors.

## Where the data comes from

Homestead does **not** bundle or fork the dataset. It fetches the latest data at
runtime directly from the open-source repository:

- **Marble Skill Taxonomy** — https://github.com/withmarbleapp/os-taxonomy

## The three layers and their licenses

| Layer | What it is | License |
|---|---|---|
| **The database** | The collection, structure, IDs, and topic↔topic / topic↔standard relationships | **ODbL 1.0** — free for commercial and non-commercial use, **attribution required**, **share-alike** for derivative *databases*. |
| **Marble's textual content** | Topic `name` / `description` / `evidence` / `assessmentPrompt`, dependency `reason`s, cluster `summary`s | **CC BY-SA 4.0** — attribution + share-alike. |
| **Curriculum-standard codes** | Codes referenced by the app (Common Core, NGSS, UK National Curriculum, etc.) | **Not** Marble's to relicense — each under its **own upstream license**. See the taxonomy repo's `PROVENANCE.md`. |

## What this means for Homestead (a "produced work")

ODbL distinguishes a **derivative database** (extending/modifying the taxonomy →
must stay open under ODbL) from a **produced work** (using the data inside a
product or app → stays under your own license).

Homestead is a **produced work**: it consumes the data to power an app. Because
of this:

- ✅ The Homestead **app code stays MIT** — open-sourcing it does **not** force
  ODbL or CC BY-SA onto your code.
- ✅ You may use Homestead commercially.
- ⚠️ You **must provide attribution** to the Marble Skill Taxonomy (below). It is
  shown in the app UI and included in `NOTICE`; keep it.
- ⚠️ If you ever **modify or redistribute the dataset itself** (not just use it),
  that derivative **database** must remain open under **ODbL 1.0**, and Marble's
  **text content** you redistribute stays **CC BY-SA 4.0**.
- ⚠️ If you surface curriculum-standard codes, carry the relevant **upstream
  standards notices** from the taxonomy repo's `PROVENANCE.md`.

### A note on AI-generated content

Homestead generates lessons, tests, recall cards, and feedback using an AI model,
sometimes with a topic's CC BY-SA description as part of the prompt. The status of
such AI outputs is an evolving area. If you want to be conservative, treat
app-displayed material derived from Marble's text as CC BY-SA 4.0 and attribute
accordingly; for certainty about a specific use, ask Marble.

## Required attribution

Any use must credit:

> Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) ·
> https://withmarble.com · licensed under ODbL 1.0 (database) and
> CC BY-SA 4.0 (content).

Plus the upstream notices in the taxonomy repo's `PROVENANCE.md` for any
curriculum standards you use.

## Links

- Taxonomy repository: https://github.com/withmarbleapp/os-taxonomy
- ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
