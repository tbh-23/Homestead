import { el, esc, refreshIcons, openModal, toast } from '../ui.js';
import { authEnabled, isShared, storedOn, whereItRuns } from '../hosting.js';
import { ACARA_NOTICE } from '../curriculum.js';

// ---- Content shared by the welcome tour and the full guide ----
// One line for every feature that calls the AI adapter, so the copy never
// promises something an unconfigured server cannot do.
const NEEDS_AI = 'Needs a local AI provider; see the README.';
// The recorder has no in-app switch for live transcription yet, so say what
// the parent can actually do instead.
const SPEECH_NOTE = `Live transcript uses your browser's speech service, which may send audio to the browser vendor. There is no switch for it in Harrington yet; if you prefer, write a note instead of recording.`;

// Built when the tour or guide opens: where Harrington runs is known only
// after /api/health answers.
export const features = () => [
  {
    icon: 'compass', color: '#3f6b3b',
    title: 'Welcome to Harrington',
    tagline: 'A quiet map for your family',
    body: `Harrington helps you see where your child is in a connected curriculum and keep a record of what really happened each day. ${whereItRuns()} This short tour shows what works today.`,
  },
  {
    icon: 'layout-dashboard', color: '#2f6285',
    title: 'Dashboard',
    tagline: 'Your view of the day',
    body: `<b>Today's path</b> offers a short literacy choice and a short numeracy choice, two options each, for your child to pick from. You also see stepping stones to try next, subject progress, and recent evidence. Quick buttons record what happened, add a note, or open the map.`,
  },
  {
    icon: 'sprout', color: '#8a6412',
    title: 'Child view',
    tagline: 'Plants and words, no scores',
    body: `Open it from the button with your child's name on the dashboard. It shows their garden, today's story time and number time picks, and <b>Tell about my day</b> for a voice note. The garden uses growth stages, never numbers. The activity buttons (Plant something new, Memory walk, Beat the clock): ${NEEDS_AI}`,
  },
  {
    icon: 'map', color: '#3f6b3b',
    title: 'Map',
    tagline: 'The connected curriculum',
    body: `The <b>world map</b> shows the nine subject realms. Enter a domain to see its <b>skill tree</b>: required and helpful foundations, what each topic unlocks, and a quest log for the selected topic. Prefer text? Switch to the <b>list</b> and drill from subject to domain to age band to topic.`,
  },
  {
    icon: 'flower-2', color: '#a4473a',
    title: 'Growth stages',
    tagline: 'Seed, Sprout, Bud, Bloom',
    body: `Progress is shown as a plant: <b>Seed</b> (foundations not yet in place), <b>Sprout</b> (ready to start), <b>Bud</b> (being learned) and <b>Bloom</b> (mastered). You set a topic's status yourself: "Mark as learning" in the quest log, or "Set status manually instead" on the topic page.`,
  },
  {
    icon: 'calendar-days', color: '#a4473a',
    title: 'Calendar',
    tagline: 'A plan you can bend',
    body: `A day-by-day plan from your start date, on the home days you choose, with breaks as rest days. <b>Move</b> a topic to another day, <b>mark days done</b>, and <b>add extras</b>. The plan is yours to change. Opening a lesson, test, challenge or recall review from a day: ${NEEDS_AI}`,
  },
  {
    icon: 'mic', color: '#5b4a86',
    title: 'Records & recordings',
    tagline: 'Keep the evidence',
    body: `Log observations, questions, discussions and assessments, optionally linked to a topic, or <b>record a conversation</b>. Recordings are kept ${storedOn()} in a recordings folder. ${SPEECH_NOTE} AI discussion analysis: ${NEEDS_AI}`,
  },
  {
    icon: 'sparkles', color: '#2f6285',
    title: 'Insights',
    tagline: 'Subject by subject',
    body: `See how many topics are mastered, practicing, learning or not started in each subject, and the best unlocked topics to try next. Progress reviews and adaptive suggestions: ${NEEDS_AI}`,
  },
  {
    icon: 'notebook-text', color: '#5b4a86',
    title: 'Lessons, tests & more',
    tagline: 'Optional, and off by default',
    body: `Ready-to-teach lessons, print & go sheets, mastery tests, timed challenges, recall cards and "Explain simply" are all written by an AI model. ${NEEDS_AI} Without one, these buttons show “Needs a local AI provider” instead.`,
  },
  {
    icon: 'book-open', color: '#3f6b3b',
    title: 'Guide',
    tagline: 'Come back anytime',
    body: `Reopen this tour or read the full guide from <b>Guide</b> in the sidebar, or the book icon at the top of the screen on a phone.`,
  },
];

const SEEN_KEY = 'harrington:welcomeSeen';

// Show the welcome tour automatically the first time (per browser).
export function maybeShowWelcome() {
  try { if (localStorage.getItem(SEEN_KEY)) return; } catch {}
  openWelcomeTour();
}

function openWelcomeTour() {
  let i = 0;
  const body = el(`<div class="p-0">
    <div id="slide" class="px-6 pt-8 pb-5 text-center"></div>
    <div class="px-6 pb-6">
      <div id="dots" class="flex items-center justify-center gap-1.5 mb-5"></div>
      <div class="flex items-center gap-2">
        <button id="skip" class="px-4 py-2.5 rounded-xl text-ink-soft text-sm font-medium hover:bg-paper transition-colors">Skip</button>
        <button id="back" class="px-4 py-2.5 rounded-xl border border-paper-line text-sm font-medium hover:border-ink-faint/40 transition-colors hidden">Back</button>
        <button id="next" class="flex-1 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Next</button>
      </div>
    </div>
  </div>`);
  const slide = body.querySelector('#slide');
  const dots = body.querySelector('#dots');
  const backBtn = body.querySelector('#back');
  const nextBtn = body.querySelector('#next');

  const slides = features();
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} };

  const render = () => {
    const f = slides[i];
    slide.innerHTML = `
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style="background:${f.color}18">
        <i data-lucide="${f.icon}" class="w-8 h-8" style="color:${f.color}"></i>
      </div>
      <p class="text-xs font-600 uppercase tracking-wide mb-1" style="color:${f.color}">${f.tagline}</p>
      <h3 class="font-display text-2xl font-600 mb-2">${f.title}</h3>
      <p class="text-sm text-ink-soft leading-relaxed max-w-sm mx-auto">${f.body}</p>`;
    dots.innerHTML = slides.map((_, n) => `<span class="h-1.5 rounded-full transition-all ${n === i ? 'w-5' : 'w-1.5'}" style="background:${n === i ? f.color : '#d9ccb0'}"></span>`).join('');
    backBtn.classList.toggle('hidden', i === 0);
    nextBtn.textContent = i === slides.length - 1 ? 'Start learning' : 'Next';
    refreshIcons();
  };

  backBtn.onclick = () => { if (i > 0) { i--; render(); } };
  nextBtn.onclick = () => { if (i < slides.length - 1) { i++; render(); } else { markSeen(); m.close(); } };
  body.querySelector('#skip').onclick = () => { markSeen(); m.close(); };

  const m = openModal(body);
  render();
}

// The full, scrollable reference guide (opened from "Guide" in the desktop
// sidebar or the book icon in the mobile header).
export function openGuide() {
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-center gap-3 z-10">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="book-open" class="w-5 h-5 text-brand-dark"></i></span>
      <div class="flex-1 min-w-0">
        <h3 class="font-display text-lg font-600 leading-tight">How Harrington works</h3>
        <p class="text-xs text-ink-faint">What works today, and what needs an AI provider</p>
      </div>
      <button id="tour" class="text-xs font-medium text-brand-dark shrink-0 flex items-center gap-1"><i data-lucide="play-circle" class="w-3.5 h-3.5"></i>Replay tour</button>
    </div>
    <div class="px-5 pt-4">
      <button id="download" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="download" class="w-4 h-4"></i>Download the full guide (PDF)</button>
      <p class="text-[11px] text-ink-faint text-center mt-1.5">Opens a printable version — choose "Save as PDF" to keep a copy.</p>
      <a href="/docs/GUIDE.md" download="Harrington-GUIDE.md" class="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-brand-dark hover:underline"><i data-lucide="file-text" class="w-3.5 h-3.5"></i>Download the written guide (GUIDE.md)</a>
    </div>
    <div id="list" class="px-5 py-4 space-y-3"></div>
  </div>`);
  const list = body.querySelector('#list');
  features().forEach(f => {
    list.appendChild(el(`<div class="flex gap-3 rounded-xl border border-paper-line bg-paper p-3.5">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:${f.color}18"><i data-lucide="${f.icon}" class="w-4.5 h-4.5" style="color:${f.color}"></i></span>
      <div>
        <p class="font-600 text-sm">${f.title}</p>
        <p class="text-xs text-ink-soft leading-relaxed mt-1">${f.body}</p>
      </div>
    </div>`));
  });
  const m = openModal(body, { wide: true });
  body.querySelector('#tour').onclick = () => { m.close(); openWelcomeTour(); };
  body.querySelector('#download').onclick = () => downloadGuide();
  refreshIcons();
}

// ---- Full, detailed, printable/downloadable guide ----
// Built when the guide opens, so it reflects how this server is shared.
// Exported for tests/copy.test.mjs, which checks the shared-mode wording.
export const guideSections = () => [
  { h: 'What Harrington is', items: [
    ['Overview', `A self-hosted family learning platform. It shows a connected curriculum as a map, offers small daily choices, and keeps a record of what your child actually did. ${whereItRuns()}`],
    ['Who it’s for', 'A parent teaching one or more children at home. You are the teacher: Harrington helps you see foundations and next steps and keep evidence. It does not script the day.'],
    ['What needs AI', `Lessons, print & go sheets, mastery tests, challenges, recall cards, activity instructions, “Explain simply”, discussion analysis, progress reviews and adaptive suggestions are written by an AI model. ${NEEDS_AI} Without one, those buttons show “Needs a local AI provider” instead.`],
  ]},
  { h: 'The curriculum (from the Marble Skill Taxonomy)', items: [
    ['Source', 'The curriculum comes from the open-source Marble Skill Taxonomy (github.com/withmarbleapp/os-taxonomy).'],
    ['Scale', 'About 1,845 topics joined by about 3,941 prerequisite links, across 9 subjects: Mathematics, English, Science, History, Geography, Personal & Social Development, Life Skills, Computing, and Learning to Learn.'],
    ['Each topic includes', 'A plain-language description, an approximate age range, “evidence of mastery” criteria, a quick-check prompt, and links to the curriculum standards it aligns to.'],
    ['Prerequisites', 'Topics are linked by “depends on” connections, each tagged required or helpful. Harrington shows these exactly as the source data has them.'],
    ['Downloaded once', `The Harrington server downloads the curriculum the first time it starts (this needs the internet) and keeps it ${storedOn()}. It does not update on its own.`],
    ['Licensing', 'Marble Skill Taxonomy (v1) © Generative Spark, Inc., licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content).'],
    ['Teaching guides', 'From the Marble Skill Taxonomy teaching research · © Generative Spark, Inc. (Marble) · CC BY-SA 4.0 (github.com/withmarbleapp/os-taxonomy, creativecommons.org/licenses/by-sa/4.0). Shown as published; any edit Harrington makes to the text would be marked.'],
  ]},
  { h: 'Australian Curriculum', items: [
    ['Year level', 'In a learner’s details (and when adding the first learner), tick “Follow the Australian Curriculum” and choose a year level, Foundation to Year 6. It starts from the age (Foundation is 5, Year 1 is 6 … Year 6 is 11) and you can change it. Topics linked to that year, and unmastered topics linked to the year below, come first in daily choices, the map list, the finder and placement; nothing is hidden.'],
    ['Codes on topics', 'A topic page lists the version 9 content descriptions the Marble Skill Taxonomy links it to, such as “AC9M2N01 · Year 2 · Number”, with ACARA’s notice below them. Tap one to read its text. A link is Marble’s map, not a check that the description is met.'],
    ['Coverage report', 'Records > Australian Curriculum coverage lists each content description for the year, by learning area, with its linked topics and a status from your own records: Linked topics mastered (every linked topic mastered), Evidence (a record such as an observation, a passed check or challenge, or practice for a linked topic) or Not yet. A saved lesson is a plan, not evidence, so it does not count. Print it with “Print report”.'],
    ['Licensing', ACARA_NOTICE],
  ]},
  { h: 'Getting started', items: [
    ['Start Harrington', authEnabled()
      ? 'Run the Harrington server on one computer and open its address in a browser. There is no account; each device signs in once with the family access token (see docs/DEPLOYMENT.md).'
      : `Run the Harrington server and open its ${isShared() ? 'address' : 'local address'}. There is no account and no sign-in.`],
    ['Add a learner', 'Enter a name, birth year and, if you like, birth month. Harrington uses the age to suggest age-appropriate topics and to build the calendar; with the month the age is exact. Add more learners, switch between them, or edit a name, birthday or color with the pencil button, from the selector at the top of the sidebar (or the round button at the top right on a phone).'],
    ['Level-set workbook', 'Works without AI. In the learner selector, press Workbook beside a learner (next to Placement). For literacy, then numeracy, it goes one area at a time, starting each area at its topics for about one year below their age; a sheet is never more than twelve topics, with “Can they…?” questions. Mark each Yes, Not yet or Unsure and save the sheet; saving keeps your answers and marks nothing. All Yes moves that area up a year and all Not yet moves it down one; one area never stops another. Then it asks about the foundations of each Not yet until it can say where to start. At the end it lists, subject by subject, everything your Yes answers would mark mastered, and confirming writes it as one record you can undo. Unsure topics then wait for an observation check on their topic page. Print a sheet if you prefer paper. Answers save as you go, so you can stop and resume; it shows the sitting’s time and suggests a pause at twenty minutes.'],
    ['Navigate', 'The sidebar (or the bottom bar on a phone) has Dashboard, Calendar, Map, Records and Insights. The sidebar also has Reading & books; on a phone, press Reading beside a learner in the learner selector. Guide is in the sidebar, or behind the book icon at the top of the screen on a phone. The child view opens from the dashboard.'],
  ]},
  { h: 'Dashboard', items: [
    ['Today’s path', 'A short literacy choice and a short numeracy choice, two options each, drawn from the literacy and numeracy focus domains. Your child picks one of each; the day’s options and picks are saved.'],
    ['From the calendar', 'Topics scheduled for today. Opening a lesson or quiz from here needs AI.'],
    ['Stepping stones', 'Unlocked, age-appropriate topics to try next.'],
    ['Subjects and growth', 'Per-subject progress, recent growth, and recent evidence. Numbers are shown here because this is the parent view.'],
    ['Quick buttons', 'Record what happened (voice), add a note, open the map, or open your child’s view.'],
  ]},
  { h: 'Child view', items: [
    ['Opening it', 'Press the button with your child’s name on the dashboard. “Grown-ups” returns to the parent view.'],
    ['The grown-up PIN', 'The first time, you choose a 4-digit PIN; after that “Grown-ups” asks for it. It keeps a child from leaving with one tap. It is not a lock: four digits are easy to guess, and reloading the page always returns to the parent view, which is also the way back if you forget it. Harrington keeps only a scrambled (salted, hashed) copy of the PIN, never the digits themselves, and an export carries only that copy.'],
    ['What your child sees', 'Their garden (one plant per subject, described in words), today’s story time and number time picks, and “Tell about my day” for a voice note. No levels, XP or percentages in the view itself.'],
    ['Activity buttons', `Plant something new, Memory walk and Beat the clock open a test, recall cards or a challenge. ${NEEDS_AI}`],
  ]},
  { h: 'Map', items: [
    ['World map', 'The nine subjects as realms, with their domains as dots sized by topic count. Mastery is shown as a quiet tint, not a percentage.'],
    ['Skill tree', 'Enter a domain to see its topics as a tree with required and helpful links, and links to gateway domains.'],
    ['Quest log', 'Select a topic to see the foundations it needs, what it unlocks, and buttons to open the topic page, record evidence, or mark it as learning. “Open full lesson” needs AI.'],
    ['List', 'Prefer text? Switch to the list and drill from subject to domain to age band to topic.'],
    ['Find a topic', 'Type what your learner wants to learn (“how to tell the time”, “fractions”). Harrington matches it against the curriculum on this computer, without AI, shows the foundations still in the way and the next ready step, and keeps the request in the learner’s log.'],
  ]},
  { h: 'Growth stages and mastery', items: [
    ['Growth stages', 'Seed (foundations not yet in place), Sprout (ready to start), Bud (being learned) and Bloom (mastered). The same stages appear on the map, the dashboard and the child garden.'],
    ['Setting status', 'You decide. Use “Mark as learning” in the quest log, or open “Set status manually instead” on the topic page to choose not started, learning, practicing or mastered.'],
    ['Unlocking', 'A topic is ready once every required foundation is mastered.'],
  ]},
  { h: 'Topic page', items: [
    ['Works today', 'Description, what mastery looks like, a quick-check prompt, how the topic connects, records for the topic, activity ideas, reference links and manual status.'],
    ['Teaching guide', 'Works without AI. Many Mathematics and Science topics have a guide from Marble’s teaching research: a summary, activities with steps and what to say after a wrong turn, and a way to check understanding. Each guide ends with Marble’s own note: “Agent-authored teaching research and proposed learning activities; not empirically validated interventions.” Without an AI provider, “Open the teaching guide” comes first wherever a lesson would need one. Print, in its header, gives the whole guide on paper (no learner’s name on it).'],
    ['See how it works', 'Some Science topics for ages 5 to 8 have a figure your child can press: parts move and their labels light up as they work. It works offline and saves nothing. It is in the child view too.'],
    ['Check by observation', 'Works without AI. Ask the suggested question or watch your child at work, then tick each piece of evidence you see; add a typed or voice note if you like. Every item ticked marks the topic mastered, just like passing a quiz. Fewer ticks are kept in Records and change nothing. A section passes once every topic in it has passed a quiz or an observation check (topics marked by placement or by hand do not count), and the last section passes the subject. Records and Insights label these “observed”; your child’s view never shows them.'],
    ['Reference links', 'Khan Academy, BBC Bitesize and Wikipedia searches, plus YouTube searches. YouTube results are not filtered for children, so supervise.'],
    ['Needs AI', `Full lesson, print & go, the topic mastery test, challenge, recall cards, “Explain simply”, “Make a mini-quiz”, and step-by-step activity instructions. ${NEEDS_AI}`],
  ]},
  { h: 'Calendar', items: [
    ['Start date', 'The plan begins on your start date; change it and the plan reschedules.'],
    ['Daily plan', 'Topics go on your home days (Monday to Friday unless you change them in Home days & breaks). Other days and breaks are rest days with nothing scheduled; the plan picks up after them.'],
    ['Younger topics first', 'Literacy and numeracy topics below your child’s age that are not mastered yet come first, each after what it builds on. Placement marks what they already know.'],
    ['Refreshers', 'Refresher quizzes and activities come only from mastered topics, so there are none until something is mastered.'],
    ['Bend the plan', 'Mark days done, move a topic to another day, and add extras to any day.'],
    ['Needs AI', `Opening a lesson, test, challenge or recall review from a day. ${NEEDS_AI}`],
  ]},
  { h: 'Decodable books', items: [
    ['Set the level', 'Works without AI. Open Reading & books and tick the sounds your child reads, set by set in the order the school teaches them (s a t p first), or tick Whole set. The line at the top says where that puts them (“Reading at set 3. Next sounds: h b n v”); nothing else stores a level. Find the level shows one set at a time to fill the same ticks. Tricky words (the, is, I …) follow the sounds until you change one. Add a sound and Add a word add your own.'],
    ['Books for your child', 'Built-in books whose every word your child can read, newest sounds first, each with Print booklet, Print flat and Save to library. Books a few sounds further on are faded, with what they need (“needs: w ck sh”).'],
    ['Make a new book', 'Writes a new 8- or 12-page story from the ticked sounds, favouring the sounds you pick to practise; Shuffle writes another. Every word is checked against the ticks first. The story’s names come from a made-up list, and any that matches a learner’s first name is left out; nothing is sent anywhere. The cover lists the practice sounds the story uses. Save it to the library to print again.'],
    ['Printing', 'Print opens the book in a new window with the print dialog. Flat is one A5 page per sheet; Booklet puts two pages on each side of A4 landscape: print double-sided, flip on the short edge, fold and staple. The pictures are black outlines to colour in, and the learner’s name goes on the cover only if you leave that on.'],
  ]},
  { h: 'Records and recordings', items: [
    ['Records', 'Log observations, questions, discussions or assessments, optionally linked to a topic, with notes and a confidence rating. Filter by type.'],
    ['Archived topics', 'When a curriculum update retires a topic you had worked on, nothing you recorded is lost: Records lists it as an archived topic with what is kept, and it no longer counts toward progress or daily choices.'],
    ['Voice recording', `Record a conversation from the dashboard, a topic page, or the child view. Audio is saved ${storedOn()} and plays back inline.`],
    ['Live transcript', SPEECH_NOTE],
    ['Recordings folder', 'Every recording, grouped by section or topic, with playback and transcript. Recordings without either sit under "Not linked to a section".'],
    ['Discussion analysis', `Advice based on a transcript or your notes. ${NEEDS_AI}`],
  ]},
  { h: 'Insights', items: [
    ['Subject summary', 'How many topics are mastered, practicing, learning or not started in each subject.'],
    ['Recommended next', 'The best unlocked topics to work on in that subject.'],
    ['Observation checks', 'Topics, sections and subjects you checked by watching, each labelled “observed”.'],
    ['Needs AI', `Progress reviews, subject tests and adaptive suggestions. ${NEEDS_AI}`],
  ]},
  { h: 'Notifications', items: [
    ['The bell', 'Lists what needs a parent, worked out on this computer without AI. It opens on the active learner; choose All learners to see everyone. Dismiss an item once it is handled.'],
    ['What it watches', '“Today’s picks are still open” from 3 pm on a home day; “No evidence this week” when a learner has no record for 7 days; a backup older than 7 days (run npm run backup); and, if no backup is recorded at all, a note that links to the README’s backup section and stays quiet for 30 days once dismissed.'],
  ]},
  { h: 'Privacy', items: [
    ['Where data lives', isShared()
      ? `Learners, progress, records, recordings and settings are stored in the private data folder ${storedOn()}. It is shared with your other devices, which only show it in a browser. ${authEnabled() ? 'Each device signs in once with the family access token.' : 'No access token is set, so anyone who can reach it can open it.'}`
      : 'Learners, progress, records, recordings and settings are stored in the private data folder on this computer. The server listens only on this computer by default.'],
    [isShared() ? 'What leaves your devices' : 'What leaves your home', `Nothing, unless you configure an AI provider. If you do, lessons, printables, activities, “Explain simply”, mini-quizzes, recall cards, tests and challenges send it topic text and the topic’s age from the curriculum. Whole-subject tests and progress reviews send your child’s exact age; a discussion analysis sends their exact age too, alongside the linked topic’s age. Topic and section tests also say when you have approved harder questions because your child is excelling. A progress review sends mastery counts, recent topic names and statuses, record counts and the average confidence rating. A discussion analysis sends the transcript; analyses and progress reviews send your notes only when you tick “Include my notes in this request”. Learner names are replaced with “the child” before any request is built; a nickname, especially one that is an ordinary word, is sent as spoken, as are other people’s names in a transcript. Record titles and interests are never sent. ${SPEECH_NOTE}`],
    ['Not for the internet', `${authEnabled() ? 'The access token is the only sign-in, and Harrington does not encrypt traffic itself; use HTTPS from your network mesh or a local proxy (docs/DEPLOYMENT.md).' : 'There is no sign-in or encryption yet.'} Do not expose Harrington to the public internet.`],
  ]},
];

function downloadGuide() {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to download the guide', 'error'); return; }
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const sections = guideSections().map(sec => `
    <section>
      <h2>${esc(sec.h)}</h2>
      ${sec.items.map(([t, b]) => `<div class="row"><div class="t">${esc(t)}</div><div class="b">${esc(b)}</div></div>`).join('')}
    </section>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Harrington — Complete Guide</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Georgia,'Times New Roman',serif;color:#2e2a24;margin:0;padding:56px 64px;line-height:1.55;max-width:860px;margin:0 auto}
    .brand{display:flex;align-items:center;gap:10px;margin-bottom:6px}
    .logo{width:34px;height:34px;border-radius:8px;background:#3f6b3b;color:#fff;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-weight:700;font-size:18px}
    h1{font-size:30px;margin:6px 0 4px}
    .sub{color:#6b665d;font-size:14px;margin-bottom:6px}
    .intro{background:#e4eedf;border-radius:10px;padding:14px 18px;font-size:15px;margin:18px 0 26px}
    h2{font-size:16px;text-transform:uppercase;letter-spacing:.06em;color:#2e4f2b;border-bottom:2px solid #ede3cf;padding-bottom:6px;margin:30px 0 12px}
    .row{display:grid;grid-template-columns:190px 1fr;gap:14px;padding:7px 0;border-bottom:1px solid #f0ece3}
    .row .t{font-weight:700;font-size:14px}
    .row .b{font-size:14px;color:#3a362f}
    footer{margin-top:36px;padding-top:14px;border-top:1px solid #ede3cf;font-size:11px;color:#6f665a}
    section{break-inside:avoid}
    @media print{body{padding:0.6in}a{color:inherit}}
  </style></head><body>
    <div class="brand"><span class="logo">H</span><span style="font-size:20px;font-weight:700">Harrington</span></div>
    <h1>Complete Feature Guide</h1>
    <div class="sub">A self-hosted family learning platform &middot; Generated ${date}</div>
    <div class="intro">Harrington shows the open Marble Skill Taxonomy (about 1,845 connected topics across 9 subjects) as a map for parents, offers small daily choices, and keeps a record of what your child actually did. Features marked “Needs a local AI provider” stay off until you configure one; see the README.</div>
    ${sections}
    <footer>Curriculum: Marble Skill Taxonomy (v1) &middot; © Generative Spark, Inc. &middot; licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content). Tip: in the print dialog, choose “Save as PDF” as the destination to download this guide.</footer>
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
  </body></html>`);
  w.document.close();
}
