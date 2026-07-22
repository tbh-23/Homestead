import { SUBJECTS, getData } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast, openModal } from '../ui.js';
import { keyOf, parseKey, isWeekend, buildPlan, topicsOn, dailyExtras, planStartKey, invalidatePlan } from '../scheduler.js';
import { openLesson } from './lesson.js';
import { openPrintables } from './printables.js';
import { openActivityDetail } from './lesson.js';
import { openMasteryTest } from './masterytest.js';
import { openChallenge } from './challenge.js';
import { openDueRecall } from './recall.js';
import { activityIdeas, gameIdeas } from '../resources.js';
import { MASTERY } from '../mastery.js';

let viewMonth = null;   // Date on the 1st of the shown month
let selectedKey = null; // yyyy-mm-dd

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function renderCalendar(params, { navigate }) {
  const active = store.activeStudent();
  const root = el(`<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  root.appendChild(el(`<div class="mb-4">
    <h1 class="font-display text-2xl sm:text-3xl font-600">Daily Calendar</h1>
    <p class="text-ink-soft text-sm mt-1">A day-by-day learning track for <span class="font-600 text-ink">${active?.name || 'your student'}</span> — with refreshers and extras each day.</p>
  </div>`));

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to see their calendar.</p>`)); return root; }

  // Start-date control
  const startKey = planStartKey(active);
  const startLabel = parseKey(startKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const startBar = el(`<div class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-5 text-sm">
    <span class="flex items-center gap-1.5 text-ink-soft"><i data-lucide="flag" class="w-4 h-4 text-brand-dark"></i>Track starts</span>
    <span class="font-600">${startLabel}</span>
    <button id="changebtn" type="button" class="ml-1 inline-flex items-center gap-1.5 text-brand-dark font-medium cursor-pointer hover:text-brand-dark/80">
      <i data-lucide="pencil" class="w-3.5 h-3.5"></i>Change
    </button>
    <input type="date" value="${startKey}" id="startpick" class="absolute opacity-0 w-0 h-0 pointer-events-none" />
  </div>`);
  const picker = startBar.querySelector('#startpick');
  const applyStart = (val) => {
    if (!val) return;
    store.updateStudent(active.id, { startDate: val });
    invalidatePlan(active.id);
    viewMonth = new Date(parseKey(val).getFullYear(), parseKey(val).getMonth(), 1);
    selectedKey = val;
    toast('Start date updated — track rescheduled', 'success');
    navigate('calendar');
  };
  picker.onchange = () => applyStart(picker.value);
  startBar.querySelector('#changebtn').onclick = () => {
    try {
      if (typeof picker.showPicker === 'function') picker.showPicker();
      else { picker.focus(); picker.click(); }
    } catch (e) {
      // Fallback: prompt for a date if the native picker can't be opened.
      const val = prompt('Enter a start date (YYYY-MM-DD):', picker.value);
      if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) applyStart(val);
    }
  };
  root.appendChild(startBar);

  const plan = buildPlan(active);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!viewMonth) viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!selectedKey) selectedKey = keyOf(today);

  const grid = el(`<div class="grid lg:grid-cols-3 gap-5"></div>`);
  grid.appendChild(monthPanel(active, today, navigate));
  grid.appendChild(dayPanel(active, navigate));
  root.appendChild(grid);

  refreshIcons();
  return root;
}

function monthPanel(active, today, navigate) {
  const wrap = el(`<div class="lg:col-span-2"></div>`);
  const plan = buildPlan(active);

  const header = el(`<div class="flex items-center justify-between mb-4">
    <h2 class="font-display text-xl font-600">${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}</h2>
    <div class="flex items-center gap-1.5">
      <button id="today" class="px-3 py-1.5 rounded-lg border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors">Today</button>
      <button id="prev" class="w-8 h-8 rounded-lg border border-paper-line flex items-center justify-center hover:border-brand/40 transition-colors"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
      <button id="next" class="w-8 h-8 rounded-lg border border-paper-line flex items-center justify-center hover:border-brand/40 transition-colors"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
    </div>
  </div>`);
  header.querySelector('#prev').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); navigate('calendar'); };
  header.querySelector('#next').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); navigate('calendar'); };
  header.querySelector('#today').onclick = () => { const t = new Date(); viewMonth = new Date(t.getFullYear(), t.getMonth(), 1); selectedKey = keyOf(new Date(t.getFullYear(), t.getMonth(), t.getDate())); navigate('calendar'); };
  wrap.appendChild(header);

  // Day-of-week headers
  const dows = el(`<div class="grid grid-cols-7 gap-1.5 mb-1.5"></div>`);
  DOW.forEach(d => dows.appendChild(el(`<div class="text-center text-[11px] font-600 text-ink-faint uppercase tracking-wide">${d}</div>`)));
  wrap.appendChild(dows);

  // Cells — Monday-first grid
  const cells = el(`<div class="grid grid-cols-7 gap-1.5"></div>`);
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  let lead = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();

  for (let i = 0; i < lead; i++) cells.appendChild(el(`<div></div>`));

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    const k = keyOf(date);
    const weekend = isWeekend(date);
    const topics = plan.byDate.get(k) || [];
    const inTrack = plan.firstKey && k >= plan.firstKey && k <= plan.lastKey;
    const isToday = k === keyOf(today);
    const isSel = k === selectedKey;
    const dayDone = store.isDayDone(active.id, k);
    const extraCount = store.extrasOn(active.id, k).length;

    // subject dots + a small topic list (desktop)
    const subs = [...new Set(topics.map(t => t.subject))].slice(0, 4);
    const dots = subs.map(s => `<span class="w-1.5 h-1.5 rounded-full" style="background:${SUBJECTS[s].color}"></span>`).join('');
    const topicList = topics.slice(0, 3).map(t => `<span class="hidden sm:flex items-center gap-1 text-[10px] leading-tight text-ink-soft truncate"><span class="w-1 h-1 rounded-full shrink-0" style="background:${SUBJECTS[t.subject].color}"></span><span class="truncate">${t.name}</span></span>`).join('');
    const moreCount = topics.length - 3;

    const cell = el(`<button class="relative min-h-[64px] sm:min-h-[104px] rounded-xl border p-1.5 sm:p-2 flex flex-col text-left transition-colors ${isSel ? 'border-brand bg-brand-light/50' : 'border-paper-line hover:border-ink-faint/40'} ${dayDone ? 'bg-brand-light/40' : weekend ? 'bg-paper/60' : 'bg-paper-card'}">
      <span class="flex items-center justify-between">
        <span class="text-xs font-600 shrink-0 ${isToday ? 'w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center' : (weekend ? 'text-ink-faint' : 'text-ink')}">${day}</span>
        <span class="flex items-center gap-1">
          ${extraCount ? `<span class="text-[9px] font-600 text-[#c08a2e]">+${extraCount}</span>` : ''}
          ${dayDone ? '<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-brand-dark"></i>' : ''}
        </span>
      </span>
      <span class="flex-1 min-h-0 flex flex-col gap-0.5 mt-1 overflow-hidden">
        ${topics.length ? `<span class="sm:hidden flex items-center gap-0.5 flex-wrap">${dots}</span>${topicList}${moreCount > 0 ? `<span class="hidden sm:block text-[10px] text-ink-faint">+${moreCount} more</span>` : ''}` : (weekend ? '' : (inTrack ? '<span class="hidden sm:block text-[10px] text-ink-faint/70 mt-auto">Review day</span>' : ''))}
      </span>
    </button>`);
    cell.onclick = () => { selectedKey = k; navigate('calendar'); };
    cells.appendChild(cell);
  }
  wrap.appendChild(cells);

  // legend
  wrap.appendChild(el(`<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-4 text-[11px] text-ink-soft">
    ${Object.entries(SUBJECTS).map(([s, m]) => `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:${m.color}"></span>${s}</span>`).join('')}
  </div>`));

  return wrap;
}

function dayPanel(active, navigate) {
  const wrap = el(`<div class="lg:sticky lg:top-6 lg:self-start"></div>`);
  const date = parseKey(selectedKey);
  const plan = buildPlan(active);
  const topics = plan.byDate.get(selectedKey) || [];
  const weekend = isWeekend(date);
  const inTrack = plan.firstKey && selectedKey >= plan.firstKey && selectedKey <= plan.lastKey;
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const done = store.isDayDone(active.id, selectedKey);
  const extras = store.extrasOn(active.id, selectedKey);

  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 space-y-5"></div>`);
  const head = el(`<div class="flex items-start justify-between gap-2">
    <div>
      <p class="text-xs text-ink-faint">${weekend ? 'Weekend' : inTrack ? 'School day' : 'Outside the track'}</p>
      <h2 class="font-display text-xl font-600">${dateLabel}</h2>
    </div>
    <button id="donebtn" class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${done ? 'bg-brand text-white border-transparent' : 'border-paper-line text-ink-soft hover:border-brand/40'}"><i data-lucide="${done ? 'check-circle-2' : 'circle'}" class="w-3.5 h-3.5"></i>${done ? 'Done' : 'Mark done'}</button>
  </div>`);
  head.querySelector('#donebtn').onclick = () => { store.toggleDayDone(active.id, selectedKey); toast(done ? 'Day reopened' : 'Day marked complete', done ? 'default' : 'success'); navigate('calendar'); };
  card.appendChild(head);

  // New topics for the day
  const newBlock = el(`<div><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i>New today</p><div class="space-y-2"></div></div>`);
  const list = newBlock.querySelector('div');
  if (topics.length === 0) {
    list.appendChild(el(`<p class="text-sm text-ink-faint">${weekend ? 'A day off — perfect for a refresher below.' : inTrack ? 'No new topics scheduled — a review day. Try the refreshers below.' : 'This date is outside the 5–13 track.'}</p>`));
  } else {
    topics.forEach(t => list.appendChild(dayTopicRow(t, active, navigate)));
  }
  card.appendChild(newBlock);

  // Extra practice the parent has added
  const exBlock = el(`<div>
    <div class="flex items-center justify-between mb-2">
      <p class="text-xs font-600 uppercase tracking-wide text-ink-faint flex items-center gap-1.5"><i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>Extra practice</p>
      <button id="addextra" class="text-xs font-medium text-brand-dark flex items-center gap-1"><i data-lucide="plus" class="w-3.5 h-3.5"></i>Add</button>
    </div>
    <div id="exlist" class="space-y-2"></div>
  </div>`);
  const exList = exBlock.querySelector('#exlist');
  if (extras.length === 0) {
    exList.appendChild(el(`<p class="text-sm text-ink-faint">Nothing extra added. Use “Add” to schedule more practice, a re-test, or a challenge for this day.</p>`));
  } else {
    extras.forEach(x => exList.appendChild(extraRow(x, active, navigate)));
  }
  exBlock.querySelector('#addextra').onclick = () => openAddExtra(active, selectedKey, navigate);
  card.appendChild(exBlock);

  // Daily extras / refreshers
  card.appendChild(extrasBlock(active, navigate));

  wrap.appendChild(card);
  return wrap;
}

function extraRow(x, active, navigate) {
  const d = getData();
  const meta = SUBJECTS[x.subject] || { color: '#8a847a', icon: 'plus' };
  const kindMeta = {
    lesson: { icon: 'notebook-text', label: 'Extra lesson' },
    retest: { icon: 'file-check-2', label: 'Re-test' },
    challenge: { icon: 'zap', label: 'Challenge' },
    practice: { icon: 'pencil', label: 'Practice' },
  }[x.kind] || { icon: 'plus', label: 'Extra' };
  const row = el(`<div class="rounded-xl border border-paper-line bg-paper p-3 flex items-center gap-2.5">
    <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${kindMeta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-600 truncate">${x.title || x.topicName || kindMeta.label}</p>
      <p class="text-xs text-ink-faint truncate">${kindMeta.label}${x.subject ? ' · ' + x.subject : ''}</p>
    </div>
    <button class="go text-xs font-medium text-brand-dark shrink-0">Open</button>
    <button class="del text-ink-faint hover:text-[#b0413a] p-1 shrink-0"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
  </div>`);
  row.querySelector('.go').onclick = () => {
    const topic = x.topicId ? d.byId.get(x.topicId) : null;
    if (!topic) { navigate('topic', {}); return; }
    if (x.kind === 'lesson' || x.kind === 'practice') openLesson(topic);
    else if (x.kind === 'retest') openMasteryTest(topic.subject, null, topic);
    else if (x.kind === 'challenge') openChallenge(topic);
    else navigate('topic', { id: topic.id });
  };
  row.querySelector('.del').onclick = () => { store.removeExtra(active.id, selectedKey, x.id); navigate('calendar'); };
  return row;
}

function openAddExtra(active, dateKey, navigate) {
  const d = getData();
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-1">Add extra for this day</h3>
    <p class="text-xs text-ink-faint mb-4">Great for reinforcing a tricky topic or stretching a strong one — schedule it on any day.</p>
    <form id="f" class="space-y-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Topic</label>
        <input id="search" placeholder="Search topics\u2026" autocomplete="off" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        <div id="results" class="mt-1 max-h-40 overflow-y-auto space-y-1"></div>
        <input type="hidden" name="topicId" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">What kind?</label>
        <div id="kinds" class="grid grid-cols-2 gap-2"></div>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Day</label>
        <input type="date" name="date" value="${dateKey}" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <button class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Add to day</button>
    </form>
  </div>`);

  let selKind = 'practice', selTopic = null;
  const KINDS = { practice: 'Extra practice', lesson: 'Re-teach lesson', retest: 'Re-test', challenge: 'Challenge' };
  const kindsWrap = body.querySelector('#kinds');
  const renderKinds = () => {
    kindsWrap.innerHTML = '';
    Object.entries(KINDS).forEach(([k, label]) => {
      const on = selKind === k;
      const b = el(`<button type="button" class="px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${on ? 'border-transparent text-white bg-brand' : 'bg-paper text-ink-soft border-paper-line'}">${label}</button>`);
      b.onclick = () => { selKind = k; renderKinds(); };
      kindsWrap.appendChild(b);
    });
  };
  renderKinds();

  const search = body.querySelector('#search');
  const results = body.querySelector('#results');
  const hidden = body.querySelector('input[name="topicId"]');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    results.innerHTML = '';
    if (q.length < 2) return;
    d.topics.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6).forEach(t => {
      const r = el(`<button type="button" class="w-full text-left px-3 py-2 rounded-lg hover:bg-paper text-sm flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${SUBJECTS[t.subject].color}"></span><span class="flex-1 truncate">${t.name}</span><span class="text-xs text-ink-faint">${t.subject}</span></button>`);
      r.onclick = () => { selTopic = t; hidden.value = t.id; search.value = t.name; results.innerHTML = ''; };
      results.appendChild(r);
    });
  });

  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    if (!selTopic) { toast('Pick a topic first', 'error'); return; }
    const fd = new FormData(e.target);
    const day = fd.get('date') || dateKey;
    store.addExtra(active.id, day, {
      kind: selKind, topicId: selTopic.id, topicName: selTopic.name,
      subject: selTopic.subject, title: `${KINDS[selKind]} · ${selTopic.name}`,
    });
    toast('Added to ' + day, 'success');
    m.close();
    selectedKey = day;
    navigate('calendar');
  };
  const m = openModal(body);
}

function dayTopicRow(t, active, navigate) {
  const meta = SUBJECTS[t.subject];
  const status = store.statusOf(active.id, t.id);
  const row = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <button class="open text-left w-full flex items-start gap-2.5">
      <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-600 leading-snug">${t.name}</span>
        <span class="block text-xs text-ink-faint">${t.subject} · ${t.domain}</span>
      </span>
      <span class="w-2 h-2 rounded-full mt-1 shrink-0" style="background:${MASTERY[status].color}"></span>
    </button>
    <div class="flex items-center gap-3 mt-2 pt-2 border-t border-paper-line">
      <button class="lesson text-xs font-medium text-brand-dark flex items-center gap-1"><i data-lucide="notebook-text" class="w-3.5 h-3.5"></i>Lesson</button>
      <button class="test text-xs font-medium flex items-center gap-1" style="color:${meta.color}"><i data-lucide="file-check-2" class="w-3.5 h-3.5"></i>Test</button>
      <button class="push text-xs font-medium text-ink-soft flex items-center gap-1 ml-auto"><i data-lucide="calendar-arrow-down" class="w-3.5 h-3.5"></i>Move</button>
    </div>
  </div>`);
  row.querySelector('.open').onclick = () => navigate('topic', { id: t.id });
  row.querySelector('.lesson').onclick = () => openLesson(t);
  row.querySelector('.test').onclick = () => openMasteryTest(t.subject, null, t);
  row.querySelector('.push').onclick = () => openMoveTopic(t, active, navigate);
  return row;
}

function openMoveTopic(topic, active, navigate) {
  const currentKey = selectedKey;
  const nextDay = nextWeekdayKey(currentKey);
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-1">Move “${topic.name}”</h3>
    <p class="text-xs text-ink-faint mb-4">Stuck on it, or want to get ahead? Move this topic to another day. Its section order still applies.</p>
    <div class="space-y-2 mb-4">
      <button id="tomorrow" class="w-full text-left px-4 py-3 rounded-xl border border-paper-line hover:border-brand/40 transition-colors flex items-center gap-2.5"><i data-lucide="calendar-arrow-down" class="w-4 h-4 text-brand-dark"></i><span class="text-sm font-medium">Push to next school day</span></button>
    </div>
    <form id="f" class="space-y-3">
      <label class="text-sm font-medium block">Or pick a date</label>
      <input type="date" name="date" value="${nextDay}" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      <button class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Move topic</button>
    </form>
  </div>`);
  const doMove = (dayKey) => {
    store.moveTopic(active.id, topic.id, dayKey);
    invalidatePlan(active.id);
    toast(`Moved to ${dayKey}`, 'success');
    m.close();
    selectedKey = dayKey;
    navigate('calendar');
  };
  body.querySelector('#tomorrow').onclick = () => doMove(nextDay);
  body.querySelector('#f').onsubmit = e => { e.preventDefault(); const v = new FormData(e.target).get('date'); if (v) doMove(v); };
  const m = openModal(body);
}

function nextWeekdayKey(dateKey) {
  const d = parseKey(dateKey);
  do { d.setDate(d.getDate() + 1); } while (isWeekend(d));
  return keyOf(d);
}

function extrasBlock(active, navigate) {
  const d = getData();
  const extras = dailyExtras(active, selectedKey);
  const block = el(`<div><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="dumbbell" class="w-3.5 h-3.5"></i>Daily refreshers &amp; extras</p><div class="space-y-2"></div></div>`);
  const list = block.querySelector('div');

  // Active recall due (retrieval practice keeps learning from fading)
  const dueRecall = store.recallDueCount(active.id);
  if (dueRecall > 0) {
    const rc = el(`<div class="rounded-xl border border-brand/30 bg-brand-light/40 p-3">
      <div class="flex items-center gap-2 mb-1"><span class="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-brand text-white">ACTIVE RECALL</span><span class="text-xs text-ink-faint">${dueRecall} card${dueRecall > 1 ? 's' : ''} due</span></div>
      <p class="text-sm font-600 leading-snug flex items-center gap-1.5"><i data-lucide="brain" class="w-4 h-4 text-brand-dark"></i>Memory review</p>
      <p class="text-xs text-ink-soft mt-0.5">Answer from memory to lock in earlier learning.</p>
      <button class="go mt-2 w-full text-sm font-medium text-white rounded-lg py-2 flex items-center justify-center gap-1.5 bg-brand"><i data-lucide="brain" class="w-4 h-4"></i>Start recall review</button>
    </div>`);
    rc.querySelector('.go').onclick = () => openDueRecall();
    list.appendChild(rc);
  }

  // Featured refresher quiz
  if (extras.refresher) {
    const t = extras.refresher;
    const meta = SUBJECTS[t.subject];
    const el1 = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[10px] font-600 px-1.5 py-0.5 rounded-full" style="background:${meta.color}18;color:${meta.color}">REFRESHER QUIZ</span>
        <span class="text-xs text-ink-faint truncate">${t.subject}</span>
      </div>
      <p class="text-sm font-600 leading-snug">${t.name}</p>
      <p class="text-xs text-ink-soft mt-0.5">A quick check on something already learned — keeps it sharp.</p>
      <button class="go mt-2 w-full text-sm font-medium text-white rounded-lg py-2 flex items-center justify-center gap-1.5" style="background:${meta.color}"><i data-lucide="file-check-2" class="w-4 h-4"></i>Give refresher quiz</button>
    </div>`);
    el1.querySelector('.go').onclick = () => openMasteryTest(t.subject, null, t);
    list.appendChild(el1);
  }

  // Featured activity/game
  const at = extras.refresher2 || extras.refresher;
  if (at) {
    const meta = SUBJECTS[at.subject];
    const isGame = extras.featured === 'game';
    const pool = isGame ? gameIdeas(at) : activityIdeas(at);
    const idea = pool[extras.rngSeed % pool.length] || pool[0];
    if (idea) {
      const el2 = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-brand-light text-brand-dark">${isGame ? 'GAME' : 'ACTIVITY'}</span>
          <span class="text-xs text-ink-faint truncate">${at.name}</span>
        </div>
        <p class="text-sm font-600 leading-snug flex items-center gap-1.5"><i data-lucide="${idea.icon}" class="w-4 h-4 text-brand-dark"></i>${idea.title}</p>
        <p class="text-xs text-ink-soft mt-0.5 clamp-2">${idea.body}</p>
        <button class="go mt-2 w-full text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-1.5 border border-paper-line hover:border-brand/40 transition-colors"><i data-lucide="list-ordered" class="w-4 h-4"></i>Get instructions</button>
      </div>`);
      el2.querySelector('.go').onclick = () => openActivityDetail(at, idea, isGame ? 'game' : 'activity');
      list.appendChild(el2);
    }
  }

  // Stretch challenge
  if (extras.challenge) {
    const t = extras.challenge;
    const meta = SUBJECTS[t.subject];
    const el3 = el(`<div class="rounded-xl border border-dashed border-paper-line bg-paper p-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-[#c08a2e]/15 text-[#8a6420]">STRETCH</span>
        <span class="text-xs text-ink-faint truncate">${t.subject}</span>
      </div>
      <p class="text-sm font-600 leading-snug">${t.name}</p>
      <p class="text-xs text-ink-soft mt-0.5">A challenge just beyond where they are — try it if there's time.</p>
      <button class="go mt-2 w-full text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-1.5 border border-paper-line hover:border-brand/40 transition-colors"><i data-lucide="notebook-text" class="w-4 h-4"></i>Open lesson</button>
    </div>`);
    el3.querySelector('.go').onclick = () => openLesson(t);
    list.appendChild(el3);
  }

  block.querySelector('div').classList.add('space-y-2');
  const foot = el(`<button class="mt-1 text-xs text-ink-faint hover:text-ink-soft flex items-center gap-1"><i data-lucide="refresh-cw" class="w-3 h-3"></i>Refreshers change each day automatically</button>`);
  block.appendChild(foot);
  return block;
}
