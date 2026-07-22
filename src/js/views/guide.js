import { el, refreshIcons, openModal, toast } from '../ui.js';
import * as store from '../store.js';

// ---- Content shared by the welcome tour and the full guide ----
const FEATURES = [
  {
    icon: 'compass', color: '#3f7d5e',
    title: 'Welcome to Homestead',
    tagline: 'A mastery-based path from age 5 to 13.',
    body: `Homestead turns a connected curriculum of ~1,590 micro-topics into a clear learning path where every idea is truly mastered before the next begins — and the whole experience adapts to your child. This quick tour shows you around.`,
  },
  {
    icon: 'trending-up', color: '#2f6049',
    title: 'The mastery ladder',
    tagline: 'Topic → Section → Subject',
    body: `Pass a <b>topic</b> test (90%+) to master it. Master every topic in a <b>section</b> to unlock its section check. Pass every section to unlock the final <b>subject</b> test. Nothing unlocks until the step below is solid.`,
  },
  {
    icon: 'layout-dashboard', color: '#3d6b93',
    title: 'Dashboard',
    tagline: 'Your daily snapshot',
    body: `See overall mastery, what to work on next, today's plan, per-subject progress, and recent activity. Quick buttons let you open the timeline, record a conversation, or add a note.`,
  },
  {
    icon: 'calendar-days', color: '#b0603a',
    title: 'Calendar',
    tagline: 'An adaptive daily plan',
    body: `A day-by-day track from your start date to age 13. Each day lists its topics plus auto-rotating <b>refreshers</b>. Miss a day, get ahead, or get stuck? <b>Move</b> topics to any day, <b>mark days done</b>, and <b>add extra practice</b> — the plan adapts to you.`,
  },
  {
    icon: 'git-branch', color: '#3f7d5e',
    title: 'Timeline',
    tagline: 'The connected map',
    body: `Explore each subject as gated sections. Every topic shows its prerequisites and what it unlocks. Open a topic for its <b>lesson</b>, <b>print & go materials</b>, activities, and its <b>mastery test</b>.`,
  },
  {
    icon: 'notebook-text', color: '#7a5a9e',
    title: 'Lessons & printables',
    tagline: 'Zero prep',
    body: `Every topic has a ready-to-teach lesson with a "say this / do this" script and <b>parent notes</b> (what to focus on, likely struggles, advice). Print-and-go worksheets, flashcards, and more are one tap away — and saved for reuse.`,
  },
  {
    icon: 'file-check-2', color: '#3d6b93',
    title: 'Tests you can trust',
    tagline: 'Every answer verified',
    body: `Each topic, section, and subject has a test — digital (auto-graded) or printable/hands-on. Questions are written by a strong AI, then <b>independently re-solved</b> to throw out anything wrong or ambiguous. 90% passes.`,
  },
  {
    icon: 'zap', color: '#c08a2e',
    title: 'Challenges & adaptivity',
    tagline: 'The platform adapts to your child',
    body: `After mastery, an optional <b>timed challenge</b> stretches your child for fun. Strong results prompt Homestead to suggest making that area harder — <b>you approve or decline</b>, always in control.`,
  },
  {
    icon: 'mic', color: '#b0413a',
    title: 'Records & voice analysis',
    tagline: 'Capture and understand',
    body: `Log observations, questions, and discussions — or <b>record a conversation</b> with a live transcript. Homestead can <b>analyze</b> it and tell you where and <i>why</i> your child may be misunderstanding, with advice on what to do next.`,
  },
  {
    icon: 'sparkles', color: '#3f7d5e',
    title: 'Insights & notifications',
    tagline: 'Guidance for you',
    body: `Insights gives per-subject progress reviews and next steps. The <b>bell</b> keeps you posted on curriculum updates (it auto-refreshes from the open repository), new adaptive suggestions, and challenge best scores.`,
  },
];

const SEEN_KEY = 'homestead:welcomeSeen';

// Show the welcome tour automatically the first time (per browser).
export function maybeShowWelcome() {
  try { if (localStorage.getItem(SEEN_KEY)) return; } catch {}
  openWelcomeTour();
}

export function openWelcomeTour() {
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

  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} };

  const render = () => {
    const f = FEATURES[i];
    slide.innerHTML = `
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style="background:${f.color}18">
        <i data-lucide="${f.icon}" class="w-8 h-8" style="color:${f.color}"></i>
      </div>
      <p class="text-xs font-600 uppercase tracking-wide mb-1" style="color:${f.color}">${f.tagline}</p>
      <h3 class="font-display text-2xl font-600 mb-2">${f.title}</h3>
      <p class="text-sm text-ink-soft leading-relaxed max-w-sm mx-auto">${f.body}</p>`;
    dots.innerHTML = FEATURES.map((_, n) => `<span class="h-1.5 rounded-full transition-all ${n === i ? 'w-5' : 'w-1.5'}" style="background:${n === i ? f.color : '#d9d3c7'}"></span>`).join('');
    backBtn.classList.toggle('hidden', i === 0);
    nextBtn.textContent = i === FEATURES.length - 1 ? 'Start learning' : 'Next';
    refreshIcons();
  };

  backBtn.onclick = () => { if (i > 0) { i--; render(); } };
  nextBtn.onclick = () => { if (i < FEATURES.length - 1) { i++; render(); } else { markSeen(); m.close(); } };
  body.querySelector('#skip').onclick = () => { markSeen(); m.close(); };

  const m = openModal(body);
  render();
}

// The full, scrollable reference guide (opened from the sidebar "Guide" link).
export function openGuide() {
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-center gap-3 z-10">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="book-open" class="w-5 h-5 text-brand-dark"></i></span>
      <div class="flex-1 min-w-0">
        <h3 class="font-display text-lg font-600 leading-tight">How Homestead works</h3>
        <p class="text-xs text-ink-faint">A quick guide to every feature</p>
      </div>
      <button id="tour" class="text-xs font-medium text-brand-dark shrink-0 flex items-center gap-1"><i data-lucide="play-circle" class="w-3.5 h-3.5"></i>Replay tour</button>
    </div>
    <div class="px-5 pt-4">
      <button id="download" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="download" class="w-4 h-4"></i>Download the full guide (PDF)</button>
      <p class="text-[11px] text-ink-faint text-center mt-1.5">Opens a printable version — choose "Save as PDF" to keep a copy.</p>
    </div>
    <div id="list" class="px-5 py-4 space-y-3"></div>
  </div>`);
  const list = body.querySelector('#list');
  FEATURES.forEach(f => {
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
const GUIDE_SECTIONS = [
  { h: 'What Homestead is', items: [
    ['Overview', 'A mastery-based homeschool platform for ages 5–13. It turns an open, connected curriculum of ~1,590 micro-topics into a clear learning path where every idea is genuinely mastered before the next begins — and the whole experience adapts to your child.'],
    ['How learning is organized', 'Everything is built on three levels: Topics (single teachable ideas) → Sections (a group of related topics in one age band) → Subjects (the eight subject areas). You climb the ladder one verified step at a time.'],
    ['Who it’s for', 'A homeschooling parent teaching one or more children. You are the teacher; Homestead supplies the curriculum, ready-to-teach lessons, tests, tracking, and adaptive guidance.'],
  ]},
  { h: 'The curriculum (from the Marble Skill Taxonomy)', items: [
    ['Source', 'The full curriculum comes from the open-source Marble Skill Taxonomy (github.com/withmarbleapp/os-taxonomy) — a structured, research-backed map of what children learn across the primary/elementary years.'],
    ['Scale', 'About 1,590 micro-topics wired together by ~3,221 prerequisite dependencies, spanning 8 subjects: Mathematics, English, Science, History, Personal & Social Development, Life Skills, Computing, and Learning to Learn.'],
    ['Each topic includes', 'A plain-language description, an approximate age range, “evidence of mastery” criteria, a natural-language quick-check prompt, a type (conceptual / procedural / etc.), and links to the curriculum standards it aligns to (Common Core, NGSS, UK National Curriculum, and more).'],
    ['The prerequisite graph', 'Topics are connected by directed “depends on” links, each tagged hard (required) or soft (helpful) with a one-line reason. Homestead uses these exact links to show what comes before a topic and what it unlocks — and to gate the mastery ladder. Nothing here is invented; it mirrors the source data.'],
    ['Domain summaries', 'Parent-friendly summaries for each subject/domain/age band explain, in a sentence, what your child is learning in that section.'],
    ['Always up to date', 'Homestead fetches the latest curriculum directly from the repository every time it loads, so new or revised material flows in automatically — no updates to install. The Notifications bell tells you what changed.'],
    ['Licensing', 'Marble Skill Taxonomy (v1) © Generative Spark, Inc., licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content).'],
  ]},
  { h: 'Getting started', items: [
    ['Sign in', 'Click “Sign in to begin”. Your students, progress, records, and recordings are saved privately to your own account — nothing is shared or public.'],
    ['Add your first student', 'Enter their name and birth year. Homestead uses the birth year to place them on the age 5–13 timeline and build their calendar.'],
    ['Welcome tour & guide', 'A guided welcome tour runs the first time. You can reopen it or this full guide anytime from “Guide” in the sidebar, and download this document as a PDF.'],
    ['Navigate', 'Use the left sidebar (or the bottom bar on mobile) to move between Dashboard, Calendar, Timeline, Records, and Insights. Switch or add students from the selector at the top of the sidebar.'],
  ]},
  { h: 'The mastery ladder', items: [
    ['Topic', 'A single teachable idea. Pass its topic mastery test (90%+) and it’s marked mastered — passing the test is what marks it mastered.'],
    ['Section', 'A group of related topics within an age band (e.g. “Counting & Cardinality · Age 5”). Once every topic in a section is mastered, its section check unlocks. Pass it to unlock the next section.'],
    ['Subject', 'Once every section is passed, the final subject mastery test (the capstone) unlocks. Passing it certifies the whole subject and offers a printable certificate.'],
    ['Why gating matters', 'Every level needs 90%+, and sections unlock in order, so learning always builds on solid foundations and nothing is skipped.'],
  ]},
  { h: 'Dashboard', items: [
    ['Overview', 'Overall mastery ring, “Work on next” recommendations, and per-subject progress.'],
    ['Today', 'The topics scheduled for today from the calendar, plus a one-tap refresher quiz.'],
    ['Active recall due', 'A card showing how many memory-review cards are due today, launching a mixed recall session.'],
    ['Recordings folder', 'One tap into the general folder of all voice recordings, grouped by section.'],
    ['Nudges & feeds', 'An adaptive-suggestion nudge when your child is excelling, plus recent progress and latest records.'],
    ['Quick actions', 'Open the timeline, record a conversation, or add a note.'],
  ]},
  { h: 'Timeline', items: [
    ['Connected map', 'Explore each subject as gated sections from age 5 to 13, with a banner explaining the topic → section → subject ladder.'],
    ['Topic cards', 'Mastery status plus quick buttons for Lesson, Take test, and Details.'],
    ['Section checks', 'Unlock once all a section’s topics are mastered; locked sections show how many topics remain. Each section also has a Record button.'],
    ['Subject capstone', 'The final subject test unlocks when every section is passed, and offers a printable certificate.'],
    ['Topic page toolkit', 'Topic mastery test, challenge (after mastery), active recall, evidence of mastery, a quick check, AI teaching helper, activities & games, records, section recordings, section check, “How this connects,” and reference links.'],
  ]},
  { h: 'How topics connect', items: [
    ['Comes before', 'Each topic lists the prerequisites to master first, tagged Required or Helpful (straight from the taxonomy) with the reason each matters and its current mastery status.'],
    ['You are here', 'The current topic sits in the middle of a clear top-to-bottom flow with directional arrows.'],
    ['Leads to', 'Shows what mastering this topic unlocks next. Every item is tappable to jump straight to that topic.'],
  ]},
  { h: 'Lessons, printables & activities', items: [
    ['Full lesson', 'A complete, ready-to-teach plan: objective, materials, parent notes (focus / likely struggles / advice), a “say this / do this” script, guided and independent practice, questions, common mistakes, a mastery check, and an extension. Print it or generate a different version.'],
    ['Print & go materials', 'The lowest-prep printables for the topic — worksheets with answer keys, flashcards, matching sheets, tracing pages, sorting cards. Preview, print one, or print all.'],
    ['Activities & games', 'Each idea expands into materials, setup, numbered steps, a worked example, and a tip. Everything generated is saved and reused.'],
  ]},
  { h: 'Tests & mastery', items: [
    ['Every level tested', 'Each topic, section, and subject has its own test. Passing a topic test (90%+) marks the topic mastered.'],
    ['Two formats', 'On-screen (multiple-choice, auto-graded with answer review) or on paper / hands-on (print with answer key, or observe, then tick what was correct — the score is calculated for you).'],
    ['Verified answers', 'Questions are written by a strong AI model, then independently re-solved by a second pass to discard anything ambiguous or wrong; numeric answers are re-checked by a built-in calculator. Digital questions are all multiple-choice for exact, fair grading.'],
    ['Results & certificates', 'Results are saved per student, and passing the subject capstone offers a printable certificate.'],
  ]},
  { h: 'Active recall (retrieval practice)', items: [
    ['What it is', 'The most evidence-backed way to make learning stick: the child answers short questions from memory, then reviews on a spaced schedule.'],
    ['Recall cards', 'Every topic generates 5–7 memory cards (question → concise answer, with an optional hint). Show the answer, then self-rate Missed it / Got it / Easy.'],
    ['Spaced repetition', 'Cards you remember come back on an expanding schedule (1 → 2 → 4 → 8 → 16 → 32 days); missed cards return sooner, locking learning into long-term memory.'],
    ['Where to find it', 'On every topic page (“Active recall”), and as a “Due today” review on the dashboard and in the calendar’s daily extras (mixed across topics for stronger recall).'],
  ]},
  { h: 'Challenges & adaptivity', items: [
    ['Timed challenge', 'After a topic is mastered, an optional beat-the-clock round pitched a little harder — bigger numbers, an extra step, or a taste of what’s next — fun and doable. It tracks a personal best.'],
    ['Adaptivity engine', 'When your child excels (e.g. aces a challenge quickly), Homestead creates a suggestion to pitch that area harder.'],
    ['You’re in control', 'Approve or decline every suggestion from the dashboard nudge or Insights. Approving makes future tests in that area a notch harder; see active adaptations as chips and revert any anytime.'],
  ]},
  { h: 'Calendar — adaptive daily plan', items: [
    ['Start date', 'The track begins the day you sign up; click “Change” to pick any start date and the whole plan reschedules.'],
    ['Daily plan', 'Each day lists its specific topics; weekends are days off. Auto-rotating refreshers (a quiz, an activity/game, and a stretch) draw from earlier and mastered topics, and recall reviews appear when due.'],
    ['Adapt as you go', 'Mark days done, move/push a topic to any day (great when stuck or getting ahead), and add extra practice, a re-teach lesson, a re-test, or a challenge onto any day. Days show a “+N” badge for extras and a check when done.'],
  ]},
  { h: 'Records, voice recording & analysis', items: [
    ['Records', 'Log observations, questions, discussions, or assessments — optionally linked to a topic, with notes and a confidence rating.'],
    ['Voice recording everywhere', 'Record a lesson conversation from the dashboard, any topic, or any section. A live on-screen transcript is captured while you record; audio is stored privately and plays back inline.'],
    ['Recordings folder', 'A general folder (from the dashboard) holds every recording, grouped by section, each with playback, transcript, and analysis.'],
    ['AI summary & advice', 'Homestead reads a recording’s transcript (or your notes) and tells you what the child understands, where and WHY they may be misunderstanding, concrete next steps, and a phrase to try. The summary is saved onto the recording so it stays with it.'],
  ]},
  { h: 'Insights', items: [
    ['Adaptive suggestions', 'Approve/decline difficulty changes and see active adaptations per subject/domain.'],
    ['Progress review', 'An encouraging, AI-written per-subject review drawing on progress and your records: strengths, watch areas, and concrete next steps.'],
    ['Recommended next', 'The best unlocked topics to work on in that subject, plus launching the subject capstone test.'],
  ]},
  { h: 'Homestead Helper (AI chat)', items: [
    ['Ask anything', 'A floating chat button (bottom-right, on every screen) opens an AI teaching coach for you, the parent. Ask things like “my child is struggling with subtraction and telling time — any ideas?”'],
    ['Knows your student', 'It’s grounded in the active child’s real data — age, per-subject mastery, what they’re working on, and your recent notes — so advice is tailored, not generic.'],
    ['Practical & connected', 'It gives concrete activities, ways to re-explain, and checks for understanding, and points you to the right Homestead feature (lesson, printables, recall, challenge, or recording analysis).'],
  ]},
  { h: 'Notifications', items: [
    ['Curriculum updates', 'The curriculum auto-refreshes from the open repository; when topics are added or removed upstream you’re notified with a per-subject breakdown and examples — the new material is already live in your timeline and calendar.'],
    ['Adaptive suggestions', 'A notification when a new “make it harder” suggestion is created.'],
    ['Challenge best scores', 'A celebratory notification when your child beats their personal best. Open the bell to read items and mark them read individually or all at once.'],
  ]},
  { h: 'Multiple students & privacy', items: [
    ['Multiple students', 'Add students anytime and switch in one tap; each keeps their own progress, calendar, records, recordings, challenges, adaptations, and recall schedule.'],
    ['Privacy', 'Everything — students, progress, records, voice recordings, and settings — is stored privately in your own account. The curriculum comes from the open Marble Skill Taxonomy; your child’s data is never published or shared.'],
  ]},
];

function downloadGuide() {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to download the guide', 'error'); return; }
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sections = GUIDE_SECTIONS.map(sec => `
    <section>
      <h2>${esc(sec.h)}</h2>
      ${sec.items.map(([t, b]) => `<div class="row"><div class="t">${esc(t)}</div><div class="b">${esc(b)}</div></div>`).join('')}
    </section>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Homestead — Complete Guide</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Georgia,'Times New Roman',serif;color:#1c1a17;margin:0;padding:56px 64px;line-height:1.55;max-width:860px;margin:0 auto}
    .brand{display:flex;align-items:center;gap:10px;margin-bottom:6px}
    .logo{width:34px;height:34px;border-radius:8px;background:#3f7d5e;color:#fff;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-weight:700;font-size:18px}
    h1{font-size:30px;margin:6px 0 4px}
    .sub{color:#6b665d;font-size:14px;margin-bottom:6px}
    .intro{background:#e7f0ea;border-radius:10px;padding:14px 18px;font-size:15px;margin:18px 0 26px}
    h2{font-size:16px;text-transform:uppercase;letter-spacing:.06em;color:#2f6049;border-bottom:2px solid #ece7dd;padding-bottom:6px;margin:30px 0 12px}
    .row{display:grid;grid-template-columns:190px 1fr;gap:14px;padding:7px 0;border-bottom:1px solid #f0ece3}
    .row .t{font-weight:700;font-size:14px}
    .row .b{font-size:14px;color:#3a362f}
    footer{margin-top:36px;padding-top:14px;border-top:1px solid #ece7dd;font-size:11px;color:#8a847a}
    section{break-inside:avoid}
    @media print{body{padding:0.6in}a{color:inherit}}
  </style></head><body>
    <div class="brand"><span class="logo">H</span><span style="font-size:20px;font-weight:700">Homestead</span></div>
    <h1>Complete Feature Guide</h1>
    <div class="sub">A mastery-based homeschool platform for ages 5–13 &middot; Generated ${date}</div>
    <div class="intro">Homestead turns the open Marble Skill Taxonomy — ~1,590 connected micro-topics across 8 subjects, wired by ~3,221 prerequisites — into a clear learning path where every idea is truly mastered before the next begins, and the whole experience adapts to your child. This guide lists every feature and how to use it.</div>
    ${sections}
    <footer>Curriculum: Marble Skill Taxonomy (v1) &middot; © Generative Spark, Inc. &middot; licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content). Tip: in the print dialog, choose “Save as PDF” as the destination to download this guide.</footer>
    <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
  </body></html>`);
  w.document.close();
}
