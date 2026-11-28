import { getData, isCurrentTopic, subjectMeta } from '../data.js';
import { heldLabel, retiredName, retiredTopics } from '../retired.js';
import * as store from '../store.js';
import { el, esc, analysisHtml, ratingStars, refreshIcons, toast, openModal, fmtDate, fmtDateTime } from '../ui.js';
import { openRecorder, audioPlayer, coverageCandidates, coverageClaimField } from '../recorder.js';
import { aiDiscussionAnalysis } from '../ai.js';
import { aiErrorBlock, gateAi } from '../ai-status.js';
import { savedAnalysis, regenerateButton, analysisOptIn, notesIncludedLine } from './recordings.js';
import { coverageFields } from '../daily.js';
import { openLesson } from './lesson.js';
import { openPrintables } from './printables.js';
import { sectionLabel } from './observation.js';
import { CURRICULUM_NAME, learnerYear, yearLabel } from '../curriculum.js';

// Exported for the test that keeps document.js RECORD_TYPES in step.
export const TYPES = {
  observation: { icon: 'eye', label: 'Observation', color: '#2f6285', hint: 'What you noticed as they worked' },
  question: { icon: 'help-circle', label: 'Question', color: '#8a6412', hint: 'Something they asked or wondered' },
  discussion: { icon: 'messages-square', label: 'Discussion', color: '#5b4a86', hint: 'A conversation you had together' },
  assessment: { icon: 'clipboard-check', label: 'Assessment', color: '#3f6b3b', hint: 'A check of what they can do' },
  recording: { icon: 'mic', label: 'Recording', color: '#a4473a', hint: 'A recorded voice conversation' },
};

let recFilter = 'all';
let recFilterFor = null; // learner the filter belongs to; reset on switch

export function renderRecords(params, { navigate }) {
  const d = getData();
  const active = store.activeStudent();
  const root = el(`<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  const header = el(`<div class="flex flex-wrap items-start justify-between gap-3 mb-5">
    <div class="min-w-0 flex-1 basis-52">
      <h1 class="font-display text-2xl sm:text-3xl font-600">Records</h1>
      <p class="text-ink-soft text-sm mt-1">Observations, questions and discussions for <span class="font-600 text-ink [overflow-wrap:anywhere]">${esc(active?.name || 'your student')}</span>.</p>
    </div>
    <div class="shrink-0 flex flex-wrap gap-2 max-w-full">
      <button id="rec" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#a4473a] hover:bg-[#86372c] text-white text-sm font-medium transition-colors"><i data-lucide="mic" class="w-4 h-4 shrink-0"></i>Record</button>
      <button id="new" class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"><i data-lucide="plus" class="w-4 h-4 shrink-0"></i>New record</button>
    </div>
  </div>`);
  header.querySelector('#new').onclick = () => openRecordForm(active?.id);
  header.querySelector('#rec').onclick = () => openRecorder(active?.id);
  root.appendChild(header);
  root.appendChild(savedLessonsShelf(d));

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to start recording.</p>`)); return root; }

  root.appendChild(coverageLink(active, d, navigate));
  root.appendChild(archivedTopics(active));

  if (recFilterFor !== active.id) { recFilter = 'all'; recFilterFor = active.id; }
  const all = store.recordsFor(active.id);

  // filter chips
  const chips = el(`<div class="flex gap-2 overflow-x-auto pb-2 mb-4"></div>`);
  const addChip = (key, label) => {
    const on = recFilter === key;
    const c = el(`<button class="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${on ? 'bg-ink text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line'}">${esc(label)}</button>`);
    c.onclick = () => { recFilter = key; navigate('records'); };
    chips.appendChild(c);
  };
  addChip('all', `All (${all.length})`);
  Object.entries(TYPES).forEach(([k, v]) => addChip(k, v.label));
  root.appendChild(chips);

  const filtered = recFilter === 'all' ? all : all.filter(r => r.type === recFilter);

  if (filtered.length === 0) {
    root.appendChild(el(`<div class="text-center py-16 text-ink-faint">
      <i data-lucide="notebook-pen" class="w-10 h-10 mx-auto mb-3"></i>
      <p class="text-sm">No records yet. Capture what you observe as your student learns.</p>
    </div>`));
    refreshIcons();
    return root;
  }

  const list = el(`<div class="space-y-3"></div>`);
  filtered.forEach(r => list.appendChild(recordCard(r, active, d, navigate)));
  root.appendChild(list);
  refreshIcons();
  return root;
}

// The way into the Australian Curriculum coverage report (views/coverage.js),
// when the curriculum list loaded. Shown for every learner; the report
// defaults to the year their age suggests when none is set.
function coverageLink(active, d, navigate) {
  if (!d.standards) return el('<span class="hidden"></span>');
  const year = learnerYear(active);
  const card = el(`<button type="button" class="coverage-link w-full text-left flex items-center gap-3 min-h-11 bg-paper-card border border-paper-line rounded-2xl p-4 mb-5 hover:border-brand/40 transition-colors">
    <i data-lucide="clipboard-list" class="w-5 h-5 text-brand-dark shrink-0"></i>
    <span class="flex-1 min-w-0">
      <span class="block font-600 text-sm">${esc(CURRICULUM_NAME)} coverage</span>
      <span class="block text-xs text-ink-soft mt-0.5">${year ? `${esc(yearLabel(year))}: ` : ''}content descriptions with the evidence in these records, ready to print.</span>
    </span>
    <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0"></i>
  </button>`);
  card.onclick = () => navigate('coverage');
  return card;
}

// Without an AI provider, lessons and Print & go sheets saved earlier on this
// server still open (no AI call). Only entries that pass the cache validators
// are listed, and only for kinds whose capability is unavailable; with a
// provider for both the shelf is not shown.
const SHELF_KINDS = {
  'topic:': { label: 'Lesson', icon: 'notebook-text', capability: 'lesson', open: openLesson },
  'print:': { label: 'Print & go', icon: 'printer', capability: 'printables', open: openPrintables },
};
function savedLessonsShelf(d) {
  const shelf = el(`<section aria-label="Saved lessons" class="saved-lessons hidden bg-paper-card border border-paper-line rounded-2xl p-4 mb-5">
    <h2 class="font-600 flex items-center gap-2"><i data-lucide="bookmark" class="w-4.5 h-4.5 text-brand-dark"></i>Saved lessons</h2>
    <p class="text-xs text-ink-soft mt-0.5 mb-3">Saved on this server earlier. They open without an AI provider.</p>
    <ul class="divide-y divide-paper-line"></ul>
  </section>`);
  const prefixes = Object.keys(SHELF_KINDS).filter(p => !store.aiAvailable(SHELF_KINDS[p].capability));
  if (!prefixes.length) return shelf;
  store.savedLessons(prefixes).then(entries => {
    const list = shelf.querySelector('ul');
    for (const { key, savedAt } of entries) {
      const prefix = Object.keys(SHELF_KINDS).find(p => key.startsWith(p));
      const kind = SHELF_KINDS[prefix];
      const topic = d.byId.get(key.slice(prefix.length));
      if (!topic) continue;
      const row = el(`<li class="flex items-center gap-3 py-2">
        <i data-lucide="${esc(kind.icon)}" class="w-4 h-4 text-ink-faint shrink-0"></i>
        <div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${esc(topic.name)}</p><p class="text-xs text-ink-faint">${esc(kind.label)}${savedAt ? ` · saved ${esc(fmtDate(savedAt))}` : ''}</p></div>
        <button class="shrink-0 px-3 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg border border-brand/30 text-sm font-medium text-brand-dark hover:border-brand" aria-label="Open ${esc(kind.label)}: ${esc(topic.name)}">Open</button>
      </li>`);
      row.querySelector('button').onclick = () => kind.open(topic);
      list.appendChild(row);
    }
    if (!list.children.length) return;
    shelf.classList.remove('hidden');
    refreshIcons();
  });
  return shelf;
}

// Topics the curriculum no longer has (a taxonomy update retired them) that
// this learner's data still mentions: kept, never counted, listed here so
// nothing disappears silently.
function archivedTopics(student) {
  const section = el(`<section aria-label="Archived topics" class="archived-topics hidden bg-paper-card border border-paper-line rounded-2xl p-4 mb-5">
    <h2 class="font-600 flex items-center gap-2"><i data-lucide="archive" class="w-4.5 h-4.5 text-ink-faint"></i>Archived topics</h2>
    <p class="text-xs text-ink-soft mt-0.5 mb-3">No longer in the curriculum after an update. What you recorded for them is kept here; they no longer count toward progress or daily choices.</p>
    <ul class="divide-y divide-paper-line"></ul>
  </section>`);
  const paint = (topics) => {
    const ul = section.querySelector('ul');
    ul.replaceChildren(...topics.map(t => el(`<li class="archived-topic flex items-start gap-3 py-2">
      <i data-lucide="archive" class="w-4 h-4 mt-0.5 text-ink-faint shrink-0"></i>
      <div class="flex-1 min-w-0"><p class="text-sm font-medium break-words">${esc(retiredName(t))} <span class="text-xs font-normal text-ink-faint">· archived topic</span></p><p class="text-xs text-ink-faint break-words">${esc(heldLabel(t.held))}</p></div>
    </li>`)));
    section.classList.toggle('hidden', !topics.length);
    refreshIcons();
  };
  paint(retiredTopics(store.get(), student.id, isCurrentTopic));
  return section;
}

// Names of the topics a record claims as coverage, skipping malformed entries.
function coverageNames(r) {
  return (Array.isArray(r.coverage) ? r.coverage : [])
    .filter(c => c && typeof c === 'object' && (c.topicName || c.topicId))
    .map(c => String(c.topicName || c.topicId));
}

function recordCard(r, student, d, navigate) {
  const tm = TYPES[r.type] || { icon: 'sticky-note', label: 'Note', color: '#6f665a' };
  const topic = r.topicId ? d.byId.get(r.topicId) : null;
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-4 min-w-0">
    <div class="flex flex-wrap items-center gap-2 text-xs mb-1.5">
      <span class="flex items-center gap-1 font-600 px-2 py-0.5 rounded-full" style="color:${esc(tm.color)};background:${esc(tm.color)}14"><i data-lucide="${esc(tm.icon)}" class="w-3.5 h-3.5"></i>${esc(tm.label)}</span>
      ${r.observed ? '<span class="observed-chip flex items-center gap-1 font-medium px-2 py-0.5 rounded-full text-[#2f6285] bg-[#2f6285]/10"><i data-lucide="eye" class="w-3.5 h-3.5"></i>observed</span>' : ''}
      ${r.rating ? `<span class="text-[#8a6412]">${ratingStars(r.rating)}</span>` : ''}
      <span class="text-ink-faint ml-auto">${esc(fmtDateTime(r.createdAt))}</span>
      <button class="del text-ink-faint hover:text-[#a4473a] w-11 h-11 -my-[13px] -mr-[13px] flex items-center justify-center shrink-0 lg:w-auto lg:h-auto lg:m-0 lg:p-0.5" title="Delete record" aria-label="Delete record ${esc(r.title || tm.label)}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>
    ${r.title ? `<p class="font-600 break-words [overflow-wrap:anywhere]">${esc(r.title)}</p>` : ''}
    ${coverageNames(r).length ? `<p class="text-xs font-600 text-brand-dark mb-1 flex items-start gap-1.5 min-w-0"><i data-lucide="check-circle-2" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i><span class="min-w-0 break-words">Coverage: ${coverageNames(r).map(esc).join(' · ')}</span></p>` : ''}
    ${r.note ? `<p class="text-sm text-ink-soft mt-1 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">${esc(r.note)}</p>` : ''}
    ${r.transcript ? `<details class="mt-2 group"><summary class="text-xs text-ink-faint cursor-pointer select-none flex items-center gap-1 list-none"><i data-lucide="chevron-right" class="w-3.5 h-3.5 transition-transform group-open:rotate-90"></i>Transcript</summary><p class="text-sm text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] bg-paper border border-paper-line rounded-lg p-2.5">${esc(r.transcript)}</p></details>` : ''}
    ${!topic && r.topicId && !isCurrentTopic(r.topicId) ? `<p class="mt-2.5 inline-flex max-w-full items-center gap-1.5 text-xs text-ink-faint break-words"><i data-lucide="archive" class="w-3.5 h-3.5 shrink-0"></i><span>${esc(r.topicName || r.topicId)} · archived topic</span></p>` : ''}
    ${topic ? `<button class="topic mt-2.5 inline-flex max-w-full items-center gap-1.5 text-left text-xs font-medium text-brand-dark"><i data-lucide="${esc(subjectMeta(topic.subject)?.icon)}" class="w-3.5 h-3.5 shrink-0"></i><span class="min-w-0 break-words">${esc(topic.name)}</span><i data-lucide="chevron-right" class="w-3.5 h-3.5 shrink-0"></i></button>` : ''}
  </div>`);
  if (r.audioPath) card.appendChild(audioPlayer(r.audioPath, r.duration));

  // Saved analysis (shared with the Recordings folder), plus analyze/regenerate for discussions / recordings
  const analyzable = r.type === 'recording' || r.type === 'discussion';
  if (analyzable || r.analysis) {
    const analyzeWrap = el(`<div class="mt-2.5 pt-2.5 border-t border-paper-line"></div>`);
    const run = includeNotes => openAnalysis(r, student, topic, includeNotes);
    if (r.analysis) {
      analyzeWrap.appendChild(savedAnalysis(r.analysis));
      const redo = regenerateButton(); // null when analysis cannot generate
      if (redo) {
        analyzeWrap.appendChild(redo);
        analyzeWrap.appendChild(analysisOptIn(redo, r, run));
      }
    } else {
      const btn = el(`<button class="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="sparkles" class="w-4 h-4"></i>Analyse &amp; get advice</button>`);
      const gated = gateAi(btn, { capability: 'analysis' });
      analyzeWrap.appendChild(gated);
      if (gated === btn) analyzeWrap.appendChild(analysisOptIn(btn, r, run));
    }
    card.appendChild(analyzeWrap);
  }

  if (r.observed) card.appendChild(observedDetails(r));
  if (r.placement) card.appendChild(placementUndo(r, student));

  const delMsg = r.placement && !r.placement.undoneAt
    ? 'Delete this placement record? The placement stays, but it can no longer be undone.'
    : 'Delete this record?';
  card.querySelector('.del').onclick = () => { if (confirm(delMsg)) store.removeRecord(student.id, r.id); };
  card.querySelector('.topic')?.addEventListener('click', () => navigate('topic', { id: r.topicId }));
  return card;
}

// An observation check: what was seen, and what the pass completed.
function observedDetails(r) {
  const o = r.observed;
  const items = Array.isArray(o.items) ? o.items : [];
  const wrap = el(`<div class="mt-2.5 pt-2.5 border-t border-paper-line">
    <p class="text-xs font-600 ${o.passed ? 'text-brand-dark' : 'text-[#8a6412]'}">${o.passed ? 'Every item seen: marked mastered' : `${esc(o.score)} of ${esc(o.total)} seen: not marked mastered yet`}</p>
    ${o.sectionId ? `<p class="text-xs text-ink-soft mt-0.5">Completed the section ${esc(sectionLabel(o.sectionId))} by observation.</p>` : ''}
    ${o.subject ? `<p class="text-xs text-ink-soft mt-0.5">Completed ${esc(o.subject)} by observation.</p>` : ''}
    <ul class="mt-1.5 space-y-1">${items.map(it => `<li class="flex gap-2 text-xs ${it.seen ? 'text-ink-soft' : 'text-ink-faint'}"><i data-lucide="${it.seen ? 'check' : 'minus'}" class="w-3.5 h-3.5 shrink-0 mt-px ${it.seen ? 'text-brand' : ''}"></i><span>${esc(it.text)}</span></li>`).join('')}</ul>
  </div>`);
  return wrap;
}

// Undo for a placement record: reverts exactly the topics it changed.
function placementUndo(r, student) {
  const wrap = el(`<div class="mt-2.5 pt-2.5 border-t border-paper-line"></div>`);
  if (r.placement.undoneAt) {
    wrap.appendChild(el(`<p class="text-xs text-ink-faint flex items-center gap-1.5"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i>Placement undone ${esc(fmtDateTime(r.placement.undoneAt))}</p>`));
    return wrap;
  }
  const n = r.placement.topicIds.length;
  const btn = el(`<button class="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="undo-2" class="w-4 h-4"></i>Undo placement</button>`);
  btn.onclick = () => {
    if (!confirm(`Return these ${n} topic${n === 1 ? '' : 's'} to their status before the placement?`)) return;
    const res = store.undoPlacement(student.id, r.id);
    if (!res) return;
    toast(res.kept
      ? `Reverted ${res.reverted}; ${res.kept} changed since and kept as they are`
      : `Reverted ${res.reverted} topic${res.reverted === 1 ? '' : 's'}`, 'success');
  };
  wrap.appendChild(btn);
  return wrap;
}

function openAnalysis(record, student, topic, includeNotes = false) {
  const body = el(`<div class="p-5">
    <div class="flex items-start gap-3 mb-4">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="sparkles" class="w-5 h-5 text-brand-dark"></i></span>
      <div>
        <p class="text-xs text-ink-faint">Discussion analysis</p>
        <h3 class="font-display text-lg font-600 leading-tight">${esc(record.title || 'Recorded discussion')}</h3>
      </div>
    </div>
    <div id="stage"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });

  const hasContent = (record.transcript && record.transcript.trim()) || (includeNotes && record.note && record.note.trim());
  if (!hasContent) {
    stage.appendChild(el(`<p class="text-sm text-ink-soft py-4">There's no transcript or shared notes to analyse for this record. Record a discussion with the live transcript on, or tick “Include my notes in this request”, then try again.</p>`));
    refreshIcons();
    return;
  }

  stage.appendChild(el(`<div class="text-center py-8">
    <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-sm font-600">Analysing the discussion${includeNotes ? ' (notes included)' : ''}\u2026</p>
    <p class="text-xs text-ink-faint mt-1 [overflow-wrap:anywhere]">Looking at what ${esc(student.name)} understands and where they're stuck.</p>
  </div>`));
  refreshIcons();

  aiDiscussionAnalysis({
    age: store.studentAge(student),
    topic: topic || null,
    transcript: record.transcript || '',
    note: record.note || '',
    includeNotes,
  }).then(html => {
    // Persist onto the record, as the Recordings folder does, so the card shows it.
    store.updateRecord(student.id, record.id, { analysis: html, analyzedAt: Date.now() });
    stage.innerHTML = '';
    stage.appendChild(el(`<div class="ai-prose text-sm text-ink-soft">${analysisHtml(html)}</div>`));
    const save = el(`<button class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="save" class="w-4 h-4"></i>Save advice to records</button>`);
    save.onclick = () => {
      store.addRecord(student.id, {
        type: 'observation',
        title: `Advice · ${record.title || 'discussion'}`,
        note: stage.querySelector('.ai-prose').innerText.trim(),
        topicId: record.topicId || null,
        topicName: record.topicName || null,
      });
      toast('Advice saved to records', 'success');
      save.disabled = true; save.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>Saved';
      refreshIcons();
    };
    stage.appendChild(save);
    refreshIcons();
  }).catch((e) => {
    stage.innerHTML = '';
    if (includeNotes) stage.appendChild(notesIncludedLine());
    stage.appendChild(aiErrorBlock(e, () => { m.close(); openAnalysis(record, student, topic, includeNotes); }));
  });
}

// options: { coverageTopicIds, source } — topics the record may claim as
// curriculum coverage (opt-in checkbox), and what the record is evidence for
// ({ kind: 'daily-pick' | 'invitation', key }).
export function openRecordForm(studentId, topic = null, options = {}) {
  if (!studentId) { toast('Add a student first', 'error'); return; }
  const d = getData();
  const coverageTopics = coverageCandidates(d, options.coverageTopicIds);
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">${esc(topic ? 'Record for ' + topic.name : 'New record')}</h3>
    <form id="f" class="space-y-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Type</label>
        <div id="types" class="grid grid-cols-2 gap-2"></div>
      </div>
      ${!topic ? `<div>
        <label class="text-sm font-medium block mb-1.5">Linked topic <span class="text-ink-faint font-normal">(optional)</span></label>
        <input id="search" placeholder="Search topics\u2026" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" autocomplete="off" />
        <div id="results" class="mt-1 max-h-40 overflow-y-auto space-y-1"></div>
        <input type="hidden" name="topicId" />
      </div>` : `<input type="hidden" name="topicId" value="${esc(topic.id)}" />`}
      <div>
        <label class="text-sm font-medium block mb-1.5">Title <span class="text-ink-faint font-normal">(optional)</span></label>
        <input name="title" maxlength="1000" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Notes</label>
        <textarea name="note" rows="4" maxlength="50000" placeholder="What happened? What did they say or ask?" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"></textarea>
      </div>
      ${coverageClaimField(coverageTopics)}
      <div>
        <label class="text-sm font-medium block mb-1.5">Confidence <span class="text-ink-faint font-normal">(optional)</span></label>
        <div id="stars" class="flex gap-1"></div>
      </div>
      <button class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Save record</button>
    </form>
  </div>`);

  // type selector
  let selType = 'observation';
  const typesWrap = body.querySelector('#types');
  const renderTypes = () => {
    typesWrap.innerHTML = '';
    // Recordings come only from the recorder, never from this form.
    Object.entries(TYPES).filter(([k]) => k !== 'recording').forEach(([k, v]) => {
      const on = selType === k;
      const b = el(`<button type="button" class="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${on ? 'border-transparent text-white' : 'bg-paper text-ink-soft border-paper-line'}" ${on ? `style="background:${esc(v.color)}"` : ''}>
        <i data-lucide="${esc(v.icon)}" class="w-4 h-4"></i>${esc(v.label)}</button>`);
      b.onclick = () => { selType = k; renderTypes(); };
      typesWrap.appendChild(b);
    });
    refreshIcons();
  };
  renderTypes();

  // rating stars
  let rating = 0;
  const starsWrap = body.querySelector('#stars');
  const renderStars = () => {
    starsWrap.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = el(`<button type="button" class="text-2xl leading-none ${i <= rating ? 'text-[#8a6412]' : 'text-paper-line'}">${i <= rating ? '\u2605' : '\u2606'}</button>`);
      b.onclick = () => { rating = (rating === i) ? 0 : i; renderStars(); };
      starsWrap.appendChild(b);
    }
  };
  renderStars();

  // topic search
  if (!topic) {
    const search = body.querySelector('#search');
    const results = body.querySelector('#results');
    const hidden = body.querySelector('input[name="topicId"]');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      results.innerHTML = '';
      if (q.length < 2) return;
      const matches = d.topics.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6);
      matches.forEach(t => {
        const r = el(`<button type="button" class="w-full text-left px-3 py-2 rounded-lg hover:bg-paper text-sm flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${esc(subjectMeta(t.subject)?.color)}"></span><span class="flex-1 truncate">${esc(t.name)}</span><span class="text-xs text-ink-faint">${esc(t.subject)}</span></button>`);
        r.onclick = () => { hidden.value = t.id; search.value = t.name; results.innerHTML = ''; };
        results.appendChild(r);
      });
    });
  }

  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const note = fd.get('note').trim();
    const title = fd.get('title').trim();
    if (!note && !title) { toast('Add a title or note', 'error'); return; }
    const rec = { type: selType, title, note, rating: rating || null, topicId: fd.get('topicId') || null };
    if (rec.topicId) rec.topicName = d.byId.get(rec.topicId)?.name || null;
    Object.assign(rec, coverageFields(coverageTopics, !!fd.get('claimCoverage'), options.source));
    store.addRecord(studentId, rec);
    toast('Record saved', 'success');
    m.close();
  };

  const m = openModal(body);
}
