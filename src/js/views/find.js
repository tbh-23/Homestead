// Topic finder (#find): a free-text request becomes matching taxonomy topics,
// the unmet prerequisites on the way to the chosen one, and the next ready
// step. No AI: the search runs over the taxonomy already in the browser.
import { getData, subjectMeta } from '../data.js';
import * as store from '../store.js';
import { SKILL_STATE_CHROME } from '../graph.js';
import { buildTopicPath, searchTopics } from '../finder.js';
import { growthChip, stageForSkillState } from '../meadow.js';
import { el, esc, fmtDateTime, refreshIcons, toast } from '../ui.js';
import { countLabel, formatCount } from '../format.js';
import { keyOf, planTopicOn } from '../scheduler.js';
import { graphParamsForTopic } from './graph.js';
import { openMoveTopic } from './calendar.js';
import { curriculumBooster } from '../mastery.js';
import { learnerYear, yearLabel } from '../curriculum.js';

const RESULT_LIMIT = 8;
const STEPS_SHOWN = 12;
const LOG_SHOWN = 10;

export function renderFind(params, { navigate }) {
  const active = store.activeStudent();
  const d = getData();
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  root.appendChild(el(`
    <div class="mb-5">
      <p class="text-[11px] uppercase tracking-[0.18em] text-ink-faint font-medium mb-1">Topic finder</p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">Find a topic</h1>
      <p class="text-ink-soft text-sm mt-1 leading-relaxed max-w-2xl [overflow-wrap:anywhere]">Type what ${esc(active?.name || 'your learner')} wants to learn. Harrington looks through the ${countLabel(d.meta.topics, 'topic')} of the curriculum map on this computer, without AI, and shows the way there from what is already mastered.</p>
    </div>`));
  if (!active) {
    root.appendChild(el(`<p class="text-ink-soft">Add a student to use the topic finder.</p>`));
    return root;
  }

  // A hand-typed address can carry any length; requests are capped like the log.
  const q = (params.q || '').slice(0, store.REQUEST_TEXT_LEN).trim();
  const log = store.requestsFor(active.id);
  // A request id from another learner's log (after a switch) is not reused.
  const request = params.r ? log.find((r) => r.id === params.r) || null : null;

  root.appendChild(requestForm(q, active, navigate));

  if (q) {
    const { terms, results } = searchTopics(d.topics, q, { age: store.studentAge(active), limit: RESULT_LIMIT, boost: curriculumBooster(active.id) });
    const choose = (topic) => {
      let r = request;
      if (r) store.setRequestTopic(active.id, r.id, topic.id);
      else r = store.logRequest(active.id, q, topic.id);
      navigate('find', { q, r: r?.id, topic: topic.id }, { preserveScroll: true, replace: true });
      requestAnimationFrame(() => document.getElementById('find-path')?.scrollIntoView({ block: 'start' }));
    };
    root.appendChild(resultsSection(q, terms, results, params.topic, active, choose));
  }

  const target = params.topic ? d.byId.get(params.topic) : null;
  if (target) root.appendChild(pathSection(target, active, navigate));

  root.appendChild(logSection(log, active, navigate, d));
  refreshIcons();
  return root;
}

function requestForm(q, active, navigate) {
  const form = el(`<form class="bg-paper-card border border-paper-line rounded-2xl p-4 sm:p-5 mb-5" role="search">
    <label for="find-q" class="text-sm font-600 block mb-2 [overflow-wrap:anywhere]">What does ${esc(active.name)} want to learn?</label>
    <div class="flex flex-col sm:flex-row gap-2">
      <input id="find-q" name="q" type="search" autocomplete="off" maxlength="${store.REQUEST_TEXT_LEN}" placeholder="e.g. how to tell the time, fractions, volcanoes" class="flex-1 min-w-0 px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      <button class="shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="search" class="w-4 h-4"></i>Find</button>
    </div>
    <p class="text-xs text-ink-faint mt-2 [overflow-wrap:anywhere]">Each request is kept in ${esc(active.name)}'s request log below, with the topic you choose.</p>
  </form>`);
  const input = form.querySelector('input');
  input.value = q;
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim().replace(/\s+/g, ' ');
    if (!text) { input.focus(); return; }
    const entry = store.logRequest(active.id, text);
    navigate('find', { q: text, r: entry?.id });
  };
  return form;
}

function topicChips(topic) {
  const meta = subjectMeta(topic.subject);
  return `<span class="flex flex-wrap gap-1.5 text-xs font-medium">
    <span class="px-2 py-0.5 rounded-full text-white" style="background:${meta.color}">${esc(topic.subject)}</span>
    <span class="px-2 py-0.5 rounded-full bg-paper border border-paper-line text-ink-soft">${esc(topic.domain)}</span>
    <span class="px-2 py-0.5 rounded-full bg-paper border border-paper-line text-ink-soft">Ages ${esc(topic.ageRangeStart)}–${esc(topic.ageRangeEnd)}</span>
  </span>`;
}

function stateChip(state) {
  return growthChip(stageForSkillState(state), SKILL_STATE_CHROME[state].label);
}

function resultsSection(q, terms, results, chosenId, active, choose) {
  const section = el(`<section class="mb-5" aria-labelledby="find-results-h">
    <h2 id="find-results-h" class="font-600 mb-3 [overflow-wrap:anywhere]">Closest topics for “${esc(q)}”</h2>
  </section>`);
  if (!terms.length) {
    section.appendChild(el(`<p class="text-sm text-ink-soft">Type a word or two about the topic itself, such as “fractions” or “tell the time”.</p>`));
    return section;
  }
  if (!results.length) {
    section.appendChild(el(`<div class="rounded-2xl border border-paper-line bg-paper-card p-4 sm:p-5">
      <p class="font-600 text-sm flex items-center gap-2"><i data-lucide="search-x" class="w-4 h-4 text-ink-faint"></i>No close match</p>
      <p class="text-sm text-ink-soft mt-1 leading-relaxed">Nothing in the curriculum map matches these words closely. Try other words: a simpler one (“clock” rather than “timekeeping”), the name of the school subject, or a single key word. Topics the map does not have cannot be found here yet.</p>
    </div>`));
    return section;
  }
  const list = el(`<ol class="space-y-2"></ol>`);
  const age = store.studentAge(active);
  const year = learnerYear(active);
  for (const { topic, inBand, boost } of results) {
    const chosen = topic.id === chosenId;
    const item = el(`<li></li>`);
    const btn = el(`<button type="button" class="find-result w-full text-left rounded-2xl border ${chosen ? 'border-brand bg-brand-light/60' : 'border-paper-line bg-paper-card hover:border-brand/40'} p-3.5 sm:p-4 transition-colors">
      <span class="flex items-start justify-between gap-3">
        <span class="min-w-0">
          <span class="block font-600 leading-snug">${esc(topic.name)}</span>
          <span class="text-sm text-ink-soft mt-0.5 line-clamp-2">${esc(topic.description || '')}</span>
        </span>
        <span class="shrink-0 text-xs font-medium ${chosen ? 'text-brand-dark' : 'text-ink-faint'}">${chosen ? 'Chosen' : 'Choose'}</span>
      </span>
      <span class="block mt-2">${topicChips(topic)}</span>
      ${inBand && age != null ? `<span class="block text-xs text-brand-dark mt-1.5">Fits age ${esc(age)}</span>` : ''}
      ${boost === 2 && year ? `<span class="block text-xs text-brand-dark mt-1.5">Linked to Australian Curriculum ${esc(yearLabel(year))}</span>` : ''}
    </button>`);
    btn.setAttribute('aria-pressed', chosen ? 'true' : 'false');
    btn.onclick = () => choose(topic);
    item.appendChild(btn);
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function progressMap(studentId) {
  return Object.fromEntries(Object.entries(store.progressFor(studentId)).map(([id, v]) => [id, v?.status || 'none']));
}

function pathSection(target, active, navigate) {
  const d = getData();
  const path = buildTopicPath(target.id, { byId: d.byId, prereqsOf: d.prereqsOf, progress: progressMap(active.id) });
  const section = el(`<section id="find-path" class="bg-paper-card border border-paper-line rounded-2xl p-4 sm:p-5 mb-5 scroll-mt-20" aria-labelledby="find-path-h">
    <p class="text-[11px] uppercase tracking-[0.16em] text-ink-faint font-medium">Path</p>
    <h2 id="find-path-h" class="font-display text-xl font-600 leading-tight mt-1">${esc(target.name)}</h2>
    <p class="find-summary text-sm text-ink-soft mt-1 [overflow-wrap:anywhere]"></p>
  </section>`);
  const summary = section.querySelector('.find-summary');
  const done = path.remaining === 0;
  summary.textContent = done
    ? `${active.name} has already mastered this topic.`
    : `${countLabel(path.remaining, 'step')} to go for ${active.name}, counting the topic itself. Only required foundations are listed; helpful ones are on the topic page.`;

  if (path.startsFrom.length) {
    section.appendChild(el(`<p class="text-sm text-ink-soft mt-2"><span class="font-600 text-ink">Builds on</span> ${path.startsFrom.map((t) => esc(t.name)).join(', ')} (mastered).</p>`));
  }

  if (path.next) section.appendChild(nextStepCard(path.next.topic, active, navigate));

  const actions = el(`<div class="flex flex-wrap gap-2 mt-4"></div>`);
  actions.appendChild(linkButton('panel-right', 'Open requested topic', () => navigate('topic', { id: target.id })));
  actions.appendChild(linkButton('map', 'Requested topic on skill tree', () => navigate('graph', graphParamsForTopic(target))));
  section.appendChild(actions);

  if (!done) {
    const list = el(`<ol class="find-steps mt-4 space-y-2"></ol>`);
    const more = el(`<details class="mt-2"><summary class="min-h-11 inline-flex items-center text-sm font-medium text-brand-dark cursor-pointer">Show ${countLabel(path.steps.length - STEPS_SHOWN, 'more step', 'more steps')}</summary><ol class="mt-2 space-y-2" start="${STEPS_SHOWN + 1}"></ol></details>`);
    path.steps.forEach((step, i) => {
      const row = stepRow(step, i + 1, path.next, d, navigate);
      (i < STEPS_SHOWN ? list : more.querySelector('ol')).appendChild(row);
    });
    section.appendChild(el(`<h3 class="text-xs font-600 uppercase tracking-wide text-ink-faint mt-5">All steps, foundations first</h3>`));
    section.appendChild(list);
    if (path.steps.length > STEPS_SHOWN) section.appendChild(more);
  }
  return section;
}

function linkButton(icon, label, onclick) {
  const btn = el(`<button type="button" class="min-h-11 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-paper border border-paper-line text-ink font-medium text-sm hover:border-brand/40"><i data-lucide="${icon}" class="w-4 h-4"></i>${esc(label)}</button>`);
  btn.onclick = onclick;
  return btn;
}

function stepRow(step, n, next, d, navigate) {
  const isNext = next && next.topic.id === step.topic.id;
  const needs = step.state === 'locked'
    ? step.blockers.map((id) => d.byId.get(id)?.name).filter(Boolean)
    : [];
  const row = el(`<li class="find-step rounded-xl border ${isNext ? 'border-brand/50 bg-brand-light/40' : 'border-paper-line bg-paper'} p-3 flex items-start gap-3" data-step-state="${step.state}">
    <span class="w-7 h-7 rounded-full bg-paper-card border border-paper-line flex items-center justify-center text-xs font-600 shrink-0">${n}</span>
    <span class="flex-1 min-w-0">
      <button type="button" class="step-open min-h-11 inline-flex items-center text-left font-600 text-sm leading-snug hover:text-brand-dark">${esc(step.topic.name)}</button>
      <span class="block text-xs text-ink-faint">${esc(step.topic.subject)} · ${esc(step.topic.domain)} · ages ${esc(step.topic.ageRangeStart)}–${esc(step.topic.ageRangeEnd)}</span>
      ${needs.length ? `<span class="block text-xs text-ink-soft mt-1">Needs ${needs.map(esc).join(', ')} first</span>` : ''}
      <span class="block mt-1.5 sm:hidden">${stateChip(step.state)}</span>
    </span>
    <span class="shrink-0 hidden sm:block">${stateChip(step.state)}</span>
  </li>`);
  row.querySelector('.step-open').onclick = () => navigate('topic', { id: step.topic.id });
  return row;
}

// The first unlocked, not-yet-mastered step, with the topic's own actions.
function nextStepCard(topic, active, navigate) {
  const card = el(`<div class="find-next rounded-2xl border border-brand/30 bg-brand-light/60 p-4 mt-4" role="group" aria-label="Next ready step">
    <p class="text-xs font-600 uppercase tracking-wide text-brand-dark">Next ready step</p>
    <p class="font-600 mt-1">${esc(topic.name)}</p>
    <p class="text-sm text-ink-soft mt-0.5">${esc(topic.description || '')}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3"></div>
  </div>`);
  const grid = card.querySelector('.grid');
  const open = el(`<button type="button" class="min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm"><i data-lucide="panel-right" class="w-4 h-4"></i>Open topic page</button>`);
  open.onclick = () => navigate('topic', { id: topic.id });
  grid.appendChild(open);
  const today = el(`<button type="button" class="min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper-card border border-brand/30 text-brand-dark font-medium text-sm hover:border-brand"><i data-lucide="calendar-check" class="w-4 h-4"></i>Add to today</button>`);
  today.onclick = () => {
    const todayKey = keyOf(new Date());
    const { dayKey, outcome } = planTopicOn(active, topic, todayKey);
    const where = dayKey === todayKey ? 'today' : `${dayKey} (today is a rest day)`;
    toast({
      moved: `Moved to ${where} in the calendar`,
      added: `Added to ${where} as an extra lesson`,
      already: `Already on ${where} in the calendar`,
    }[outcome], 'success');
  };
  grid.appendChild(today);
  const plan = el(`<button type="button" class="min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper-card border border-paper-line text-ink font-medium text-sm hover:border-brand/40"><i data-lucide="calendar-plus" class="w-4 h-4"></i>Plan it</button>`);
  plan.onclick = () => openMoveTopic(topic, active, navigate, {
    fromKey: keyOf(new Date()),
    title: `Plan “${topic.name}”`,
    blurb: 'Pick the day for this topic. It moves there in the calendar, or is added as an extra lesson if the track does not hold it.',
    nextLabel: 'Next home day',
    pickLabel: 'Or pick a day',
    submitLabel: 'Plan for this day',
  });
  grid.appendChild(plan);
  const tree = el(`<button type="button" class="min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper-card border border-paper-line text-ink font-medium text-sm hover:border-brand/40"><i data-lucide="map" class="w-4 h-4"></i>Find on skill tree</button>`);
  tree.onclick = () => navigate('graph', graphParamsForTopic(topic));
  grid.appendChild(tree);
  return card;
}

function logSection(log, active, navigate, d) {
  const section = el(`<section class="mb-5" aria-labelledby="find-log-h">
    <h2 id="find-log-h" class="font-600 mb-1">Request log</h2>
    <p class="text-xs text-ink-faint mb-3 [overflow-wrap:anywhere]">What was asked for ${esc(active.name)}, newest first. The last ${formatCount(store.REQUEST_LOG_MAX)} are kept, with the family's data.</p>
  </section>`);
  if (!log.length) {
    section.appendChild(el(`<p class="text-sm text-ink-soft">No requests yet.</p>`));
    return section;
  }
  const list = el(`<ul class="find-log divide-y divide-paper-line rounded-2xl border border-paper-line bg-paper-card"></ul>`);
  for (const r of log.slice(0, LOG_SHOWN)) {
    const topic = r.topicId ? d.byId.get(r.topicId) : null;
    const item = el(`<li><button type="button" class="w-full text-left px-4 py-3 hover:bg-paper flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
      <span class="flex-1 min-w-0 text-sm font-600 break-words">“${esc(r.text)}”</span>
      <span class="text-xs text-ink-soft">${topic ? `Chose ${esc(topic.name)}` : 'No topic chosen'}</span>
      <span class="text-xs text-ink-faint sm:w-36 sm:text-right">${esc(fmtDateTime(r.createdAt))}</span>
    </button></li>`);
    item.querySelector('button').onclick = () => navigate('find', { q: r.text, r: r.id, topic: topic ? topic.id : undefined });
    list.appendChild(item);
  }
  section.appendChild(list);
  if (log.length > LOG_SHOWN) section.appendChild(el(`<p class="text-xs text-ink-faint mt-2">Showing the latest ${formatCount(LOG_SHOWN)} of ${formatCount(log.length)}.</p>`));
  return section;
}
