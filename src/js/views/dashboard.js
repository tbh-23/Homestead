import { SUBJECTS, getData } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, fmtDateTime } from '../ui.js';
import { studentStats, recommendedNext, recentActivity, MASTERY } from '../mastery.js';
import { openRecordForm } from './records.js';
import { openRecorder } from '../recorder.js';
import { keyOf, topicsOn, dailyExtras } from '../scheduler.js';
import { openMasteryTest } from './masterytest.js';
import { openRecordingsLibrary } from './recordings.js';
import { openDueRecall } from './recall.js';
import { openDuePractice } from './practice.js';
import { setTimelineSubject } from './timeline.js';
import { BADGES } from '../game.js';
import { openKidMode } from './kidmode.js';

export function renderDashboard(params, { navigate }) {
  const active = store.activeStudent();
  const root = el(`<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to get started.</p>`)); return root; }

  const age = store.studentAge(active);
  const stats = studentStats(active.id);

  // Greeting header
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  root.appendChild(el(`<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
    <div>
      <p class="text-sm text-ink-faint">${greet}</p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${active.name}'s learning</h1>
      <p class="text-ink-soft text-sm mt-0.5">Age ${age} · ${stats.totalMastered} of ${stats.total} topics mastered across ${Object.keys(SUBJECTS).length} subjects</p>
    </div>
    <div class="flex gap-2">
      <button id="qtime" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"><i data-lucide="git-branch" class="w-4 h-4"></i>Open timeline</button>
      <button id="qmic" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#b0413a] hover:bg-[#963731] text-white text-sm font-medium transition-colors"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
      <button id="qrec" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-paper-card border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors"><i data-lucide="plus" class="w-4 h-4"></i>Note</button>
    </div>
  </div>`));
  root.querySelector('#qtime').onclick = () => navigate('timeline');
  root.querySelector('#qmic').onclick = () => openRecorder(active.id);
  root.querySelector('#qrec').onclick = () => openRecordForm(active.id);

  // Adaptive suggestion nudge
  const pending = store.pendingSuggestions(active.id);
  if (pending.length) {
    const banner = el(`<button class="w-full text-left rounded-2xl border border-brand/30 bg-brand-light/50 p-4 mb-6 flex items-center gap-3 hover:bg-brand-light transition-colors">
      <span class="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shrink-0"><i data-lucide="trending-up" class="w-5 h-5 text-white"></i></span>
      <span class="flex-1 min-w-0">
        <span class="block font-600 text-sm">${pending.length} adaptive suggestion${pending.length > 1 ? 's' : ''} for ${active.name}</span>
        <span class="block text-xs text-ink-soft">${active.name} is excelling — review ideas to raise the challenge. You decide.</span>
      </span>
      <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0"></i>
    </button>`);
    banner.onclick = () => navigate('insights');
    root.appendChild(banner);
  }

  // Streak tracker
  root.appendChild(streakCard(active));

  // Level, XP & badges (+ Kid Mode launch)
  root.appendChild(gameCard(active));

  // Overall progress ring + subject breakdown
  const overview = el(`<div class="grid lg:grid-cols-3 gap-4 mb-6"></div>`);

  // big progress card
  overview.appendChild(el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 flex items-center gap-5">
    ${ring(stats.pct)}
    <div>
      <p class="text-3xl font-700 font-display">${stats.pct}%</p>
      <p class="text-sm text-ink-soft">overall mastery</p>
      <p class="text-xs text-ink-faint mt-1">${stats.totalMastered} topics mastered</p>
    </div>
  </div>`));

  // recommended next (spans 2)
  const nextCard = el(`<div class="lg:col-span-2 bg-paper-card border border-paper-line rounded-2xl p-5">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="footprints" class="w-4.5 h-4.5 text-brand-dark"></i>Work on next</h2>
      <span class="text-xs text-ink-faint">mastery-ordered</span>
    </div>
    <div id="next" class="grid sm:grid-cols-2 gap-2"></div>
  </div>`);
  const nextWrap = nextCard.querySelector('#next');
  const nexts = recommendedNext(active.id, 4);
  if (nexts.length === 0) {
    nextWrap.appendChild(el(`<p class="text-sm text-ink-faint col-span-2">Everything available is mastered — explore the timeline to go further.</p>`));
  } else {
    nexts.forEach(n => {
      const meta = SUBJECTS[n.topic.subject];
      const row = el(`<button class="text-left flex items-start gap-2.5 p-2.5 rounded-xl border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors">
        <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-600 truncate">${n.topic.name}</span>
          <span class="block text-xs text-ink-faint truncate">${n.topic.subject} · ${MASTERY[n.status].label}</span>
        </span>
      </button>`);
      row.onclick = () => navigate('topic', { id: n.topic.id });
      nextWrap.appendChild(row);
    });
  }
  overview.appendChild(nextCard);
  root.appendChild(overview);

  // Today's plan (from the calendar track)
  root.appendChild(todayCard(active, navigate));

  // Active recall due today
  const dueRecall = store.recallDueCount(active.id);
  const recallCard = el(`<button class="w-full text-left rounded-2xl border ${dueRecall ? 'border-brand/30 bg-brand-light/50' : 'border-paper-line bg-paper-card'} p-4 mb-6 flex items-center gap-4 hover:border-brand/40 transition-colors">
    <span class="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0"><i data-lucide="brain" class="w-5.5 h-5.5 text-brand-dark"></i></span>
    <span class="flex-1 min-w-0">
      <span class="block font-600">Active recall${dueRecall ? ` · ${dueRecall} due` : ''}</span>
      <span class="block text-sm text-ink-soft">${dueRecall ? 'Quick memory review keeps what they\u2019ve learned from fading.' : 'Practice recall on any topic; reviews will show up here when they\u2019re due.'}</span>
    </span>
    <span class="shrink-0 flex items-center gap-1.5 text-sm font-medium text-brand-dark">${dueRecall ? 'Review' : 'Study'}<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
  </button>`);
  recallCard.onclick = () => openDueRecall();
  root.appendChild(recallCard);

  // Spaced practice: missed mastery-test questions retried on an expanding schedule
  const duePractice = store.practiceDueCount(active.id);
  const practiceCard = el(`<button class="w-full text-left rounded-2xl border ${duePractice ? 'border-brand/30 bg-brand-light/50' : 'border-paper-line bg-paper-card'} p-4 mb-6 flex items-center gap-4 hover:border-brand/40 transition-colors">
    <span class="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0"><i data-lucide="repeat" class="w-5.5 h-5.5 text-brand-dark"></i></span>
    <span class="flex-1 min-w-0">
      <span class="block font-600">Spaced practice${duePractice ? ` · ${duePractice} due` : ''}</span>
      <span class="block text-sm text-ink-soft">${duePractice ? `Retry the mastery-test questions ${active.name} missed, before they fade.` : 'Missed test questions come back here on a spaced schedule until they stick.'}</span>
    </span>
    <span class="shrink-0 flex items-center gap-1.5 text-sm font-medium text-brand-dark">${duePractice ? 'Practice' : ''}<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
  </button>`);
  practiceCard.onclick = () => openDuePractice();
  root.appendChild(practiceCard);

  // Subject grid — each with a circular completion ring
  root.appendChild(el(`<h2 class="font-600 mb-3 flex items-center gap-2"><i data-lucide="layout-grid" class="w-4.5 h-4.5 text-ink-soft"></i>Subjects</h2>`));
  const grid = el(`<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6"></div>`);
  Object.keys(SUBJECTS).forEach(sub => {
    const meta = SUBJECTS[sub];
    const s = stats.per[sub];
    const card = el(`<button class="text-left bg-paper-card border border-paper-line rounded-2xl p-4 card-hover flex items-center gap-3.5">
      <span class="shrink-0">${miniRing(s.pct, meta.color, meta.icon)}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-600 truncate">${sub}</span>
        <span class="block text-xs text-ink-faint mt-0.5">${s.mastered}/${s.total} mastered</span>
        <span class="block text-xs font-600 mt-0.5" style="color:${meta.color}">${s.pct}% complete</span>
      </span>
    </button>`);
    card.onclick = () => { setTimelineSubject(sub); navigate('timeline'); };
    grid.appendChild(card);
  });
  root.appendChild(grid);

  // Recordings folder
  const recCount = store.recordingsFor(active.id).length;
  const recFolder = el(`<button class="w-full text-left bg-paper-card border border-paper-line rounded-2xl p-5 mb-6 flex items-center gap-4 hover:border-[#b0413a]/40 transition-colors">
    <span class="w-11 h-11 rounded-xl bg-[#b0413a]/10 flex items-center justify-center shrink-0"><i data-lucide="folder" class="w-5.5 h-5.5 text-[#b0413a]"></i></span>
    <span class="flex-1 min-w-0">
      <span class="block font-600">Recordings folder</span>
      <span class="block text-sm text-ink-soft">${recCount ? `${recCount} voice recording${recCount > 1 ? 's' : ''}, grouped by section` : 'Capture and revisit lesson conversations, organized by section'}</span>
    </span>
    <span class="shrink-0 flex items-center gap-1.5 text-sm font-medium text-[#b0413a]">Open<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
  </button>`);
  recFolder.onclick = () => openRecordingsLibrary();
  root.appendChild(recFolder);

  // Recent activity
  const recent = recentActivity(active.id, 6);
  const recentRecords = store.recordsFor(active.id).slice(0, 4);
  const twoCol = el(`<div class="grid lg:grid-cols-2 gap-4"></div>`);

  const actCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <h2 class="font-600 flex items-center gap-2 mb-3"><i data-lucide="activity" class="w-4.5 h-4.5 text-brand-dark"></i>Recent progress</h2>
    <div id="act" class="space-y-2"></div>
  </div>`);
  const actWrap = actCard.querySelector('#act');
  if (recent.length === 0) actWrap.appendChild(el(`<p class="text-sm text-ink-faint">No progress recorded yet. Open the timeline to begin.</p>`));
  recent.forEach(a => {
    const meta = SUBJECTS[a.topic.subject];
    const row = el(`<button class="w-full text-left flex items-center gap-2.5 py-1.5">
      <span class="w-2 h-2 rounded-full shrink-0" style="background:${MASTERY[a.status].color}"></span>
      <span class="flex-1 min-w-0 text-sm truncate">${a.topic.name}</span>
      <span class="text-xs font-medium shrink-0" style="color:${MASTERY[a.status].color}">${MASTERY[a.status].label}</span>
    </button>`);
    row.onclick = () => navigate('topic', { id: a.topic.id });
    actWrap.appendChild(row);
  });
  twoCol.appendChild(actCard);

  const recCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="notebook-pen" class="w-4.5 h-4.5 text-brand-dark"></i>Latest records</h2>
      <button id="allrec" class="text-xs font-medium text-brand-dark">View all</button>
    </div>
    <div id="rec" class="space-y-2.5"></div>
  </div>`);
  recCard.querySelector('#allrec').onclick = () => navigate('records');
  const recWrap = recCard.querySelector('#rec');
  if (recentRecords.length === 0) recWrap.appendChild(el(`<p class="text-sm text-ink-faint">No records yet.</p>`));
  recentRecords.forEach(r => {
    recWrap.appendChild(el(`<div class="text-sm">
      <div class="flex items-center gap-2 text-xs text-ink-faint mb-0.5"><span class="capitalize font-medium text-ink-soft">${r.type}</span><span>·</span><span>${fmtDateTime(r.createdAt)}</span></div>
      <p class="text-ink-soft clamp-2 leading-snug">${r.title || r.note || ''}</p>
    </div>`));
  });
  twoCol.appendChild(recCard);
  root.appendChild(twoCol);

  // attribution footer
  root.appendChild(el(`<p class="text-[11px] text-ink-faint mt-8 text-center leading-relaxed">Curriculum from the Marble Skill Taxonomy (v1) · © Generative Spark, Inc. · licensed under ODbL 1.0 &amp; CC BY-SA 4.0</p>`));

  refreshIcons();
  return root;
}

function todayCard(active, navigate) {
  const todayKey = keyOf(new Date());
  const topics = topicsOn(active, todayKey);
  const extras = dailyExtras(active, todayKey);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="calendar-check" class="w-4.5 h-4.5 text-brand-dark"></i>Today · ${dateLabel}</h2>
      <button id="cal" class="text-xs font-medium text-brand-dark flex items-center gap-1">Open calendar<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
    </div>
    <div id="body" class="grid sm:grid-cols-2 gap-2.5"></div>
  </div>`);
  card.querySelector('#cal').onclick = () => navigate('calendar');
  const body = card.querySelector('#body');

  if (topics.length === 0) {
    body.appendChild(el(`<p class="text-sm text-ink-faint sm:col-span-2">No new topics scheduled today — a review day. Try the refresher below.</p>`));
  } else {
    topics.slice(0, 4).forEach(t => {
      const meta = SUBJECTS[t.subject];
      const row = el(`<button class="text-left flex items-center gap-2.5 p-2.5 rounded-xl border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors">
        <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
        <span class="flex-1 min-w-0"><span class="block text-sm font-600 truncate">${t.name}</span><span class="block text-xs text-ink-faint truncate">${t.subject}</span></span>
      </button>`);
      row.onclick = () => navigate('topic', { id: t.id });
      body.appendChild(row);
    });
  }

  // refresher quick action
  if (extras.refresher) {
    const t = extras.refresher;
    const meta = SUBJECTS[t.subject];
    const ref = el(`<button class="text-left flex items-center gap-2.5 p-2.5 rounded-xl border border-dashed border-paper-line hover:border-brand/40 hover:bg-paper transition-colors sm:col-span-2">
      <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="dumbbell" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-600 truncate">Refresher quiz · ${t.name}</span><span class="block text-xs text-ink-faint truncate">Keep an earlier ${t.subject} skill sharp</span></span>
      <i data-lucide="file-check-2" class="w-4 h-4 shrink-0" style="color:${meta.color}"></i>
    </button>`);
    ref.onclick = () => openMasteryTest(t.subject, null, t);
    body.appendChild(ref);
  }

  return card;
}

function ring(pct) {
  const r = 32, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<svg width="84" height="84" viewBox="0 0 84 84" class="shrink-0">
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="#ece7dd" stroke-width="8"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="#3f7d5e" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 42 42)"/>
  </svg>`;
}

// Small per-subject completion ring with the subject icon in the middle.
function miniRing(pct, color, icon) {
  const r = 20, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<span class="relative inline-flex items-center justify-center" style="width:52px;height:52px">
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="#ece7dd" stroke-width="5"/>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 26 26)"/>
    </svg>
    <i data-lucide="${icon}" class="w-4 h-4 absolute" style="color:${color}"></i>
  </span>`;
}

function gameCard(student) {
  const g = store.gameState(student.id);
  const earned = store.earnedBadges(student.id);
  const earnedCount = Object.keys(earned).length;

  const card = el(`<div class="rounded-2xl border border-paper-line bg-paper-card p-5 mb-6">
    <div class="flex items-center gap-4">
      <span class="relative w-14 h-14 rounded-2xl bg-brand flex items-center justify-center shrink-0">
        <span class="text-xl font-800 font-display text-white">${g.level}</span>
      </span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-600">Level ${g.level}</span>
          <span class="text-xs text-ink-faint">${g.into} / ${g.need} XP</span>
        </div>
        <div class="h-2 rounded-full bg-paper-line overflow-hidden"><div class="mbar h-full rounded-full bg-brand" style="width:${g.pct}%"></div></div>
        <p class="text-xs text-ink-faint mt-1">${g.xp.toLocaleString()} total XP · ${earnedCount} badge${earnedCount === 1 ? '' : 's'}</p>
      </div>
      <button id="kid" class="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"><i data-lucide="gamepad-2" class="w-4 h-4"></i>Kid Mode</button>
    </div>
    <div id="badges" class="flex flex-wrap gap-2 mt-4"></div>
  </div>`);
  card.querySelector('#kid').onclick = () => openKidMode();

  const bwrap = card.querySelector('#badges');
  BADGES.forEach(b => {
    const has = !!earned[b.id];
    bwrap.appendChild(el(`<span class="w-9 h-9 rounded-xl flex items-center justify-center ${has ? '' : 'opacity-30 grayscale'}" style="background:${b.color}1a" title="${b.name}${has ? '' : ' (locked)'} — ${b.desc}"><i data-lucide="${b.icon}" class="w-4.5 h-4.5" style="color:${b.color}"></i></span>`));
  });
  return card;
}

function streakCard(student) {
  const streak = store.activityStreak(student.id);
  const today = store.activeToday(student.id);
  // Motivational message tuned to the streak length.
  let msg;
  if (streak === 0) msg = 'Do a lesson or a recall review today to start a streak!';
  else if (!today) msg = `You're on a ${streak}-day streak — do something today to keep it alive!`;
  else if (streak < 3) msg = 'Great start — come back tomorrow to build the habit.';
  else if (streak < 7) msg = 'Nice momentum! Consistency is what makes learning stick.';
  else if (streak < 30) msg = 'Fantastic dedication — this streak is really paying off!';
  else msg = 'Incredible commitment. You\u2019re unstoppable!';

  const flame = streak > 0 ? '#c08a2e' : '#c9c3b8';
  const card = el(`<div class="rounded-2xl border border-paper-line bg-paper-card p-4 mb-6 flex items-center gap-4">
    <span class="relative w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style="background:${flame}1a">
      <i data-lucide="flame" class="w-7 h-7" style="color:${flame}"></i>
    </span>
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-1.5">
        <span class="text-2xl font-700 font-display" style="color:${streak > 0 ? '#1c1a17' : '#8a847a'}">${streak}</span>
        <span class="text-sm font-600 text-ink-soft">day${streak === 1 ? '' : 's'} in a row</span>
        ${today ? '<span class="ml-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-brand text-white">Active today</span>' : ''}
      </div>
      <p class="text-sm text-ink-soft mt-0.5 leading-snug">${msg}</p>
    </div>
  </div>`);
  return card;
}
