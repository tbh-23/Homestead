import { getData, isCurrentTopic, subjectMeta } from '../data.js';
import { retiredName, retiredTopics } from '../retired.js';
import { graphParamsForTopic } from './graph.js';
import * as store from '../store.js';
import { growthChip, growthIcon, stageForStatus } from '../meadow.js';
import { el, esc, analysisHtml, ratingStars, refreshIcons, toast, fmtDateTime } from '../ui.js';
import { countLabel, formatCount } from '../format.js';
import { isUnlocked, blockingPrereqs, MASTERY, sectionForTopic, topicsMasteryStats, sectionTestReady } from '../mastery.js';
import { openMasteryTest } from './masterytest.js';
import { openChallenge } from './challenge.js';
import { referenceLinks, videoLinks, activityIdeas, gameIdeas } from '../resources.js';
import { openRecordForm } from './records.js';
import { openRecorder, audioPlayer } from '../recorder.js';
import { aiExplain, aiQuiz } from '../ai.js';
import { openLesson, openActivityDetail, activityCacheKey } from './lesson.js';
import { openPrintables } from './printables.js';
import { recallSectionCard } from './recall.js';
import { aiErrorBlock, aiUnavailableChip, gateAi } from '../ai-status.js';
import { howItWorksFrame } from './howitworks.js';
import { openObservation, canObserve } from './observation.js';
import { teachingGuideSection, offerTeachingGuide } from './teachingguide.js';
import { ACARA_NOTICE, CURRICULUM_NAME, learnerYear, topicStandards, yearLabel, yearsLabel } from '../curriculum.js';

// The Australian Curriculum content descriptions Marble links this topic to,
// as chips ("AC9M2N01 · Year 2 · Number"). A chip opens its text. The ACARA
// notice shows once, below the chips, whenever the section does. Null when
// the topic links to none.
function curriculumLinks(t, standards, active) {
  const linked = topicStandards(t, standards?.index);
  if (!linked.length) return null;
  const year = learnerYear(active);
  const box = el(`<section class="topic-curriculum mb-5" aria-label="${esc(CURRICULUM_NAME)}">
    <p class="text-xs font-600 text-ink-soft mb-1.5">Linked to the ${esc(CURRICULUM_NAME)} (version 9)</p>
    <div class="flex flex-wrap gap-1.5"></div>
    <div class="ac-detail hidden mt-2.5 [overflow-wrap:anywhere] rounded-xl bg-paper-card border border-paper-line p-3.5" aria-live="polite"></div>
    <p class="ac-notice text-[11px] text-ink-faint mt-2 leading-relaxed [overflow-wrap:anywhere]">${esc(ACARA_NOTICE)}</p>
  </section>`);
  const chips = box.querySelector('div');
  const detail = box.querySelector('.ac-detail');
  let open = null;
  for (const s of linked) {
    const atYear = year && s.yearLevels.includes(year);
    const chip = el(`<button type="button" class="ac-chip min-h-11 max-w-full px-3 py-1.5 rounded-full border text-xs font-medium text-left break-words ${atYear ? 'border-brand/50 bg-brand-light text-brand-dark' : 'border-paper-line bg-paper-card text-ink-soft hover:border-brand/40'}" aria-expanded="false"></button>`);
    chip.textContent = `${s.code} · ${yearsLabel(s.yearLevels)} · ${s.strand}`;
    if (atYear) chip.title = `${active.name}'s year: ${yearLabel(year)}`;
    chip.onclick = () => {
      const closing = open === s.code;
      open = closing ? null : s.code;
      for (const c of chips.children) c.setAttribute('aria-expanded', 'false');
      detail.classList.toggle('hidden', closing);
      if (closing) { detail.innerHTML = ''; return; }
      chip.setAttribute('aria-expanded', 'true');
      detail.innerHTML = `
        <p class="text-xs font-600 text-ink-soft">${esc(s.code)} · ${esc(yearsLabel(s.yearLevels))} · ${esc(s.learningArea)}${s.subject && s.subject !== s.learningArea ? ` · ${esc(s.subject)}` : ''} · ${esc(s.strand)}</p>
        <p class="ac-text text-sm text-ink mt-1 leading-relaxed">${esc(s.description || s.title)}</p>
        <p class="text-xs text-ink-faint mt-2 leading-relaxed">Marble's map links this topic to the content description; it is not a check that the description is met.</p>`;
    };
    chips.appendChild(chip);
  }
  return box;
}

export function renderTopic(params, { navigate }) {
  const d = getData();
  const t = d.byId.get(params.id);
  const active = store.activeStudent();

  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  if (!t) { root.appendChild(missingTopic(params.id, navigate)); return root; }

  const meta = subjectMeta(t.subject);
  const status = active ? store.statusOf(active.id, t.id) : 'none';
  const unlocked = active ? isUnlocked(active.id, t.id) : true;
  const blocking = active ? blockingPrereqs(active.id, t.id) : [];

  // back + breadcrumb
  const back = el(`<button class="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-4"><i data-lucide="arrow-left" class="w-4 h-4"></i>Back to graph</button>`);
  back.onclick = () => navigate('graph', graphParamsForTopic(t));
  root.appendChild(back);

  // Header
  root.appendChild(el(`
    <div class="mb-5">
      <div class="flex flex-wrap items-center gap-2 mb-2.5 text-xs font-medium">
        <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white" style="background:${esc(meta.color)}"><i data-lucide="${esc(meta.icon)}" class="w-3.5 h-3.5"></i>${esc(t.subject)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">${esc(t.domain)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">Ages ${esc(t.ageRangeStart)}–${esc(t.ageRangeEnd)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-faint capitalize">${esc((t.type||'').toLowerCase())}</span>
      </div>
      ${active ? '<div class="status-control"></div>' : ''}
      <h1 class="font-display text-2xl sm:text-3xl font-600 leading-tight break-words [overflow-wrap:anywhere]">${esc(t.name)}</h1>
      <p class="text-ink-soft mt-2 leading-relaxed break-words [overflow-wrap:anywhere]">${esc(t.description || '')}</p>
    </div>`));

  root.querySelector('.status-control')?.replaceWith(statusControl(t, active, unlocked));

  const curriculum = curriculumLinks(t, d.standards, active);
  if (curriculum) root.appendChild(curriculum);

  // Locked banner
  if (!unlocked) {
    root.appendChild(el(`<div class="rounded-xl border border-[#f3b7a8] bg-[#fbe5de] p-4 mb-5 flex gap-3">
      <i data-lucide="lock" class="w-5 h-5 text-[#a4473a] shrink-0 mt-0.5"></i>
      <div>
        <p class="font-600 text-sm text-[#8e3a2f]">Foundations needed first</p>
        <p class="text-sm text-[#8a6412] mt-0.5">Master ${esc(blocking.length)} prerequisite${blocking.length>1?'s':''} below before starting this topic — this keeps learning solid.</p>
      </div>
    </div>`));
  }

  // Full lesson call-to-action
  const lessonCta = el(`<div class="rounded-2xl border border-brand/30 bg-brand-light/60 p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
    <span class="w-11 h-11 rounded-xl bg-brand flex items-center justify-center shrink-0"><i data-lucide="notebook-text" class="w-5.5 h-5.5 text-white"></i></span>
    <div class="flex-1 min-w-0">
      <p class="font-600">Ready-to-teach lesson</p>
      <p class="text-sm text-ink-soft leading-relaxed [overflow-wrap:anywhere]">A complete plan with what to say, do, practice and check — usable today with ${esc(active?.name || 'your child')}.</p>
    </div>
    <div class="cta-actions shrink-0 flex flex-col sm:flex-row gap-2 max-w-full">
      <button id="openlesson" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="book-open-text" class="w-4 h-4"></i>Open full lesson</button>
      <button id="openprint" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper-card border border-brand/30 text-brand-dark font-medium hover:border-brand transition-colors"><i data-lucide="printer" class="w-4 h-4"></i>Print &amp; go</button>
    </div>
  </div>`);
  const lessonBtn = lessonCta.querySelector('#openlesson');
  const printBtn = lessonCta.querySelector('#openprint');
  lessonBtn.onclick = () => openLesson(t);
  printBtn.onclick = () => openPrintables(t);
  // Without a provider (or with a capability off), show only what is already
  // cached. One chip stands in for both unless the lesson itself can generate.
  const savedBtn = el(`<button class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="book-open-text" class="w-4 h-4"></i>Open saved lesson</button>`);
  savedBtn.onclick = () => openLesson(t);
  lessonBtn.replaceWith(gateAi(lessonBtn, { capability: 'lesson', cachedKey: 'topic:' + t.id, saved: savedBtn }));
  const printFallback = store.aiAvailable('lesson') ? null : el('<span class="hidden"></span>');
  printBtn.replaceWith(gateAi(printBtn, { capability: 'printables', cachedKey: 'print:' + t.id, fallback: printFallback }));
  // Without AI lessons, the teaching guide (when the topic has one) comes first.
  if (!store.aiAvailable('lesson')) {
    const actions = lessonCta.querySelector('.cta-actions');
    offerTeachingGuide(t, btn => actions.prepend(btn), { navigate });
  }
  root.appendChild(lessonCta);

  // Two column layout
  const grid = el(`<div class="grid lg:grid-cols-3 gap-5"></div>`);
  const mainCol = el(`<div class="lg:col-span-2 space-y-5 min-w-0"></div>`);
  const sideCol = el(`<div class="space-y-5 min-w-0"></div>`);

  // --- Teaching guide: Marble's teaching research, for the topics that have it ---
  mainCol.appendChild(teachingGuideSection(t, { navigate }));

  // --- See how it works (HAR-34): an interactive figure, for the topics that have one ---
  const figure = howItWorksFrame(t);
  if (figure) {
    const full = `<button class="full-figure text-sm font-medium text-brand-dark flex items-center gap-1 min-h-[44px]"><i data-lucide="maximize-2" class="w-4 h-4"></i>Full size</button>`;
    const how = section('mouse-pointer-click', 'See how it works', figure, full);
    how.querySelector('.full-figure').onclick = () => navigate('figure', { id: t.id });
    mainCol.appendChild(how);
  }

  // --- Mastery control ---
  mainCol.appendChild(masterySection(t, active));

  // --- Evidence of mastery ---
  if (t.evidence && t.evidence.length) {
    mainCol.appendChild(section('clipboard-check', 'What mastery looks like', el(`
      <ul class="space-y-2">${t.evidence.map(e => `<li class="flex gap-2.5 text-sm text-ink-soft"><i data-lucide="check" class="w-4 h-4 text-brand shrink-0 mt-0.5"></i><span>${esc(e)}</span></li>`).join('')}</ul>`)));
  }

  // --- Assessment prompt ---
  if (t.assessmentPrompt) {
    const prompt = t.assessmentPrompt.replace(/\{\{name\}\}/g, active?.name || 'your child');
    mainCol.appendChild(section('help-circle', 'Quick check', el(`<p class="text-sm text-ink-soft leading-relaxed italic [overflow-wrap:anywhere]">"${esc(prompt)}"</p>`)));
  }

  // --- Active recall ---
  mainCol.appendChild(recallSectionCard(t, active));

  // --- AI tools ---
  mainCol.appendChild(aiSection(t));

  // --- Activities & Games ---
  mainCol.appendChild(activitiesSection(t));

  // --- Records for this topic ---
  mainCol.appendChild(recordsSection(t, active, navigate));

  // --- Section mastery check ---
  sideCol.appendChild(sectionCheckSection(t, active));

  // --- Section recordings ---
  sideCol.appendChild(sectionRecordingsSection(t, active));

  // --- Connections (prereqs + unlocks) ---
  sideCol.appendChild(connectionsSection(t, active, navigate));

  // --- Reference & videos ---
  sideCol.appendChild(referenceSection(t));

  grid.appendChild(mainCol);
  grid.appendChild(sideCol);
  root.appendChild(grid);
  refreshIcons();
  return root;
}

function section(icon, title, contentEl, extra = '') {
  const s = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 min-w-0">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3.5">
      <h2 class="font-600 flex items-center gap-2 min-w-0"><i data-lucide="${esc(icon)}" class="w-4.5 h-4.5 text-brand-dark shrink-0"></i>${esc(title)}</h2>
      <span class="shrink-0">${extra}</span>
    </div>
    <div class="body min-w-0"></div>
  </div>`);
  s.querySelector('.body').appendChild(contentEl);
  return s;
}

function masterySection(t, student) {
  const meta = subjectMeta(t.subject);
  const body = el(`<div></div>`);
  if (!student) {
    body.appendChild(el(`<p class="text-sm text-ink-faint">Add a student to track mastery.</p>`));
    return section('target', 'Topic mastery test', body);
  }
  const status = store.statusOf(student.id, t.id);
  const last = store.lastTopicTest(student.id, t.id);
  const passed = status === 'mastered';
  const unlocked = isUnlocked(student.id, t.id);
  const blocking = blockingPrereqs(student.id, t.id);

  if (passed) {
    body.appendChild(el(`<div class="rounded-xl bg-brand-light/60 border border-brand/30 p-3.5 flex items-center gap-2.5 mb-3">
      <i data-lucide="badge-check" class="w-5 h-5 text-brand-dark shrink-0"></i>
      <p class="text-sm text-ink-soft"><span class="font-600 text-ink">Mastered.</span> ${last && last.passed && last.mode === 'observed' ? `Seen by observation (${esc(last.score)} of ${esc(last.total)}).` : last && last.passed ? `Passed the topic test with ${esc(last.pct)}%.` : 'This topic is marked mastered.'}</p>
    </div>`));
    const chBest = store.challengesFor(student.id, t.id).sort((a,b)=>(b.correct/b.total)-(a.correct/a.total))[0];
    const ch = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm transition-colors mb-2" style="background:${esc(meta.color)}"><i data-lucide="zap" class="w-4 h-4"></i>Try the challenge quiz</button>`);
    ch.onclick = () => openChallenge(t);
    // Hidden when it cannot generate; the retake button below shows a chip
    // when tests cannot either.
    if (store.aiAvailable('challenge')) {
      body.appendChild(ch);
      body.appendChild(el(`<p class="text-xs text-ink-faint mb-1">A timed, slightly harder stretch to keep them challenged.${chBest ? ` Best: ${esc(chBest.correct)}/${esc(chBest.total)}.` : ''}</p>`));
    }
  } else {
    body.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed mb-3">Passing this topic's mastery test (${90}%+), or seeing every item in an observation check, marks it <span class="font-600">mastered</span> and counts toward the section check. ${last ? `<span class="text-[#a4473a] font-medium">Last attempt: ${last.mode === 'observed' ? `${esc(last.score)} of ${esc(last.total)} seen by observation` : `${esc(last.pct)}%`}.</span>` : ''}</p>`));
    if (!unlocked) {
      body.appendChild(el(`<p class="text-xs text-[#a4473a] flex items-start gap-1.5 mb-3"><i data-lucide="lock" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>Master ${esc(blocking.length)} prerequisite${blocking.length>1?'s':''} first (see Connections) — but you can still test if you're ready.</p>`));
    }
  }

  const btn = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${passed ? 'bg-paper border border-paper-line text-ink-soft hover:border-brand/40' : 'text-white'} font-medium text-sm transition-colors" ${passed ? '' : `style="background:${esc(meta.color)}"`}>
    <i data-lucide="file-check-2" class="w-4 h-4"></i>${passed ? 'Retake topic test' : 'Take topic mastery test'}</button>`);
  btn.onclick = () => openMasteryTest(t.subject, null, t);
  body.appendChild(gateAi(btn, { capability: 'test' }));

  // The non-AI path: tick the topic's evidence items while watching.
  if (canObserve(t)) {
    const queued = store.levelsetFor(student.id).observe.includes(t.id);
    const ob = el(`<button class="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper border border-brand/30 text-brand-dark font-medium text-sm hover:border-brand transition-colors"><i data-lucide="eye" class="w-4 h-4"></i>Check mastery by observation</button>`);
    ob.onclick = () => openObservation(t, student);
    body.appendChild(ob);
    body.appendChild(el(`<p class="text-xs text-ink-faint mt-1.5">${queued ? 'Waiting for a check: you marked it “Unsure” in the level-set workbook. ' : ''}Tick the evidence you see. Works without AI.</p>`));
  }

  return section('target', 'Topic mastery test', body);
}

// Manual status: the growth-stage chip plus the four statuses, set directly
// by the parent (e.g. after an offline check). Parent view only.
function statusControl(t, student, unlocked) {
  const status = store.statusOf(student.id, t.id);
  const wrap = el(`<div class="flex flex-wrap items-center gap-2 mb-3">
    ${growthChip(stageForStatus(status, unlocked), MASTERY[status].label)}
    <span class="text-xs text-ink-faint">Set status:</span>
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Set status"></div>
  </div>`);
  const opts = wrap.querySelector('[role="group"]');
  Object.entries(MASTERY).forEach(([k, v]) => {
    const on = status === k;
    const b = el(`<button class="px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${on ? 'text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line hover:border-ink-faint/40'}" ${on ? `style="background:${esc(v.color)}" aria-pressed="true"` : 'aria-pressed="false"'} title="Set status to ${esc(v.label.toLowerCase())}">${esc(v.label)}</button>`);
    b.onclick = () => { if (on) return; store.setStatus(student.id, t.id, k); toast(`Marked as ${v.label.toLowerCase()}`, k === 'mastered' ? 'success' : 'default'); };
    opts.appendChild(b);
  });
  return wrap;
}

function sectionCheckSection(t, student) {
  const meta = subjectMeta(t.subject);
  const sec = sectionForTopic(t);
  const body = el(`<div></div>`);
  if (!sec) {
    body.appendChild(el(`<p class="text-sm text-ink-faint">This topic isn't part of a testable section.</p>`));
    return section('clipboard-check', 'Section check', body);
  }
  const stats = student ? topicsMasteryStats(student.id, sec.topics) : { mastered: 0, total: sec.topics.length };
  const last = student ? store.lastSectionTest(student.id, sec.id) : null;
  const passed = !!(last && last.passed);
  const ready = student ? sectionTestReady(student.id, sec) : false;

  body.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed mb-1">Part of <span class="font-600 text-ink">${esc(sec.domain)} · Age ${esc(sec.age)}</span> (${esc(countLabel(sec.topics.length, 'topic'))}).</p>`));
  body.appendChild(el(`<p class="text-xs text-ink-faint mb-3">${passed && last.mode === 'observed'
    ? 'Section passed by observation: every topic in it was mastered.'
    : passed
    ? `Section check passed with ${esc(last.pct)}%.`
    : ready
      ? `All topics mastered — take the section check to unlock the next section. Needs 90%+.`
      : `Master every topic in this section (by test or by observation) to unlock the section check. Mastering the last one by observation passes the section.`}</p>`));

  if (student) {
    body.appendChild(el(`<div class="flex items-center gap-2 mb-3">
      <div class="h-1.5 rounded-full bg-paper-line overflow-hidden flex-1"><div class="mbar h-full rounded-full" style="width:${esc(Math.round((stats.mastered/(stats.total||1))*100))}%;background:${esc(meta.color)}"></div></div>
      <span class="text-[11px] text-ink-faint shrink-0">${esc(formatCount(stats.mastered))}/${esc(countLabel(stats.total, 'topic'))}</span>
    </div>`));
  }

  const canTake = passed || ready;
  const btn = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${!canTake ? 'bg-paper border border-paper-line text-ink-faint cursor-not-allowed' : passed ? 'bg-paper border border-paper-line text-ink-soft hover:border-brand/40' : 'text-white'} font-medium text-sm transition-colors" ${canTake && !passed ? `style="background:${esc(meta.color)}"` : ''} ${!canTake ? 'disabled' : ''}>
    <i data-lucide="${!canTake ? 'lock' : 'clipboard-check'}" class="w-4 h-4"></i>${passed ? 'Retake section check' : !canTake ? 'Locked until topics mastered' : 'Take section check'}</button>`);
  if (canTake) btn.onclick = () => { if (!student) { toast('Add a student first', 'error'); return; } openMasteryTest(sec.subject, sec); };
  body.appendChild(canTake ? gateAi(btn, { capability: 'test' }) : btn);
  return section('clipboard-check', 'Section check', body);
}

function sectionRecordingsSection(t, student) {
  const sec = sectionForTopic(t);
  const body = el(`<div></div>`);
  if (!sec) { body.appendChild(el(`<p class="text-sm text-ink-faint">No section for this topic.</p>`)); return section('mic', 'Section recordings', body); }
  if (!student) { body.appendChild(el(`<p class="text-sm text-ink-faint">Add a student to record.</p>`)); return section('mic', 'Section recordings', body); }

  const recs = store.recordingsFor(student.id, { sectionId: sec.id });
  body.appendChild(el(`<p class="text-xs text-ink-soft mb-3">Voice recordings for <span class="font-600 text-ink">${esc(sec.domain)} · Age ${esc(sec.age)}</span> — stored together for the whole section.</p>`));
  if (recs.length === 0) {
    body.appendChild(el(`<p class="text-sm text-ink-faint mb-3">No recordings yet for this section.</p>`));
  } else {
    const list = el(`<div class="space-y-2.5 mb-3"></div>`);
    recs.slice(0, 4).forEach(r => list.appendChild(recordingItem(r)));
    body.appendChild(list);
  }
  const btn = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#a4473a] hover:bg-[#86372c] text-white font-medium text-sm transition-colors"><i data-lucide="mic" class="w-4 h-4"></i>Record for this section</button>`);
  btn.onclick = () => openRecorder(student.id, null, sec);
  body.appendChild(btn);
  return section('mic', 'Section recordings', body);
}

function recordingItem(r) {
  const item = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <div class="flex items-center gap-2 text-xs mb-1">
      <span class="flex items-center gap-1 font-600 text-[#a4473a]"><i data-lucide="mic" class="w-3.5 h-3.5"></i>Recording</span>
      <span class="text-ink-faint ml-auto">${esc(fmtDateTime(r.createdAt))}</span>
    </div>
    ${r.title ? `<p class="font-600 text-sm">${esc(r.title)}</p>` : ''}
    ${r.topicName ? `<p class="text-[11px] text-ink-faint mt-0.5">on ${esc(r.topicName)}</p>` : ''}
  </div>`);
  if (r.audioPath) item.appendChild(audioPlayer(r.audioPath, r.duration));
  return item;
}

function connectionsSection(t, student, navigate) {
  const d = getData();
  const meta = subjectMeta(t.subject);
  const prereqs = d.prereqsOf.get(t.id) || [];
  const unlocks = d.unlocksOf.get(t.id) || [];
  const body = el(`<div></div>`);

  if (!prereqs.length && !unlocks.length) {
    body.appendChild(el(`<p class="text-sm text-ink-faint">This is a standalone topic — nothing needs to come before it, and it isn't a prerequisite for other topics.</p>`));
    return section('git-branch', 'How this connects', body);
  }

  // Plain-language intro so the flow is obvious.
  body.appendChild(el(`<p class="text-xs text-ink-soft leading-relaxed mb-3">Learning builds from the bottom up: master what's <span class="font-600" style="color:${esc(meta.color)}">below</span> first, then <span class="font-600 text-ink">this topic</span>, which then opens up what's <span class="font-600" style="color:${esc(meta.color)}">above</span>.</p>`));

  const flow = el(`<div class="relative"></div>`);

  const topicRow = (p, role) => {
    const topic = d.byId.get(p.id);
    if (!topic) return null;
    const st = student ? store.statusOf(student.id, p.id) : 'none';
    const mastered = st === 'mastered';
    const row = el(`<button class="w-full min-w-0 text-left flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper hover:border-brand/40 hover:bg-brand-light/30 transition-colors group">
      ${growthIcon(stageForStatus(st, student ? isUnlocked(student.id, p.id) : false), 26)}
      <span class="flex-1 min-w-0">
        <span class="block text-sm text-ink group-hover:text-brand-dark leading-snug truncate">${esc(topic.name)}</span>
        <span class="flex items-center gap-1.5 mt-0.5">
          ${p.strength === 'hard'
            ? '<span class="text-[10px] font-600 text-[#a4473a] uppercase tracking-wide">Required</span>'
            : '<span class="text-[10px] font-medium text-ink-faint uppercase tracking-wide">Helpful</span>'}
          <span class="text-[10px] text-ink-faint">· ${esc(MASTERY[st].label)}</span>
        </span>
        ${p.reason ? `<span class="block text-[11px] text-ink-faint clamp-2 leading-snug mt-1">${esc(p.reason)}</span>` : ''}
      </span>
      <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 group-hover:text-brand-dark"></i>
    </button>`);
    row.onclick = () => navigate('topic', { id: p.id });
    return row;
  };

  // 1) Prerequisites ("comes before")
  if (prereqs.length) {
    flow.appendChild(el(`<p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="arrow-down-to-line" class="w-3.5 h-3.5"></i>Comes before · master these first</p>`));
    const list = el(`<div class="space-y-1.5"></div>`);
    prereqs.slice(0, 8).forEach(p => { const r = topicRow(p, 'pre'); if (r) list.appendChild(r); });
    if (prereqs.length > 8) list.appendChild(el(`<p class="text-xs text-ink-faint px-1">+${esc(prereqs.length - 8)} more</p>`));
    flow.appendChild(list);
    // connector arrow down into this topic
    flow.appendChild(el(`<div class="flex justify-center py-1.5"><i data-lucide="arrow-down" class="w-5 h-5" style="color:${esc(meta.color)}"></i></div>`));
  }

  // 2) This topic (the anchor)
  flow.appendChild(el(`<div class="rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-white min-w-0" style="background:${esc(meta.color)}">
    <i data-lucide="${esc(meta.icon)}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1 min-w-0"><span class="block text-[10px] uppercase tracking-wide opacity-80">You are here</span><span class="block text-sm font-600 leading-snug truncate">${esc(t.name)}</span></span>
  </div>`));

  // 3) Unlocks ("comes after")
  if (unlocks.length) {
    flow.appendChild(el(`<div class="flex justify-center py-1.5"><i data-lucide="arrow-down" class="w-5 h-5" style="color:${esc(meta.color)}"></i></div>`));
    flow.appendChild(el(`<p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="arrow-up-from-line" class="w-3.5 h-3.5"></i>Leads to · unlocks these next</p>`));
    const list = el(`<div class="space-y-1.5"></div>`);
    unlocks.slice(0, 8).forEach(p => { const r = topicRow(p, 'post'); if (r) list.appendChild(r); });
    if (unlocks.length > 8) list.appendChild(el(`<p class="text-xs text-ink-faint px-1">+${esc(unlocks.length - 8)} more</p>`));
    flow.appendChild(list);
  }

  body.appendChild(flow);
  return section('git-branch', 'How this connects', body);
}

function referenceSection(t) {
  const body = el(`<div class="space-y-2.5"></div>`);
  body.appendChild(el(`<p class="text-xs font-600 uppercase tracking-wide text-ink-faint">Read & explore</p>`));
  referenceLinks(t).forEach(l => body.appendChild(linkRow(l)));
  body.appendChild(el(`<p class="text-xs font-600 uppercase tracking-wide text-ink-faint pt-2">Watch</p>`));
  videoLinks(t).forEach(l => body.appendChild(linkRow(l)));

  if (t.standards && t.standards.length) {
    body.appendChild(el(`<div class="pt-2 border-t border-paper-line mt-2"><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1.5">Aligned standards</p><div class="flex flex-wrap gap-1.5">${t.standards.map(s => `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-paper border border-paper-line text-ink-faint">${esc(s)}</span>`).join('')}</div></div>`));
  }
  return section('book-open-check', 'Reference materials', body);
}

function linkRow(l) {
  return el(`<a href="${esc(l.url)}" target="_blank" rel="noopener" class="flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors group min-w-0">
    <i data-lucide="${esc(l.icon)}" class="w-4 h-4 shrink-0 text-ink-soft group-hover:text-brand-dark"></i>
    <span class="text-sm flex-1 min-w-0 break-words">${esc(l.label)}</span>
    <i data-lucide="external-link" class="w-3.5 h-3.5 shrink-0 text-ink-faint"></i>
  </a>`);
}

function activitiesSection(t) {
  const body = el(`<div class="space-y-4"></div>`);
  const ai = store.aiAvailable('activity');
  const mk = (title, icon, items, kind) => {
    const wrap = el(`<div><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="${esc(icon)}" class="w-3.5 h-3.5"></i>${esc(title)}</p><div class="grid sm:grid-cols-2 gap-2.5"></div></div>`);
    const g = wrap.querySelector('div.grid');
    items.forEach(a => {
      const card = el(`<button class="min-w-0 text-left rounded-xl border border-paper-line bg-paper p-3 card-hover group">
        <div class="flex items-center gap-2 mb-1 min-w-0"><i data-lucide="${esc(a.icon)}" class="w-4 h-4 shrink-0 text-brand-dark"></i><p class="font-600 text-sm flex-1 min-w-0 break-words">${esc(a.title)}</p><i data-lucide="arrow-up-right" class="w-3.5 h-3.5 shrink-0 text-ink-faint group-hover:text-brand-dark"></i></div>
        <p class="text-xs text-ink-soft leading-relaxed clamp-3">${esc(a.body)}</p>
        <span class="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-dark"><i data-lucide="list-ordered" class="w-3 h-3"></i>Get instructions</span>
      </button>`);
      card.onclick = () => openActivityDetail(t, a, kind);
      if (ai) { g.appendChild(card); return; }
      // Without a provider the idea itself still helps; only new instructions need AI,
      // so instructions already in the cache still open.
      const idea = el(`<div class="min-w-0 rounded-xl border border-paper-line bg-paper p-3">
        <div class="flex items-center gap-2 mb-1 min-w-0"><i data-lucide="${esc(a.icon)}" class="w-4 h-4 shrink-0 text-brand-dark"></i><p class="font-600 text-sm flex-1 min-w-0 break-words">${esc(a.title)}</p></div>
        <p class="text-xs text-ink-soft leading-relaxed mb-2">${esc(a.body)}</p>
      </div>`);
      idea.appendChild(aiUnavailableChip('activity'));
      g.appendChild(gateAi(card, { capability: 'activity', cachedKey: activityCacheKey(t, a, kind), fallback: idea }));
    });
    return wrap;
  };
  body.appendChild(mk('Hands-on activities', 'hand', activityIdeas(t), 'activity'));
  body.appendChild(mk('Games to play', 'gamepad-2', gameIdeas(t), 'game'));
  return section('sparkles', 'Activities & games', body);
}

function aiSection(t) {
  const body = el(`<div></div>`);
  const btns = el(`<div class="flex flex-wrap gap-2 mb-1">
    <button id="explain" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"><i data-lucide="wand-2" class="w-4 h-4"></i>Explain simply</button>
    <button id="quiz" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-paper border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors"><i data-lucide="list-checks" class="w-4 h-4"></i>Make a mini-quiz</button>
  </div>`);
  const out = el(`<div class="mt-3"></div>`);
  // Each helper has its own capability; one chip stands in when neither is on.
  if (!store.aiAvailable('explain')) btns.querySelector('#explain').remove();
  if (!store.aiAvailable('quiz')) btns.querySelector('#quiz').remove();
  body.appendChild(gateAi(btns, { capability: ['explain', 'quiz'] }));
  body.appendChild(out);

  const run = async (fn, label) => {
    out.innerHTML = '';
    const loading = el(`<div class="flex items-center gap-2 text-sm text-ink-soft py-2"><div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>${esc(label)}</div>`);
    out.appendChild(loading);
    try {
      const text = await fn(t);
      if (!String(text ?? '').trim()) throw new Error('AI provider returned an empty response');
      out.innerHTML = `<div class="ai-prose text-sm text-ink-soft bg-paper border border-paper-line rounded-xl p-4 [overflow-wrap:anywhere] overflow-x-auto">${analysisHtml(text)}</div>`;
    } catch (e) {
      out.innerHTML = '';
      out.appendChild(aiErrorBlock(e, () => run(fn, label), { compact: true }));
    }
    refreshIcons();
  };
  const explain = btns.querySelector('#explain');
  const quiz = btns.querySelector('#quiz');
  if (explain) explain.onclick = () => run(aiExplain, 'Writing a kid-friendly explanation\u2026');
  if (quiz) quiz.onclick = () => run(aiQuiz, 'Building a quick quiz\u2026');
  return section('bot', 'AI teaching helper', body);
}

function recordsSection(t, student, navigate) {
  const body = el(`<div></div>`);
  if (!student) {
    body.appendChild(el(`<p class="text-sm text-ink-faint">Add a student to keep records.</p>`));
    return section('notebook-pen', 'Records for this topic', body);
  }
  const recs = store.recordsFor(student.id, t.id);
  if (recs.length === 0) {
    body.appendChild(el(`<p class="text-sm text-ink-faint">No records yet — log an observation, question or discussion.</p>`));
  } else {
    const list = el(`<div class="space-y-2.5"></div>`);
    recs.slice(0, 5).forEach(r => list.appendChild(recordItem(r)));
    body.appendChild(list);
  }
  const sec = section('notebook-pen', 'Records for this topic', body,
    `<span class="flex items-center gap-3">
      <button id="recrec" class="text-sm font-medium text-[#a4473a] flex items-center gap-1"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
      <button id="addrec" class="text-sm font-medium text-brand-dark flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i>Add</button>
    </span>`);
  sec.querySelector('#addrec').onclick = () => openRecordForm(student.id, t);
  sec.querySelector('#recrec').onclick = () => openRecorder(student.id, t);
  return sec;
}

function recordItem(r) {
  const typeMeta = {
    observation: { icon: 'eye', label: 'Observation', color: '#2f6285' },
    question: { icon: 'help-circle', label: 'Question', color: '#8a6412' },
    discussion: { icon: 'messages-square', label: 'Discussion', color: '#5b4a86' },
    assessment: { icon: 'clipboard-check', label: 'Assessment', color: '#3f6b3b' },
    recording: { icon: 'mic', label: 'Recording', color: '#a4473a' },
  }[r.type] || { icon: 'sticky-note', label: 'Note', color: '#6f665a' };
  const item = el(`<div class="rounded-xl border border-paper-line bg-paper p-3 min-w-0">
    <div class="flex flex-wrap items-center gap-2 mb-1 text-xs">
      <span class="flex items-center gap-1 font-600" style="color:${esc(typeMeta.color)}"><i data-lucide="${esc(typeMeta.icon)}" class="w-3.5 h-3.5"></i>${esc(typeMeta.label)}</span>
      ${r.rating ? `<span class="flex items-center gap-0.5 text-ink-faint">${ratingStars(r.rating)}</span>` : ''}
      <span class="text-ink-faint ml-auto">${esc(fmtDateTime(r.createdAt))}</span>
    </div>
    ${r.title ? `<p class="font-600 text-sm break-words [overflow-wrap:anywhere]">${esc(r.title)}</p>` : ''}
    ${r.note ? `<p class="text-sm text-ink-soft mt-0.5 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">${esc(r.note)}</p>` : ''}
  </div>`);
  if (r.audioPath) item.appendChild(audioPlayer(r.audioPath, r.duration));
  return item;
}


// A topic id the curriculum does not have. If a learner's data mentions it, a
// taxonomy update retired it: say so, with the name the data kept, and point
// to Records, where what was recorded for it is still listed.
function missingTopic(id, navigate) {
  // The active learner's data first, then the others in roster order.
  const active = store.activeStudent();
  const learners = [active, ...store.get().students.filter(s => s !== active)].filter(Boolean);
  const holder = learners.find(s => retiredTopics(store.get(), s.id, isCurrentTopic).some(r => r.id === id));
  const retired = holder && retiredTopics(store.get(), holder.id, isCurrentTopic).find(r => r.id === id);
  if (!retired) return el(`<p class="text-ink-soft">Topic not found. It may have been removed from the curriculum in an update.</p>`);
  const box = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 max-w-xl">
    <p class="text-xs text-ink-faint flex items-center gap-1.5 mb-1"><i data-lucide="archive" class="w-3.5 h-3.5"></i>Archived topic</p>
    <h1 class="font-display text-2xl font-600 break-words">${esc(retiredName(retired))}</h1>
    <p class="text-sm text-ink-soft mt-2 leading-relaxed">This topic is no longer in the curriculum. A curriculum update retired it. What you recorded for it is kept and listed in Records; it no longer counts toward progress or daily choices.</p>
    <button class="mt-4 px-3.5 py-2.5 rounded-xl border border-brand/30 text-sm font-medium text-brand-dark hover:border-brand">Open Records</button>
  </div>`);
  // Records shows one learner: open the one whose data holds this topic.
  box.querySelector('button').onclick = () => {
    if (holder.id !== active?.id) store.setActiveStudent(holder.id);
    navigate('records');
  };
  refreshIcons();
  return box;
}
