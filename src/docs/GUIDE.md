# Harrington guide

Harrington is a self-hosted family learning platform. It shows the open
[Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) (about
1,845 connected topics across 9 subjects) as a map for parents, offers small
daily literacy and numeracy choices, and keeps a record of what your child
actually did.

By default it runs on this computer only. It can also be shared from one host
computer with your other devices, so tablets and phones open it in a browser;
[DEPLOYMENT.md](https://github.com/simgue/harrington/blob/main/docs/DEPLOYMENT.md)
has the steps. Family data stays on the computer that runs Harrington unless you
configure an AI provider.

The in-app **Guide** (sidebar on a computer, book icon at the top of the screen
on a phone) covers the same ground in short form. This file is the longer
written version.

> **Needs a local AI provider; see the README.** This line marks every feature
> that is written by an AI model. Without a provider those buttons show a
> "Needs a local AI provider" chip instead. See "What needs an AI provider" at
> the end.

---

## Getting started

1. **Start Harrington.** Run `npm start` and open `http://127.0.0.1:4173`.
   There is no account and no sign-in. The first start downloads the
   curriculum, so it needs the internet once.
2. **Add a learner.** Enter a name, birth year and, optionally, birth month.
   Harrington uses the age to suggest age-appropriate topics and to build the
   calendar; with the month the age is exact. Edit a learner's name, birthday
   or colour later with the pencil button in the learner selector.
3. **Look around.** The sidebar (or the bottom bar on a phone) has
   **Dashboard, Calendar, Map, Records** and **Insights**. The sidebar also
   has **Reading & books** (on a phone, press **Reading** beside a learner in
   the learner selector). **Guide** is in the sidebar, or behind the book icon
   on a phone. The **child view** opens from
   the dashboard.

Add or switch learners from the selector at the top of the sidebar (the round
button at the top right on a phone). Each learner keeps their own progress,
calendar, records and recordings. **Export** and **Import** (a copy of the
family data) are in the sidebar's family box; on a phone or tablet they are at
the bottom of the learner selector.

### Finding where a learner is: the level-set workbook

Open the learner selector and press **Workbook** beside a learner (next to
**Placement**). The workbook works without AI. It covers literacy and
numeracy, one at a time:

1. It goes one area at a time (for numeracy: counting, place value, adding
   and subtracting, mathematical thinking). Each area starts with its topics
   for about one year below your child's age. A sheet is one area and never
   more than twelve topics. Each topic comes with "Can they…?" questions.
2. Mark each topic **Yes** if you have seen your child do it, **Not yet** if
   not, or **Unsure** if you want to check by watching first.
3. **Save this sheet and continue.** This keeps your answers. Nothing is
   marked mastered yet.
4. The next sheet depends on your answers in that area. All Yes moves that
   area up a year. All Not yet moves it down a year. One area's answers never
   stop another area. After that, the workbook asks about the foundations of
   each Not yet topic, until nothing is left to ask.
5. At the end, **where to start** lists the topics to teach next: the ones
   you marked Not yet whose foundations are known. If they still wait on
   topics you marked Unsure, it says so and lists those first.
6. **Confirm what to mark** lists, subject by subject, every topic your Yes
   answers would mark mastered, including the foundations they build on in
   other subjects. Nothing is written until you confirm. Confirming writes
   one record in Records, which you can undo.

Topics marked Unsure wait under **Waiting for an observation check** once you
confirm. Each one links to its topic page, where "Check mastery by
observation" takes it off the list. **Print this sheet** gives you a paper
copy of the current sheet. Every answer is saved as you go, so you can stop
and pick up later. Sittings are meant to last about twenty minutes, a sheet
or two. The workbook shows how long the current sitting has run and suggests
a pause at twenty minutes. **Change answers** on a saved sheet opens it
again and removes the sheets after it. If you had already confirmed the
list, that undoes it too.

---

## Dashboard

The parent's view of the day.

- **Today's path.** A short literacy choice and a short numeracy choice, two
  options each, drawn from the focus domains in
  [POC-SPINE.md](https://github.com/simgue/harrington/blob/main/docs/POC-SPINE.md).
  Topics already in progress and domains that have gone quiet come first. Your
  child picks one of each, here or in the child view, and the day's options
  and picks are saved. Very young learners may get a gentle review day
  instead. On a rest day or during a break there are no choices: the path
  says "Rest day" or "<Break> until <date>" and names the next learning day.
- **From the calendar.** Topics scheduled for today. Opening a lesson or a
  refresher quiz from here needs a local AI provider.
- **Stepping stones next.** Unlocked, age-appropriate topics to try next.
- **Subjects, recent growth and recent evidence.** Per-subject progress, recent
  status changes and the latest records. The parent view shows numbers by
  design ("Only you can see this").
- **Quick buttons.** **Record what happened** (voice), **Note**, **Open map**,
  and a button with your child's name that opens the child view.

## Child view

Opened from the button with your child's name on the dashboard. **Grown-ups**
returns to the parent view.

**The grown-up PIN.** Set or change a 4-digit **Child-view PIN** from the
parent sidebar (or the learner menu on a phone). When one is set, **Grown-ups**
asks for it and pauses for 15 seconds (doubling on further misses) after 5
wrong tries; without one, **Grown-ups** returns straight to the parent view. It
keeps a child from leaving with one tap. It is not a lock: four digits are
easy to guess, and reloading the page always returns to the parent view, which
is also the way back if you forget it. Harrington keeps only a scrambled
(salted, hashed) copy of the PIN, never the digits themselves, and an export
carries only that copy. To clear it, open **Child-view PIN** on the parent side
and choose **Remove PIN**, or close every Harrington tab and remove
`parentPinHash` and `parentPinSalt` from `settings` in the family data file.

- **My garden.** One plant per subject, described in words, never numbers.
- **Story time and number time.** Today's literacy and numeracy options for
  your child to pick from.
- **Tell about my day.** A voice note saved to the learner's records.
- **See how it works.** On a topic card, the topic's interactive figure, when
  it has one (some Science topics for ages 5 to 8).
- **Plant something new, Memory walk, Beat the clock.** These open a test,
  recall cards or a challenge. Needs a local AI provider; see the README.

The child view itself shows no levels, XP or percentages.

## Map

The connected curriculum, in two modes.

- **World map.** The nine subjects as realms, with their domains as dots sized
  by topic count. Mastery shows as a quiet tint rather than a percentage.
- **Skill tree.** Enter a domain to see its topics as a tree. Solid links are
  **required** foundations; dashed links are **helpful** ones. Gateway domains
  that feed this one are shown too.
- **Quest log.** Select a topic to see the foundations it needs, what it
  unlocks, and buttons to open the topic page, **record evidence**, or **mark
  it as learning**. "Open full lesson" needs a local AI provider.
- **List.** Prefer text? Switch to the list and drill from subject to domain
  to age band to topic.

## Find a topic

**Find a topic** (on the dashboard, under the greeting, and on every skill
tree) turns a request such as "how to tell the time" or "fractions" into topics
from the curriculum map. It runs on this computer and uses no AI.

- **Closest topics.** Up to eight matches, ranked by how well the words fit
  the topic's name, area and description. Common words ("clock" for time,
  "halves" for fractions) count too. Topics in your learner's age band rank a
  little higher, but nothing is hidden for being younger or older. If nothing
  fits, try other words: a simpler one, or the name of the subject.
- **Path.** Choose a match to see the required foundations still in the way,
  foundations first, each with its stage (Seed, Sprout, Bud or Bloom), and how
  many steps are left. Helpful (dashed) foundations are not listed; the topic
  page shows them.
- **Next ready step.** The first step whose foundations are all mastered, with
  **Open topic page**, **Add to today**, **Plan it** (pick a day in the
  calendar) and **Find on skill tree**.
- **Request log.** Every request is kept under the learner, with the topic you
  chose, newest first (the last 50). It is part of the family data, so it is
  in exports and backups.

The map only holds the Marble topics; a subject it does not cover cannot
be found yet.

## Growth stages and mastery

Progress is shown as a plant:

| Stage | Meaning |
| --- | --- |
| **Seed** | Foundations not yet in place |
| **Sprout** | Ready to start |
| **Bud** | Being learned |
| **Bloom** | Mastered |

The same stages appear on the map, the dashboard and the child's garden.

You decide a topic's status. Use **Mark as learning** in the quest log, or open
**Set status manually instead** on the topic page to choose not started,
learning, practicing or mastered. A topic unlocks once every required
foundation is mastered.

## Topic page

Open a topic from the map, the dashboard or a record.

**Works today:** description, the **Teaching guide** for many Mathematics
and Science topics (see [Teaching guides](#teaching-guides)), **What mastery
looks like**, a **Quick check** prompt, how the topic connects (comes before
/ leads to), records for the topic, activity and game ideas, reference links,
and manual status.

**See how it works.** Some Science topics for ages 5 to 8 have an
interactive figure: press the buttons and the parts move, with their labels
lighting up as they work. Labels start on; **Labels on** hides them.
**Full size** opens the figure on a page of its own. It works
offline, needs no AI provider and saves nothing. The same figure is on the
topic card in the child view.

**Check mastery by observation** works without AI. Press it under the topic
mastery test, ask the suggested question or just watch your child at work, and
tick each piece of evidence you see. Add a note if you like, typed or as a
voice note. When every item is ticked, the topic is marked mastered, just as
passing a quiz would. Fewer ticks are still saved in Records, and nothing
changes. A section counts as passed once every topic in it has passed a quiz
or an observation check. Topics marked by placement, by the workbook or by
hand do not count toward that, so those sections keep their own check. When
the last section of a subject passes this way, the subject does too. Records
and Insights label these checks "observed". Your child's view never shows
them; their topic card asks the same things as "Can you…?"

**Reference links** are searches on Khan Academy, BBC Bitesize, Wikipedia and
YouTube. YouTube results are not filtered for children, so the link reads
"YouTube search (supervise)".

**Needs a local AI provider; see the README:** open full lesson, print & go
materials, the topic mastery test, the challenge, recall cards, "Explain
simply", "Make a mini-quiz", and step-by-step instructions for an activity.

## Teaching guides

Many Mathematics and Science topics have a **Teaching guide** on their topic
page: about 500 of 576 Mathematics topics and about 550 of 576 Science topics.
Other subjects have none yet, so their topic pages have no guide section. A
guide needs no AI provider. Press the heading to open it. It has:

- a short summary of what the child is learning and where they usually get
  stuck;
- a few **activities**, each with its steps, what your child should notice,
  and what to say when they take a wrong turn;
- **Check understanding**: a task or question to ask, what a strong answer
  sounds like, follow-up questions, common wrong turns (what you may notice,
  what to try next, and sometimes an earlier topic to go back to), and how to
  tell "Not yet", "Getting there" and "Got it" apart;
- the sources the guide draws on (curricula and papers) as plain links.

**Print** in the guide's header opens the whole guide as a page to print, with
every activity written out, the sources as plain web addresses and Marble's
note and credit at the foot. It names no learner, so one copy serves the whole
family. It uses the same large type as a printed lesson, so a typical guide
runs five to seven pages.

Without an AI provider, **Open the teaching guide** comes first wherever a
lesson would otherwise need one: the topic page, the calendar day and the
map's quest log. The **Check mastery by observation** window also offers the
guide's question as a second one to ask.

The guides come from Marble's teaching research. Every guide ends with
Marble's own note on it, word for word: "Agent-authored teaching research and
proposed learning activities; not empirically validated interventions." In
plain words, and in Harrington's own words just below it: AI agents wrote
these from teaching research, and they are ideas to try, not methods tested in
studies. Use your own judgment. Harrington shows the text as Marble published
it, with credit: *From the Marble Skill Taxonomy teaching research ·
© Generative Spark, Inc. (Marble) · CC BY-SA 4.0.* The Harrington server
downloads the research once (about 24 MB) the first time a topic page is
opened (without an AI provider, also the calendar or the map's quest log) and
keeps it with the curriculum. If that download fails, it tries again a few
minutes later.

## Calendar

A day-by-day plan from your start date, on the home days you choose.

- **Start date.** Change it and the plan reschedules.
- **Home days and breaks.** Topics go on your home days (Monday to Friday
  unless you change them under **Home days & breaks**). Other days and the
  breaks you add are rest days: nothing is scheduled, and the plan picks up
  after them. A rest day pauses the daily rhythm (no new topics, choices or
  refreshers); its day panel says until when and names the next learning day.
- **Month grid and day panel.** Each home day lists its topics, under "New
  today" for today and "New on <weekday>" for any other day.
- **Younger topics first.** Literacy and numeracy topics below your child's
  age that are not mastered yet are catch-up topics, each placed after what
  it builds on. Placement marks what they already know.
- **Catch-up pace.** **Catch-up first** (the default) teaches every catch-up
  topic before the first topic at your child's own age. **Mixed** alternates
  two catch-up topics with one own-age topic, so own-age topics start in the
  first week and catch-up takes longer. The calendar says what the current
  pace means for your child: the day it reaches that point, and about how
  many calendar weeks away it is (breaks included). Switching pace
  reschedules topics only; done days, moved topics and extras stay.
- **Refreshers.** Refresher quizzes and activities come only from mastered
  topics, so there are none until something is mastered. The stretch
  challenge only suggests topics whose prerequisites are mastered.
- **Bend the plan.** **Mark done**, **move** a topic to the next home day or
  any date, and **add extras** to any day. A day marked done that later
  becomes a rest day keeps its check, and you can still reopen it.
- **Extra practice.** An Extra practice item retries the questions your child
  missed on that topic's tests. If none are due for it, it says so and offers
  all due retries as a separate button.
- Opening a lesson, test, challenge or recall review from a day needs a local
  AI provider; see the README.

## Australian Curriculum

Harrington can follow the Australian Curriculum, version 9, from Foundation to
Year 6. It is optional; without it, topics are ordered by age as before.

- **Year level.** In a learner's details (or when you add your first
  learner), tick **Follow the Australian Curriculum** and choose an
  **Australian Curriculum year level**. It starts from the age (Foundation is
  5, Year 1 is 6, and so on to Year 6 at 11) and you can change it.
- **What changes.** Topics linked to that year, and unmastered topics linked
  to the year below, come first in the daily choices, the map list, the topic
  finder and the suggested placement. Nothing is hidden or locked.
- **Codes on topics.** A topic page lists the content descriptions the Marble
  Skill Taxonomy links it to, for example "AC9M2N01 · Year 2 · Number", with
  ACARA's notice below them. Tap a code to read its text. A link is Marble's
  map, not a check that the content description is met.
- **Coverage report.** Records > **Australian Curriculum coverage** lists each
  content description for the year by learning area, with the linked topics
  and a status from your own records: **Linked topics mastered** (every
  linked topic mastered), **Evidence** (a record such as an observation, a
  passed check or challenge, or practice for a linked topic) or **Not yet**.
  A saved lesson is a plan, not evidence, so it does not count. Counts per
  learning area are at the top. **Print report** prints it with every area
  expanded, the date and the ACARA notice, for example as evidence for home
  education registration.

ACARA's notice for the Australian Curriculum content is in the README.

## Decodable books

Printable reading books that use only the sounds your child can already read,
to colour in, fold and staple. They need no AI provider, and nothing about
them leaves this computer.

**Set the level.** Open **Reading & books** in the sidebar (on a phone:
**Reading** beside the learner in the learner selector). The **Reading**
section lists the sounds in the order the school teaches them: set 1 is
s a t p, set 2 i m f c, then o d g l, h b n v, e qu z r, u y j k,
x w ck sh, ch th wh ng, then two consonants together (stop, mist), then
ai ay and ee ea. Doubled letters (ss, ff, ll, zz, tt, pp, mm, bb, dd, gg,
nn, rr) count as their single sound. A word with a sound the sequence has not
reached (oo in book, ar in car, the e that changes cake) does not count as
readable letter by letter. Tick the sounds your child knows, or tick
**Whole set**. The line at the top says where that puts them ("Reading at
set 3. Next sounds: h b n v"). Nothing else stores a level: every book
follows the ticks, so when your child learns a sound, tick it.

- **Find the level** shows one set at a time. Point to each sound, ask what it
  says, and tap the ones your child says straight away. **Done** fills the
  checklist.
- **Tricky words** (the, is, I, to …) are ticked to match the sounds until you
  change one; then the list is yours, and **Back to the usual words** follows
  the sounds again.
- **Add a sound** and **Add a word** add your own (for example oa or said).
- **Printing**: whether to print the learner's name on the cover (on by
  default; the name only goes on the paper) and the usual layout.

**Books for your child.** **Books for …** lists the built-in books whose every
word your child can read, newest sounds first, with **Print booklet**,
**Print flat** and **Save to library**. Books a few sounds further on are
shown faded with what they need ("needs: w ck sh").

**Make a new book** writes a new six-sentence story (or ten, for a 12-page
book) from the sounds your child knows, favouring the sounds you pick to
practise (the newest set to start with). **Shuffle** writes another. Every
word is checked against the ticks before the book is shown. The story's
names come from a made-up list, and any that matches the first name of a
learner in your family is left out (this is checked in the browser; nothing
is sent). The cover lists the practice sounds the story actually uses.

**Library** keeps the books you saved, to print again or remove.

**Printing.** Print opens the book in a new window with the print dialog; save
it as a PDF there if you like. **Flat** is one A5 page per sheet in reading
order. **Booklet** puts two pages on each side of A4 landscape paper: print
double-sided, flip on the short edge, fold the stack in half and staple. Each
book has a cover with its title, sounds, a picture and "This book belongs to",
numbered story pages with one sentence and a picture each, and a back page
with the sounds, tricky words, the words to sound out and tips for reading it
together. The pictures are black outlines to colour in.

## Records and recordings

- **Records.** Log an observation, question, discussion or assessment,
  optionally linked to a topic, with a title, notes and a confidence rating.
  Filter by type and open the linked topic from any record.
- **Archived topics.** When a curriculum update retires a topic you had
  worked on, nothing you recorded is lost: Records lists it as an archived
  topic with what is kept, and it no longer counts toward progress or daily
  choices.
- **Voice recording.** Record a conversation from the dashboard, a topic page
  or the child view. Audio is saved on the computer that runs Harrington and
  plays back inline.
- **Live transcript.** Live transcript uses your browser's speech service,
  which may send audio to the browser vendor. There is no switch for it in
  Harrington yet; if you prefer, write a note instead of recording. Firefox
  does not offer a live transcript.
- **Recordings folder.** From the dashboard: every recording, grouped by
  section, with playback and transcript.
- **Discussion analysis.** Advice based on a transcript or your notes. Needs a
  local AI provider; see the README.

## Insights

- **Subject summary.** How many topics are mastered, practicing, learning or
  not started in each subject.
- **Recommended next.** The best unlocked topics in that subject.
- **Observation checks.** The topics, sections and subjects you checked by
  watching, each labelled "observed".
- **Progress review, subject test and adaptive suggestions.** Needs a local AI
  provider; see the README.

## Notifications

The bell lists things that need a parent, worked out on this computer from
your own data (no AI is involved):

- **Today's picks are still open.** On a home day (see Home days & breaks),
  from 3 pm, for a learner with no literacy or numeracy pick yet.
- **No evidence this week.** A learner with no record in the last 7 days.
- **Backup older than 7 days.** The newest archive `npm run backup` wrote
  (to `backups/`, or `HARRINGTON_BACKUP_DIR` when set) is more than a week old.
- **No backup recorded.** No archive is there at all. It links to the
  README's "Backup and restore" section. If you back up another way (a Docker
  volume, say), dismiss it and it stays quiet for 30 days.

Items carry the learner they are about; the bell opens on the active learner,
and "All learners" shows everyone. The button reads "Notifications, 2 new" to
a screen reader. Dismiss an item once it is handled: picks come back on the
next home day, evidence after the next quiet week, and a backup reminder a week
later (30 days for "No backup recorded"). A welcome item appears once on first
run. The curriculum is downloaded once and does not update on its own, so the
bell does not report curriculum changes.

## Privacy and data

- Learners, progress, records, recordings and settings are stored in the
  private data folder (`data/private/`) on the computer that runs Harrington.
  The server listens only on that computer by default. When it is shared with
  your other devices, each device can be asked to sign in once with the family
  access token, and the in-app Guide says which applies.
- Nothing leaves your devices unless you configure an AI provider. If you do,
  lessons, printables, activities, "Explain simply", mini-quizzes, recall cards,
  tests and challenges send it topic text and the topic's age from the
  curriculum. Whole-subject tests and progress reviews send your child's exact
  age; a discussion analysis sends their exact age too, alongside the linked
  topic's age. Topic and section tests also say when you have approved harder
  questions because your child is excelling. A progress review sends mastery
  counts, recent topic names and statuses, record counts and the average
  confidence rating. A discussion analysis sends the transcript; analyses and
  progress reviews send your notes only when you tick "Include my notes in this
  request". Learner names are replaced with "the child" before any request is
  built; a nickname, especially one that is an ordinary word, is sent as spoken,
  as are other people's names in a transcript. Record titles and interests are
  never sent. The live transcript is the exception described above.
- Harrington has no user accounts and does not encrypt traffic itself; the
  optional family access token is the only sign-in, and HTTPS comes from a mesh
  or proxy (docs/DEPLOYMENT.md). Do not expose Harrington to the public
  internet.

## What needs an AI provider

Everything below stays off until a provider is set under **AI provider** in
the sidebar, or `HARRINGTON_AI_BASE_URL` and `HARRINGTON_AI_MODEL` are set (see
the README), and each feature's capability is switched on:

- Ready-to-teach lessons and print & go materials
- Topic, section and subject mastery tests (quizzes), and certificates. The
  observation check on a topic page needs no AI and can master topics,
  sections and subjects on its own.
- Timed challenges and adaptive (parent-approved) difficulty suggestions
- Recall cards and memory review
- Activity instructions, "Explain simply" and "Make a mini-quiz"
- Discussion analysis and progress reviews

---

*Curriculum: Marble Skill Taxonomy (v1) · © Generative Spark, Inc. · licensed
under ODbL 1.0 (database) and CC BY-SA 4.0 (content). Teaching guides: from the
Marble Skill Taxonomy teaching research · © Generative Spark, Inc. (Marble) ·
CC BY-SA 4.0.*

*Australian Curriculum content: see ACARA's notice in the README.*
