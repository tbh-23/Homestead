import { getData, subjectMeta, subjectNames } from '../data.js';
import * as store from '../store.js';
import { el, esc, refreshIcons, toast, openModal } from '../ui.js';
import { keyOf, parseKey, buildPlan, dailyExtras, planStartKey, invalidatePlan, familyCalendar, normalizeCalendar, restInfo, nextHomeDayKey, pauseInfo, newTopicsHeading, doneControl, normalizePace, paceSummary, planTopicOn } from '../scheduler.js';
import { openLesson } from './lesson.js';
import { offerTeachingGuide } from './teachingguide.js';
import { openActivityDetail } from './lesson.js';
import { openMasteryTest } from './masterytest.js';
import { openChallenge } from './challenge.js';
import { openDueRecall } from './recall.js';
import { openTopicPractice } from './practice.js';
import { gateAi, aiUnavailableChip } from '../ai-status.js';
import { activityIdeas, gameIdeas } from '../resources.js';
import { MASTERY, isUnlocked } from '../mastery.js';
import { growthIcon, stageForStatus } from '../meadow.js';

export const EXTRAS_CAP = 10;

let viewMonth = null;   // Date on the 1st of the shown month
let selectedKey = null; // yyyy-mm-dd
let expandedExtrasKey = null; // `${studentId}|${dateKey}` when "Show all" was clicked

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function renderCalendar(params, { navigate }) {
  const active = store.activeStudent();
  const root = el(`<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  root.appendChild(el(`<div class="mb-4">
    <h1 class="font-display text-2xl sm:text-3xl font-600">Daily Calendar</h1>
    <p class="text-ink-soft text-sm mt-1 [overflow-wrap:anywhere]">A day-by-day learning track for <span class="font-600 text-ink">${esc(active?.name || 'your student')}</span> — with refreshers and extras each day.</p>
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
    <button id="calsettings" type="button" class="sm:ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors">
      <i data-lucide="calendar-cog" class="w-4 h-4"></i>Home days &amp; breaks
    </button>
  </div>`);
  const picker = startBar.querySelector('#startpick');
  const applyStart = (val) => {
    if (!val || val === startKey) return;
    const commit = (clearMoves) => {
      store.setStartDate(active.id, val, { clearMoves });
      invalidatePlan(active.id);
      viewMonth = new Date(parseKey(val).getFullYear(), parseKey(val).getMonth(), 1);
      selectedKey = val;
      toast(clearMoves ? 'Start date updated — track rescheduled and moves cleared' : 'Start date updated — track rescheduled', 'success');
      navigate('calendar');
    };
    const moved = store.movedTopicCount(active.id);
    if (moved) openStartMoves(moved, commit, () => { picker.value = startKey; });
    else commit(false);
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
  startBar.querySelector('#calsettings').onclick = () => openCalendarSettings(active, navigate);
  root.appendChild(startBar);
  root.appendChild(paceBar(active, startKey, navigate));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!viewMonth) viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!selectedKey) selectedKey = keyOf(today);

  const grid = el(`<div class="grid grid-cols-1 lg:grid-cols-3 gap-5"></div>`);
  grid.appendChild(monthPanel(active, today, navigate));
  grid.appendChild(dayPanel(active, navigate));
  root.appendChild(grid);

  refreshIcons();
  return root;
}

function monthPanel(active, today, navigate) {
  const wrap = el(`<div class="lg:col-span-2 min-w-0"></div>`);
  const plan = buildPlan(active);
  const calendar = familyCalendar();
  const byId = getData().byId;

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
    const rest = restInfo(k, calendar);
    const topics = plan.byDate.get(k) || [];
    const inTrack = plan.firstKey && k >= plan.firstKey && k <= plan.lastKey;
    const isToday = k === keyOf(today);
    const isSel = k === selectedKey;
    const dayDone = store.isDayDone(active.id, k);
    const extraCount = store.extrasOn(active.id, k).filter(x => x.topicId && byId.has(x.topicId)).length;

    // subject dots + a small topic list (desktop)
    const subs = [...new Set(topics.map(t => t.subject))].slice(0, 4);
    const dots = subs.map(s => `<span class="w-1.5 h-1.5 rounded-full" style="background:${subjectMeta(s).color}"></span>`).join('');
    const topicList = topics.slice(0, 3).map(t => `<span class="hidden sm:flex items-center gap-1 text-[10px] leading-tight text-ink-soft truncate"><span class="w-1 h-1 rounded-full shrink-0" style="background:${subjectMeta(t.subject).color}"></span><span class="truncate">${esc(t.name)}</span></span>`).join('');
    const moreCount = topics.length - 3;

    const cell = el(`<button class="relative min-w-0 min-h-[64px] sm:min-h-[104px] rounded-xl border p-1.5 sm:p-2 flex flex-col text-left transition-colors ${isSel ? 'border-brand bg-brand-light/50' : 'border-paper-line hover:border-ink-faint/40'} ${dayDone ? 'bg-brand-light/40' : rest ? 'bg-paper/60' : 'bg-paper-card'}" ${rest ? `data-rest="${rest.kind}"` : ''}>
      <span class="flex items-center justify-between">
        <span class="text-xs font-600 shrink-0 ${isToday ? 'w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center' : (rest ? 'text-ink-faint' : 'text-ink')}">${day}</span>
        <span class="flex items-center gap-1">
          ${extraCount ? `<span class="text-[9px] font-600 text-[#8a6412]">+${extraCount}</span>` : ''}
          ${dayDone ? '<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-brand-dark"></i>' : ''}
        </span>
      </span>
      <span class="flex-1 min-h-0 flex flex-col gap-0.5 mt-1 overflow-hidden">
        ${topics.length ? `<span class="sm:hidden flex items-center gap-0.5 flex-wrap">${dots}</span>${topicList}${moreCount > 0 ? `<span class="hidden sm:block text-[10px] text-ink-faint">+${moreCount} more</span>` : ''}` : (rest ? (rest.kind === 'break' ? `<span class="hidden sm:block text-[10px] text-ink-faint/70 mt-auto truncate">${esc(rest.label || 'Break')}</span>` : '') : (inTrack ? '<span class="hidden sm:block text-[10px] text-ink-faint/70 mt-auto">Review day</span>' : ''))}
      </span>
    </button>`);
    cell.onclick = () => { selectedKey = k; navigate('calendar'); };
    cells.appendChild(cell);
  }
  wrap.appendChild(cells);

  // legend
  wrap.appendChild(el(`<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-4 text-[11px] text-ink-soft">
    ${subjectNames().map((s) => [s, subjectMeta(s)]).map(([s, m]) => `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:${esc(m.color)}"></span>${esc(s)}</span>`).join('')}
  </div>`));

  return wrap;
}

function dayPanel(active, navigate) {
  const wrap = el(`<div class="min-w-0 lg:sticky lg:top-6 lg:self-start"></div>`);
  const date = parseKey(selectedKey);
  const plan = buildPlan(active);
  const topics = plan.byDate.get(selectedKey) || [];
  const rest = pauseInfo(selectedKey, familyCalendar());
  const todayKey = keyOf(new Date());
  const inTrack = plan.firstKey && selectedKey >= plan.firstKey && selectedKey <= plan.lastKey;
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const done = store.isDayDone(active.id, selectedKey);
  // Extras whose topic was retired by a taxonomy update are kept in the
  // family's data (Records lists them) but not shown on the day.
  const byId = getData().byId;
  const extras = store.extrasOn(active.id, selectedKey).filter(x => x.topicId && byId.has(x.topicId));

  const card = el(`<div data-day-panel class="bg-paper-card border border-paper-line rounded-2xl p-5 space-y-5 min-w-0"></div>`);
  const control = doneControl(rest, done);
  const head = el(`<div class="flex items-start justify-between gap-2">
    <div class="min-w-0">
      <p class="text-xs text-ink-faint">${rest ? (rest.kind === 'break' ? `Break${rest.label ? ' · ' + esc(rest.label) : ''}` : 'Rest day') : inTrack ? 'Home learning day' : 'Outside the track'}</p>
      <h2 class="font-display text-xl font-600">${dateLabel}</h2>
    </div>
    ${!control ? '' : `<button id="donebtn" class="shrink-0 flex items-center gap-1.5 min-h-11 px-4 py-1.5 lg:min-h-0 lg:px-3 rounded-lg text-xs font-medium border transition-colors ${done ? 'bg-brand text-white border-transparent' : 'border-paper-line text-ink-soft hover:border-brand/40'}"><i data-lucide="${done ? 'check-circle-2' : 'circle'}" class="w-3.5 h-3.5"></i>${done ? 'Done' : 'Mark done'}</button>`}
  </div>`);
  const doneBtn = head.querySelector('#donebtn');
  if (doneBtn && rest) doneBtn.title = 'Marked done before this became a rest day. Tap to reopen.';
  if (doneBtn) doneBtn.onclick = () => { store.toggleDayDone(active.id, selectedKey); toast(done ? 'Day reopened' : 'Day marked complete', done ? 'default' : 'success'); navigate('calendar'); };
  card.appendChild(head);

  // A rest day pauses the rhythm: say until when, and name the next learning day.
  if (rest) card.appendChild(restNotice(rest, done, navigate));

  // New topics for the day
  const newBlock = el(`<div><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i>${newTopicsHeading(selectedKey, todayKey)}</p><div class="space-y-2"></div></div>`);
  const list = newBlock.querySelector('div');
  if (topics.length === 0) {
    list.appendChild(el(`<p class="text-sm text-ink-faint">${rest ? 'Nothing is scheduled.' : inTrack ? 'No new topics scheduled — a review day. Try the refreshers below.' : 'This date is outside the 5–13 track.'}</p>`));
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
  const dayKeyToken = `${active.id}|${selectedKey}`;
  renderDayExtras(exList, extras, {
    expanded: expandedExtrasKey === dayKeyToken,
    renderRow: (x) => extraRow(x, active, navigate),
    onExpand: () => { expandedExtrasKey = dayKeyToken; refreshIcons(); },
  });
  exBlock.querySelector('#addextra').onclick = () => openAddExtra(active, selectedKey, navigate);
  card.appendChild(exBlock);

  // Daily extras / refreshers (none on rest days)
  if (!rest) card.appendChild(extrasBlock(active, navigate));

  wrap.appendChild(card);
  return wrap;
}

const longDate = (k) => parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// "Break until <date>" or "Rest day", the next learning day, and a way to it.
function restNotice(rest, done, navigate) {
  const title = rest.kind === 'break'
    ? `${esc(rest.label || 'Break')} until ${longDate(rest.until)}`
    : 'Rest day';
  const box = el(`<div class="rest-notice rounded-xl bg-paper p-3 text-sm">
    <p class="font-600 flex items-center gap-1.5"><i data-lucide="${rest.kind === 'break' ? 'tent' : 'sun'}" class="w-4 h-4 text-brand-dark"></i>${title}</p>
    <p class="text-ink-soft mt-0.5">The daily rhythm is paused: no new topics, choices or refreshers. Next learning day: <span class="font-600 text-ink">${longDate(rest.nextKey)}</span>.</p>
    ${done ? '<p class="text-xs text-ink-faint mt-1">This day was marked done before it became a rest day. The record stays; tap Done to reopen it.</p>' : ''}
    <button type="button" class="next mt-1 -mb-2 h-11 lg:h-auto lg:mt-2 lg:mb-0 text-xs font-medium text-brand-dark flex items-center gap-1">Go to ${parseKey(rest.nextKey).toLocaleDateString(undefined, { weekday: 'long' })}<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
  </div>`);
  box.querySelector('.next').onclick = () => {
    const d = parseKey(rest.nextKey);
    selectedKey = rest.nextKey;
    viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    navigate('calendar');
  };
  return box;
}

// Catch-up pace: catch-up topics first (the default), or mixed with own-age topics.
function paceBar(active, startKey, navigate) {
  const pace = normalizePace(store.planOverrides(active.id).pace);
  const summary = paceSummary(buildPlan(active), startKey, pace, active.name);
  const opt = (value, label) => {
    const on = pace === value;
    return `<button type="button" data-pace="${value}" aria-pressed="${on}" class="min-h-11 px-4 py-1.5 lg:min-h-0 lg:px-3 rounded-lg border text-xs font-medium transition-colors ${on ? 'bg-brand text-white border-transparent' : 'bg-paper text-ink-soft border-paper-line hover:border-brand/40'}">${label}</button>`;
  };
  const bar = el(`<div id="pacebar" class="mb-5 rounded-xl border border-paper-line bg-paper-card p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm" role="group" aria-label="Catch-up pace">
    <span class="flex items-center gap-1.5 text-ink-soft shrink-0"><i data-lucide="gauge" class="w-4 h-4 text-brand-dark"></i>Catch-up pace</span>
    <span class="flex gap-1.5 shrink-0">${opt('catch-up-first', 'Catch-up first')}${opt('mixed', 'Mixed')}</span>
    <span class="pace-summary text-xs text-ink-soft min-w-0 [overflow-wrap:anywhere]">${esc(summary)}</span>
  </div>`);
  bar.querySelectorAll('[data-pace]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.pace === pace) return;
      store.setCatchUpPace(active.id, b.dataset.pace);
      invalidatePlan(active.id);
      toast('Catch-up pace updated — track rescheduled', 'success');
      navigate('calendar');
    };
  });
  return bar;
}

// Cap the initially rendered extras on a day (e.g. 600 seeded extras) behind a
// "Show all (N more)" control so one busy day does not bloat the page.
export function renderDayExtras(container, extras, { expanded = false, cap = EXTRAS_CAP, renderRow, onExpand = null } = {}) {
  container.replaceChildren();
  if (!extras.length) {
    container.appendChild(el(`<p class="text-sm text-ink-faint">Nothing extra added. Use “Add” to schedule more practice, a re-test, or a challenge for this day.</p>`));
    return;
  }
  const shown = expanded || extras.length <= cap ? extras : extras.slice(0, cap);
  shown.forEach(x => container.appendChild(renderRow(x)));
  const remaining = extras.length - shown.length;
  if (remaining > 0) {
    const more = el(`<button type="button" id="show-all-extras" class="w-full min-h-11 px-3 py-2 rounded-xl border border-paper-line bg-paper text-sm font-medium text-brand-dark hover:border-brand/40 transition-colors">Show all (${esc(remaining)} more)</button>`);
    more.onclick = () => {
      more.remove();
      extras.slice(cap).forEach(x => container.appendChild(renderRow(x)));
      onExpand?.();
    };
    container.appendChild(more);
  }
}

function extraRow(x, active, navigate) {
  const d = getData();
  // An extra saved without a subject keeps its neutral look.
  const meta = x.subject ? subjectMeta(x.subject) : { color: '#6f665a', icon: 'plus' };
  const kindMeta = {
    lesson: { icon: 'notebook-text', label: 'Extra lesson' },
    retest: { icon: 'file-check-2', label: 'Re-test' },
    challenge: { icon: 'zap', label: 'Challenge' },
    practice: { icon: 'pencil', label: 'Practice' },
  }[x.kind] || { icon: 'plus', label: 'Extra' };
  const row = el(`<div class="rounded-xl border border-paper-line bg-paper p-3 flex items-center gap-2.5">
    <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${kindMeta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-600 truncate">${esc(x.title || x.topicName || kindMeta.label)}</p>
      <p class="text-xs text-ink-faint truncate">${kindMeta.label}${x.subject ? ' · ' + esc(x.subject) : ''}</p>
    </div>
    <button class="go text-xs font-medium text-brand-dark shrink-0">Open</button>
    <button class="del text-ink-faint hover:text-[#a4473a] w-11 h-11 -my-[11px] -mr-[11px] flex items-center justify-center shrink-0 lg:w-auto lg:h-auto lg:m-0 lg:p-1" title="Remove from this day" aria-label="Remove extra ${esc(x.title || x.topicName || kindMeta.label)}"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
  </div>`);
  row.querySelector('.go').onclick = () => {
    const topic = x.topicId ? d.byId.get(x.topicId) : null;
    if (!topic) { toast('That topic is no longer in the curriculum', 'error'); return; }
    if (x.kind === 'practice') { openTopicPractice(topic); return; }
    if (x.kind === 'lesson') openLesson(topic);
    else if (x.kind === 'retest') openMasteryTest(topic.subject, null, topic);
    else if (x.kind === 'challenge') openChallenge(topic);
    else navigate('topic', { id: topic.id });
  };
  row.querySelector('.del').onclick = () => { store.removeExtra(active.id, selectedKey, x.id); navigate('calendar'); };
  // Spaced practice needs no AI provider; the other kinds do.
  const capability = { lesson: 'lesson', retest: 'test', challenge: 'challenge' }[x.kind] || 'lesson';
  if (x.kind !== 'practice' && !store.aiAvailable(capability)) {
    // Keep the title and kind readable; the chip goes on its own line under them.
    const go = row.querySelector('.go');
    const slot = el('<span class="hidden"></span>');
    go.replaceWith(slot);
    const chip = aiUnavailableChip(capability);
    chip.classList.add('mt-1.5');
    const text = row.querySelector('.flex-1.min-w-0');
    text.appendChild(chip);
    const topic = x.kind === 'lesson' && x.topicId ? d.byId.get(x.topicId) : null;
    if (topic) {
      // A saved lesson can remove the chip before the research index answers.
      offerTeachingGuide(topic, btn => (chip.isConnected ? chip.before(btn) : text.appendChild(btn)), { navigate, compact: true });
    }
    // A lesson already in the cache still opens.
    if (x.topicId && (x.kind === 'lesson' || x.kind === 'practice')) {
      store.hasCachedLesson('topic:' + x.topicId).then(found => {
        if (found && slot.parentNode) { slot.replaceWith(go); chip.remove(); }
      });
    }
  }
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
      const r = el(`<button type="button" class="w-full text-left px-3 py-2 rounded-lg hover:bg-paper text-sm flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${subjectMeta(t.subject).color}"></span><span class="flex-1 truncate">${esc(t.name)}</span><span class="text-xs text-ink-faint">${esc(t.subject)}</span></button>`);
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
  const meta = subjectMeta(t.subject);
  const status = store.statusOf(active.id, t.id);
  const row = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <button class="open text-left w-full flex items-start gap-2.5">
      <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-600 leading-snug">${esc(t.name)}</span>
        <span class="block text-xs text-ink-faint">${esc(t.subject)} · ${esc(t.domain)}</span>
      </span>
      <span title="${MASTERY[status].label}">${growthIcon(stageForStatus(status, isUnlocked(active.id, t.id)), 22)}</span>
    </button>
    <div class="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-paper-line">
      <button class="lesson text-xs font-medium text-brand-dark flex items-center gap-1"><i data-lucide="notebook-text" class="w-3.5 h-3.5"></i>Lesson</button>
      <button class="test text-xs font-medium flex items-center gap-1" style="color:${meta.color}"><i data-lucide="file-check-2" class="w-3.5 h-3.5"></i>Test</button>
      <button class="push text-xs font-medium text-ink-soft flex items-center gap-1 ml-auto"><i data-lucide="calendar-arrow-down" class="w-3.5 h-3.5"></i>Move</button>
    </div>
  </div>`);
  row.querySelector('.open').onclick = () => navigate('topic', { id: t.id });
  row.querySelector('.lesson').onclick = () => openLesson(t);
  row.querySelector('.test').onclick = () => openMasteryTest(t.subject, null, t);
  row.querySelector('.push').onclick = () => openMoveTopic(t, active, navigate);
  if (!store.aiAvailable('test')) row.querySelector('.test').remove();
  const lesson = row.querySelector('.lesson');
  lesson.replaceWith(gateAi(lesson, { capability: 'lesson', cachedKey: 'topic:' + t.id }));
  if (!store.aiAvailable('lesson')) {
    const actions = row.querySelector('.border-t');
    offerTeachingGuide(t, btn => actions.prepend(btn), { navigate, compact: true });
  }
  return row;
}

// The calendar moves a planned topic from its selected day. Other callers (the
// topic finder) pass the day to count from and their own wording.
export function openMoveTopic(topic, active, navigate, {
  fromKey = null,
  title = `Move “${topic.name}”`,
  blurb = 'Stuck on it, or want to get ahead? Move this topic to another day. Its section order still applies.',
  nextLabel = 'Push to next home day',
  pickLabel = 'Or pick a date',
  submitLabel = 'Move topic',
} = {}) {
  const currentKey = fromKey || selectedKey || keyOf(new Date());
  const calendar = familyCalendar();
  const nextDay = nextHomeDayKey(currentKey, calendar, { after: true });
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-1">${esc(title)}</h3>
    <p class="text-xs text-ink-faint mb-4">${esc(blurb)}</p>
    <div class="space-y-2 mb-4">
      <button id="tomorrow" class="w-full text-left px-4 py-3 rounded-xl border border-paper-line hover:border-brand/40 transition-colors flex items-center gap-2.5"><i data-lucide="calendar-arrow-down" class="w-4 h-4 text-brand-dark"></i><span class="text-sm font-medium">${esc(nextLabel)}</span></button>
    </div>
    <form id="f" class="space-y-3">
      <label for="move-date" class="text-sm font-medium block">${esc(pickLabel)}</label>
      <input id="move-date" type="date" name="date" value="${nextDay}" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      <button class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">${esc(submitLabel)}</button>
    </form>
  </div>`);
  const doMove = (picked) => {
    // Rest days schedule nothing: a rest day moves to the next home day.
    const { dayKey, outcome } = planTopicOn(active, topic, picked);
    const rest = dayKey === picked ? '' : `${picked} is a rest day — `;
    const said = outcome === 'already' ? `already on ${dayKey}` : `${outcome === 'moved' ? 'moved' : 'added'} to ${dayKey}`;
    toast(`${rest}${said}`.replace(/^./, (c) => c.toUpperCase()), 'success');
    m.close();
    selectedKey = dayKey;
    viewMonth = new Date(parseKey(dayKey).getFullYear(), parseKey(dayKey).getMonth(), 1);
    navigate('calendar');
  };
  body.querySelector('#tomorrow').onclick = () => doMove(nextDay);
  body.querySelector('#f').onsubmit = e => { e.preventDefault(); const v = new FormData(e.target).get('date'); if (v) doMove(v); };
  const m = openModal(body);
}


// Swap a refresher card's launch button for the chip when its capability cannot generate.
function gateCardButton(card, capability) {
  if (store.aiAvailable(capability)) return;
  const chip = aiUnavailableChip(capability);
  chip.classList.add('mt-2');
  card.querySelector('.go').replaceWith(chip);
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
    gateCardButton(rc, 'recall');
    list.appendChild(rc);
  }

  // Featured refresher quiz
  if (extras.refresher) {
    const t = extras.refresher;
    const meta = subjectMeta(t.subject);
    const el1 = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[10px] font-600 px-1.5 py-0.5 rounded-full" style="background:${meta.color}18;color:${meta.color}">REFRESHER QUIZ</span>
        <span class="text-xs text-ink-faint truncate">${esc(t.subject)}</span>
      </div>
      <p class="text-sm font-600 leading-snug">${esc(t.name)}</p>
      <p class="text-xs text-ink-soft mt-0.5">A quick check on something already learned — keeps it sharp.</p>
      <button class="go mt-2 w-full text-sm font-medium text-white rounded-lg py-2 flex items-center justify-center gap-1.5" style="background:${meta.color}"><i data-lucide="file-check-2" class="w-4 h-4"></i>Give refresher quiz</button>
    </div>`);
    el1.querySelector('.go').onclick = () => openMasteryTest(t.subject, null, t);
    gateCardButton(el1, 'test');
    list.appendChild(el1);
  }

  if (!extras.refresher) {
    list.appendChild(el(`<p class="text-sm text-ink-faint [overflow-wrap:anywhere]">Refresher quizzes and activities start once ${esc(active.name)} has mastered a topic.</p>`));
  }

  // Featured activity/game
  const at = extras.refresher2 || extras.refresher;
  if (at) {
    const meta = subjectMeta(at.subject);
    const isGame = extras.featured === 'game';
    const pool = isGame ? gameIdeas(at) : activityIdeas(at);
    const idea = pool[extras.rngSeed % pool.length] || pool[0];
    if (idea) {
      const el2 = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-brand-light text-brand-dark">${isGame ? 'GAME' : 'ACTIVITY'}</span>
          <span class="text-xs text-ink-faint truncate">${esc(at.name)}</span>
        </div>
        <p class="text-sm font-600 leading-snug flex items-center gap-1.5"><i data-lucide="${idea.icon}" class="w-4 h-4 text-brand-dark"></i>${esc(idea.title)}</p>
        <p class="text-xs text-ink-soft mt-0.5 clamp-2">${esc(idea.body)}</p>
        <button class="go mt-2 w-full text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-1.5 border border-paper-line hover:border-brand/40 transition-colors"><i data-lucide="list-ordered" class="w-4 h-4"></i>Get instructions</button>
      </div>`);
      el2.querySelector('.go').onclick = () => openActivityDetail(at, idea, isGame ? 'game' : 'activity');
      gateCardButton(el2, 'activity');
      list.appendChild(el2);
    }
  }

  // Stretch challenge
  if (extras.challenge) {
    const t = extras.challenge;
    const meta = subjectMeta(t.subject);
    const el3 = el(`<div class="rounded-xl border border-dashed border-paper-line bg-paper p-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-[#8a6412]/15 text-[#8a6420]">STRETCH</span>
        <span class="text-xs text-ink-faint truncate">${esc(t.subject)}</span>
      </div>
      <p class="text-sm font-600 leading-snug">${esc(t.name)}</p>
      <p class="text-xs text-ink-soft mt-0.5">A challenge just beyond where they are — try it if there's time.</p>
      <button class="go mt-2 w-full text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-1.5 border border-paper-line hover:border-brand/40 transition-colors"><i data-lucide="notebook-text" class="w-4 h-4"></i>Open lesson</button>
    </div>`);
    el3.querySelector('.go').onclick = () => openLesson(t);
    gateCardButton(el3, 'lesson');
    if (!store.aiAvailable('lesson')) {
      offerTeachingGuide(t, btn => { const chip = el3.querySelector('.ai-unavailable'); if (chip) chip.before(btn); else el3.appendChild(btn); }, { navigate, compact: true });
    }
    list.appendChild(el3);
  }

  return block;
}

// A new start date reschedules the track; topics moved by hand keep their
// chosen dates unless the parent clears them here.
function openStartMoves(count, commit, cancel) {
  let chosen = false;
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-1">Clear moved topics too?</h3>
    <p class="text-sm text-ink-soft mb-4">You moved ${count} topic${count > 1 ? 's' : ''} by hand. Clear ${count > 1 ? 'them' : 'it'} so ${count > 1 ? 'they follow' : 'it follows'} the new start date, or keep the dates you chose.</p>
    <div class="flex flex-col sm:flex-row gap-2">
      <button id="clear" class="flex-1 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Clear moves</button>
      <button id="keep" class="flex-1 px-4 py-2.5 rounded-xl border border-paper-line font-medium hover:border-brand/40 transition-colors">Keep moves</button>
    </div>
  </div>`);
  // Escape or the backdrop leaves the start date as it was.
  const m = openModal(body, { beforeClose: () => { if (!chosen) cancel(); } });
  const choose = (clearMoves) => { chosen = true; m.close(); commit(clearMoves); };
  body.querySelector('#clear').onclick = () => choose(true);
  body.querySelector('#keep').onclick = () => choose(false);
}

// Family calendar settings: home days of the week and break ranges.
const WEEK = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
function openCalendarSettings(active, navigate) {
  const draft = familyCalendar();
  const inputCls = 'w-full px-3 py-2 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-1">Home days &amp; breaks</h3>
    <p class="text-xs text-ink-faint mb-4">New topics go only on home days. Other days and breaks are rest days, and the track picks up after them.</p>
    <fieldset class="mb-5">
      <legend class="text-sm font-medium mb-1.5">Home days</legend>
      <div id="days" class="grid grid-cols-7 gap-1"></div>
    </fieldset>
    <div class="mb-5">
      <p class="text-sm font-medium mb-1.5">Breaks</p>
      <div id="breaks" class="space-y-1.5"></div>
    </div>
    <form id="addbreak" class="rounded-xl border border-paper-line p-3 space-y-2 mb-5">
      <p class="text-xs font-600 uppercase tracking-wide text-ink-faint">Add a break</p>
      <label class="block text-xs text-ink-soft">Name <input name="label" maxlength="60" placeholder="Winter break" class="${inputCls} mt-0.5" /></label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs text-ink-soft min-w-0">From <input type="date" name="start" required class="${inputCls} mt-0.5" /></label>
        <label class="block text-xs text-ink-soft min-w-0">To <input type="date" name="end" required class="${inputCls} mt-0.5" /></label>
      </div>
      <button class="w-full px-3 py-2 rounded-lg border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors flex items-center justify-center gap-1.5"><i data-lucide="plus" class="w-4 h-4"></i>Add break</button>
    </form>
    <button id="save" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Save</button>
  </div>`);

  const daysWrap = body.querySelector('#days');
  const renderDays = () => {
    daysWrap.innerHTML = '';
    WEEK.forEach(([n, label]) => {
      const on = draft.homeDays.includes(n);
      const b = el(`<button type="button" aria-pressed="${on}" class="py-2 rounded-lg border text-xs font-medium transition-colors ${on ? 'bg-brand text-white border-transparent' : 'bg-paper text-ink-soft border-paper-line'}">${label}</button>`);
      b.onclick = () => {
        draft.homeDays = on ? draft.homeDays.filter(d => d !== n) : [...draft.homeDays, n];
        renderDays();
      };
      daysWrap.appendChild(b);
    });
  };
  const breaksWrap = body.querySelector('#breaks');
  const fmt = (k) => parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const renderBreaks = () => {
    breaksWrap.innerHTML = '';
    if (!draft.breaks.length) breaksWrap.appendChild(el(`<p class="text-sm text-ink-faint">No breaks yet.</p>`));
    draft.breaks.forEach((b, i) => {
      const row = el(`<div class="flex items-center gap-2 rounded-lg border border-paper-line bg-paper px-3 py-2">
        <span class="flex-1 min-w-0"><span class="block text-sm font-600 truncate">${esc(b.label || 'Break')}</span><span class="block text-xs text-ink-faint">${fmt(b.start)} – ${fmt(b.end)}</span></span>
        <button type="button" class="del text-ink-faint hover:text-[#a4473a] w-11 h-11 -my-[11px] -mr-[11px] flex items-center justify-center shrink-0 lg:w-auto lg:h-auto lg:m-0 lg:p-1" aria-label="Remove ${esc(b.label || 'break')}"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>`);
      row.querySelector('.del').onclick = () => { draft.breaks.splice(i, 1); renderBreaks(); };
      breaksWrap.appendChild(row);
    });
    refreshIcons();
  };
  renderDays();
  renderBreaks();

  body.querySelector('#addbreak').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = normalizeCalendar({ ...draft, breaks: [...draft.breaks, { start: fd.get('start'), end: fd.get('end'), label: fd.get('label') || '' }] });
    if (next.breaks.length === draft.breaks.length) { toast('Pick a start and end date', 'error'); return; }
    draft.breaks = next.breaks;
    e.target.reset();
    renderBreaks();
  };
  body.querySelector('#save').onclick = () => {
    if (!draft.homeDays.length) { toast('Pick at least one home day', 'error'); return; }
    store.setCalendarSettings(normalizeCalendar(draft));
    invalidatePlan(active.id);
    m.close();
    toast('Calendar updated — track rescheduled', 'success');
    navigate('calendar');
  };
  const m = openModal(body);
}
