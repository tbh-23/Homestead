# Changelog

All notable changes to Homestead are documented here. This project loosely
follows [Keep a Changelog](https://keepachangelog.com/) and semantic-ish
versioning.

## [Unreleased]

### Added
- **Year-end portfolio & progress reports** — a printable, PDF-ready report per
  student built entirely from existing account data: mastery by subject, a
  mastery-growth chart, attendance / instruction days, topics mastered with
  dates, assessments passed, and a sample of records. Useful for personal
  records and state homeschool reporting.
- **Backup & restore** — export the whole account (students, progress, records,
  tests, settings) to a single JSON file, and restore it later. Opened from the
  new **Data & reports** panel.
- **Family view** — one screen for parents teaching several children: each
  child's plan for today (scheduled topics + what's due) side by side, plus a
  friendly sibling leaderboard (XP, level, streak).
- **Progress-over-time charts** in Insights — cumulative mastery growth and a
  test-score history per subject, drawn as dependency-free inline SVG.
- **Installable PWA / offline-resilient shell** — a web app manifest, icon, and
  service worker. Homestead can be installed to the home screen, and the app
  shell, curriculum, and fonts are cached so repeat loads are fast and survive a
  flaky connection. Puter auth/data requests always go straight to the network.

### Fixed
- Removing a student now clears **all** of that student's data (tests, plan,
  recall, practice, challenges, adaptations, activity, game state), not just
  progress and records — no more orphaned data lingering in the saved account.
- Pending changes are now flushed on tab hide/close, so a just-made edit (a
  grade, a note, a passed test) can't be lost inside the save debounce window.
- Consistent HTML escaping of user-entered text (student names, record titles
  and notes) across all views.
- Calendar plan window (`firstKey`/`lastKey`) is recomputed after topic moves, so
  moving a topic earlier no longer leaves the track pointing at an empty day.

## [1.0.0] — Initial public release

### Learning core
- Mastery ladder: Topics → Sections → Subjects, each gated at 90%+.
- Connected timeline built from the Marble Skill Taxonomy's prerequisite graph,
  with a clear "How this connects" flow (comes before / leads to).
- Age 5–13 path derived from the taxonomy, per student.

### Teaching tools
- AI-generated, ready-to-teach lessons with parent notes (focus / struggles /
  advice), printable "print & go" materials, and expandable activities & games.
- Reference links and aligned curriculum standards per topic.

### Assessment
- Topic, section, and subject mastery tests — digital (auto-graded) or
  printable/hands-on — with an independent verification pass and calculator
  double-check so answers are trustworthy. Printable certificates on subject
  completion.

### Retention & adaptivity
- Active recall cards per topic with spaced-repetition scheduling and a
  "due today" review.
- Timed challenge quizzes after mastery.
- Adaptivity engine: strong results propose parent-approved difficulty increases.

### Planning & tracking
- Adaptive day-by-day calendar (reschedule, mark done, add extra practice) with
  a chosen start date and daily refreshers.
- Records with voice recording, live transcripts, a recordings folder, and AI
  discussion analysis saved onto each recording.
- Insights: per-subject AI progress reviews and recommended next steps.
- Streak tracker and per-subject completion rings.

### Engagement (kids)
- XP, levels, 12 collectible badges, confetti/sound celebrations, and a
  full-screen Kid Mode.

### Platform
- Parent AI assistant ("Homestead Helper") grounded in the child's progress.
- Notification center for curriculum updates, adaptive suggestions, and best
  scores.
- Curriculum auto-syncs from the upstream repository on every load.
- Downloadable feature guide and in-app welcome tour.
