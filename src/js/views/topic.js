import { SUBJECTS, getData } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast, openModal, fmtDateTime } from '../ui.js';
import { isUnlocked, blockingPrereqs, MASTERY, sectionForTopic, topicsMasteryStats, sectionTestReady } from '../mastery.js';
import { openMasteryTest } from './masterytest.js';
import { openChallenge } from './challenge.js';
import { referenceLinks, videoLinks, activityIdeas, gameIdeas } from '../resources.js';
import { openRecordForm } from './records.js';
import { openRecorder, audioPlayer } from '../recorder.js';
import { aiExplain, aiQuiz } from '../ai.js';
import { openLesson, openActivityDetail } from './lesson.js';
import { openPrintables } from './printables.js';
import { recallSectionCard } from './recall.js';

export function renderTopic(params, { navigate }) {
  const d = getData();
  const t = d.byId.get(params.id);
  const active = store.activeStudent();

  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  if (!t) { root.appendChild(el(`<p class="text-ink-soft">Topic not found.</p>`)); return root; }

  const meta = SUBJECTS[t.subject];
  const status = active ? store.statusOf(active.id, t.id) : 'none';
  const unlocked = active ? isUnlocked(active.id, t.id) : true;
  const blocking = active ? blockingPrereqs(active.id, t.id) : [];

  // back + breadcrumb
  const back = el(`<button class="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-4"><i data-lucide="arrow-left" class="w-4 h-4"></i>Back to timeline</button>`);
  back.onclick = () => navigate('timeline');
  root.appendChild(back);

  // Header
  root.appendChild(el(`
    <div class="mb-5">
      <div class="flex items-center gap-2 mb-2.5 text-xs font-medium">
        <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white" style="background:${meta.color}"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5"></i>${t.subject}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">${t.domain}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">Ages ${t.ageRangeStart}–${t.ageRangeEnd}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-faint capitalize">${(t.type||'').toLowerCase()}</span>
      </div>
      <h1 class="font-display text-2xl sm:text-3xl font-600 leading-tight">${t.name}</h1>
      <p class="text-ink-soft mt-2 leading-relaxed">${t.description || ''}</p>
    </div>`));

  // Locked banner
  if (!unlocked) {
    root.appendChild(el(`<div class="rounded-xl border border-[#e6cbae] bg-[#fbf1e6] p-4 mb-5 flex gap-3">
      <i data-lucide="lock" class="w-5 h-5 text-[#b0603a] shrink-0 mt-0.5"></i>
      <div>
        <p class="font-600 text-sm text-[#8a4a20]">Foundations needed first</p>
        <p class="text-sm text-[#8a5a2b] mt-0.5">Master ${blocking.length} prerequisite${blocking.length>1?'s':''} below before starting this topic — this keeps learning solid.</p>
      </div>
    </div>`));
  }

  // Full lesson call-to-action
  const lessonCta = el(`<div class="rounded-2xl border border-brand/30 bg-brand-light/60 p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
    <span class="w-11 h-11 rounded-xl bg-brand flex items-center justify-center shrink-0"><i data-lucide="notebook-text" class="w-5.5 h-5.5 text-white"></i></span>
    <div class="flex-1">
      <p class="font-600">Ready-to-teach lesson</p>
      <p class="text-sm text-ink-soft leading-relaxed">A complete plan with what to say, do, practice and check — usable today with ${active?.name || 'your child'}.</p>
    </div>
    <div class="shrink-0 flex flex-col sm:flex-row gap-2">
      <button id="openlesson" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="book-open-text" class="w-4 h-4"></i>Open full lesson</button>
      <button id="openprint" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper-card border border-brand/30 text-brand-dark font-medium hover:border-brand transition-colors"><i data-lucide="printer" class="w-4 h-4"></i>Print &amp; go</button>
    </div>
  </div>`);
  lessonCta.querySelector('#openlesson').onclick = () => openLesson(t);
  lessonCta.querySelector('#openprint').onclick = () => openPrintables(t);
  root.appendChild(lessonCta);

  // Two column layout
  const grid = el(`<div class="grid lg:grid-cols-3 gap-5"></div>`);
  const mainCol = el(`<div class="lg:col-span-2 space-y-5"></div>`);
  const sideCol = el(`<div class="space-y-5"></div>`);

  // --- Mastery control ---
  mainCol.appendChild(masterySection(t, active));

  // --- Evidence of mastery ---
  if (t.evidence && t.evidence.length) {
    mainCol.appendChild(section('clipboard-check', 'What mastery looks like', el(`
      <ul class="space-y-2">${t.evidence.map(e => `<li class="flex gap-2.5 text-sm text-ink-soft"><i data-lucide="check" class="w-4 h-4 text-brand shrink-0 mt-0.5"></i><span>${e}</span></li>`).join('')}</ul>`)));
  }

  // --- Assessment prompt ---
  if (t.assessmentPrompt) {
    const prompt = t.assessmentPrompt.replace(/\{\{name\}\}/g, active?.name || 'your child');
    mainCol.appendChild(section('help-circle', 'Quick check', el(`<p class="text-sm text-ink-soft leading-relaxed italic">"${prompt}"</p>`)));
  }

  // --- Active recall ---
  mainCol.appendChild(recallSectionCard(t, active));

  // --- AI tools ---
  mainCol.appendChild(aiSection(t, active));

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
  const s = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <div class="flex items-center justify-between mb-3.5">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="${icon}" class="w-4.5 h-4.5 text-brand-dark"></i>${title}</h2>
      <span>${extra}</span>
    </div>
    <div class="body"></div>
  </div>`);
  s.querySelector('.body').appendChild(contentEl);
  return s;
}

function masterySection(t, student) {
  const meta = SUBJECTS[t.subject];
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
      <p class="text-sm text-ink-soft"><span class="font-600 text-ink">Mastered.</span> ${last ? `Passed the topic test with ${last.pct}%.` : 'This topic is marked mastered.'}</p>
    </div>`));
    const chBest = store.challengesFor(student.id, t.id).sort((a,b)=>(b.correct/b.total)-(a.correct/a.total))[0];
    const ch = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm transition-colors mb-2" style="background:${meta.color}"><i data-lucide="zap" class="w-4 h-4"></i>Try the challenge quiz</button>`);
    ch.onclick = () => openChallenge(t);
    body.appendChild(ch);
    body.appendChild(el(`<p class="text-xs text-ink-faint mb-1">A timed, slightly harder stretch to keep them challenged.${chBest ? ` Best: ${chBest.correct}/${chBest.total}.` : ''}</p>`));
  } else {
    body.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed mb-3">Passing this topic's mastery test (${90}%+) marks it <span class="font-600">mastered</span> and counts toward the section check. ${last ? `<span class="text-[#b0603a] font-medium">Last attempt: ${last.pct}%.</span>` : ''}</p>`));
    if (!unlocked) {
      body.appendChild(el(`<p class="text-xs text-[#b0603a] flex items-start gap-1.5 mb-3"><i data-lucide="lock" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>Master ${blocking.length} prerequisite${blocking.length>1?'s':''} first (see Connections) — but you can still test if you're ready.</p>`));
    }
  }

  const btn = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${passed ? 'bg-paper border border-paper-line text-ink-soft hover:border-brand/40' : 'text-white'} font-medium text-sm transition-colors" ${passed ? '' : `style="background:${meta.color}"`}>
    <i data-lucide="file-check-2" class="w-4 h-4"></i>${passed ? 'Retake topic test' : 'Take topic mastery test'}</button>`);
  btn.onclick = () => openMasteryTest(t.subject, null, t);
  body.appendChild(btn);

  // Secondary: manual status (kept for flexibility / offline assessment)
  const details = el(`<details class="mt-3 group">
    <summary class="text-xs text-ink-faint cursor-pointer select-none flex items-center gap-1 list-none"><i data-lucide="chevron-right" class="w-3.5 h-3.5 transition-transform group-open:rotate-90"></i>Set status manually instead</summary>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3"></div>
  </details>`);
  const opts = details.querySelector('div');
  Object.entries(MASTERY).forEach(([k, v]) => {
    const on = status === k;
    const b = el(`<button class="px-2 py-2 rounded-lg border text-xs font-medium transition-all ${on ? 'text-white border-transparent' : 'bg-paper text-ink-soft border-paper-line hover:border-ink-faint/40'}" ${on ? `style="background:${v.color}"` : ''}>${v.label}</button>`);
    b.onclick = () => { store.setStatus(student.id, t.id, k); toast(`Marked as ${v.label.toLowerCase()}`, k === 'mastered' ? 'success' : 'default'); };
    opts.appendChild(b);
  });
  body.appendChild(details);

  return section('target', 'Topic mastery test', body);
}

function sectionCheckSection(t, student) {
  const meta = SUBJECTS[t.subject];
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

  body.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed mb-1">Part of <span class="font-600 text-ink">${sec.domain} · Age ${sec.age}</span> (${sec.topics.length} topics).</p>`));
  body.appendChild(el(`<p class="text-xs text-ink-faint mb-3">${passed
    ? `Section check passed with ${last.pct}%.`
    : ready
      ? `All topics mastered — take the section check to unlock the next section. Needs 90%+.`
      : `Pass the mastery test for every topic in this section to unlock the section check.`}</p>`));

  if (student) {
    body.appendChild(el(`<div class="flex items-center gap-2 mb-3">
      <div class="h-1.5 rounded-full bg-paper-line overflow-hidden flex-1"><div class="mbar h-full rounded-full" style="width:${Math.round((stats.mastered/(stats.total||1))*100)}%;background:${meta.color}"></div></div>
      <span class="text-[11px] text-ink-faint shrink-0">${stats.mastered}/${stats.total} topics</span>
    </div>`));
  }

  const canTake = passed || ready;
  const btn = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${!canTake ? 'bg-paper border border-paper-line text-ink-faint cursor-not-allowed' : passed ? 'bg-paper border border-paper-line text-ink-soft hover:border-brand/40' : 'text-white'} font-medium text-sm transition-colors" ${canTake && !passed ? `style="background:${meta.color}"` : ''} ${!canTake ? 'disabled' : ''}>
    <i data-lucide="${!canTake ? 'lock' : 'clipboard-check'}" class="w-4 h-4"></i>${passed ? 'Retake section check' : !canTake ? 'Locked until topics mastered' : 'Take section check'}</button>`);
  if (canTake) btn.onclick = () => { if (!student) { toast('Add a student first', 'error'); return; } openMasteryTest(sec.subject, sec); };
  body.appendChild(btn);
  return section('clipboard-check', 'Section check', body);
}

function sectionRecordingsSection(t, student) {
  const sec = sectionForTopic(t);
  const body = el(`<div></div>`);
  if (!sec) { body.appendChild(el(`<p class="text-sm text-ink-faint">No section for this topic.</p>`)); return section('mic', 'Section recordings', body); }
  if (!student) { body.appendChild(el(`<p class="text-sm text-ink-faint">Add a student to record.</p>`)); return section('mic', 'Section recordings', body); }

  const recs = store.recordingsFor(student.id, { sectionId: sec.id });
  body.appendChild(el(`<p class="text-xs text-ink-soft mb-3">Voice recordings for <span class="font-600 text-ink">${sec.domain} · Age ${sec.age}</span> — stored together for the whole section.</p>`));
  if (recs.length === 0) {
    body.appendChild(el(`<p class="text-sm text-ink-faint mb-3">No recordings yet for this section.</p>`));
  } else {
    const list = el(`<div class="space-y-2.5 mb-3"></div>`);
    recs.slice(0, 4).forEach(r => list.appendChild(recordingItem(r)));
    body.appendChild(list);
  }
  const btn = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#b0413a] hover:bg-[#963731] text-white font-medium text-sm transition-colors"><i data-lucide="mic" class="w-4 h-4"></i>Record for this section</button>`);
  btn.onclick = () => openRecorder(student.id, null, sec);
  body.appendChild(btn);
  return section('mic', 'Section recordings', body);
}

function recordingItem(r) {
  const item = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <div class="flex items-center gap-2 text-xs mb-1">
      <span class="flex items-center gap-1 font-600 text-[#b0413a]"><i data-lucide="mic" class="w-3.5 h-3.5"></i>Recording</span>
      <span class="text-ink-faint ml-auto">${fmtDateTime(r.createdAt)}</span>
    </div>
    ${r.title ? `<p class="font-600 text-sm">${r.title}</p>` : ''}
    ${r.topicName ? `<p class="text-[11px] text-ink-faint mt-0.5">on ${r.topicName}</p>` : ''}
  </div>`);
  if (r.audioPath) item.appendChild(audioPlayer(r.audioPath, r.duration));
  return item;
}

function connectionsSection(t, student, navigate) {
  const d = getData();
  const meta = SUBJECTS[t.subject];
  const prereqs = d.prereqsOf.get(t.id) || [];
  const unlocks = d.unlocksOf.get(t.id) || [];
  const body = el(`<div></div>`);

  if (!prereqs.length && !unlocks.length) {
    body.appendChild(el(`<p class="text-sm text-ink-faint">This is a standalone topic — nothing needs to come before it, and it isn't a prerequisite for other topics.</p>`));
    return section('git-branch', 'How this connects', body);
  }

  // Plain-language intro so the flow is obvious.
  body.appendChild(el(`<p class="text-xs text-ink-soft leading-relaxed mb-3">Learning builds from the bottom up: master what's <span class="font-600" style="color:${meta.color}">below</span> first, then <span class="font-600 text-ink">this topic</span>, which then opens up what's <span class="font-600" style="color:${meta.color}">above</span>.</p>`));

  const flow = el(`<div class="relative"></div>`);

  const topicRow = (p, role) => {
    const topic = d.byId.get(p.id);
    if (!topic) return null;
    const st = student ? store.statusOf(student.id, p.id) : 'none';
    const mastered = st === 'mastered';
    const row = el(`<button class="w-full text-left flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper hover:border-brand/40 hover:bg-brand-light/30 transition-colors group">
      <span class="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style="background:${mastered ? MASTERY.mastered.color : MASTERY[st].color + '33'}">
        <i data-lucide="${mastered ? 'check' : (role === 'pre' ? 'circle' : 'lock-open')}" class="w-3 h-3 ${mastered ? 'text-white' : 'text-ink-faint'}"></i>
      </span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm text-ink group-hover:text-brand-dark leading-snug truncate">${topic.name}</span>
        <span class="flex items-center gap-1.5 mt-0.5">
          ${p.strength === 'hard'
            ? '<span class="text-[10px] font-600 text-[#b0603a] uppercase tracking-wide">Required</span>'
            : '<span class="text-[10px] font-medium text-ink-faint uppercase tracking-wide">Helpful</span>'}
          <span class="text-[10px] text-ink-faint">· ${MASTERY[st].label}</span>
        </span>
        ${p.reason ? `<span class="block text-[11px] text-ink-faint clamp-2 leading-snug mt-1">${p.reason}</span>` : ''}
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
    if (prereqs.length > 8) list.appendChild(el(`<p class="text-xs text-ink-faint px-1">+${prereqs.length - 8} more</p>`));
    flow.appendChild(list);
    // connector arrow down into this topic
    flow.appendChild(el(`<div class="flex justify-center py-1.5"><i data-lucide="arrow-down" class="w-5 h-5" style="color:${meta.color}"></i></div>`));
  }

  // 2) This topic (the anchor)
  flow.appendChild(el(`<div class="rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-white" style="background:${meta.color}">
    <i data-lucide="${meta.icon}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1 min-w-0"><span class="block text-[10px] uppercase tracking-wide opacity-80">You are here</span><span class="block text-sm font-600 leading-snug truncate">${t.name}</span></span>
  </div>`));

  // 3) Unlocks ("comes after")
  if (unlocks.length) {
    flow.appendChild(el(`<div class="flex justify-center py-1.5"><i data-lucide="arrow-down" class="w-5 h-5" style="color:${meta.color}"></i></div>`));
    flow.appendChild(el(`<p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="arrow-up-from-line" class="w-3.5 h-3.5"></i>Leads to · unlocks these next</p>`));
    const list = el(`<div class="space-y-1.5"></div>`);
    unlocks.slice(0, 8).forEach(p => { const r = topicRow(p, 'post'); if (r) list.appendChild(r); });
    if (unlocks.length > 8) list.appendChild(el(`<p class="text-xs text-ink-faint px-1">+${unlocks.length - 8} more</p>`));
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
    body.appendChild(el(`<div class="pt-2 border-t border-paper-line mt-2"><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1.5">Aligned standards</p><div class="flex flex-wrap gap-1.5">${t.standards.map(s => `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-paper border border-paper-line text-ink-faint">${s}</span>`).join('')}</div></div>`));
  }
  return section('book-open-check', 'Reference materials', body);
}

function linkRow(l) {
  return el(`<a href="${l.url}" target="_blank" rel="noopener" class="flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors group">
    <i data-lucide="${l.icon}" class="w-4 h-4 text-ink-soft group-hover:text-brand-dark"></i>
    <span class="text-sm flex-1">${l.label}</span>
    <i data-lucide="external-link" class="w-3.5 h-3.5 text-ink-faint"></i>
  </a>`);
}

function activitiesSection(t) {
  const body = el(`<div class="space-y-4"></div>`);
  const mk = (title, icon, items, kind) => {
    const wrap = el(`<div><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${title}</p><div class="grid sm:grid-cols-2 gap-2.5"></div></div>`);
    const g = wrap.querySelector('div.grid');
    items.forEach(a => {
      const card = el(`<button class="text-left rounded-xl border border-paper-line bg-paper p-3 card-hover group">
        <div class="flex items-center gap-2 mb-1"><i data-lucide="${a.icon}" class="w-4 h-4 text-brand-dark"></i><p class="font-600 text-sm flex-1">${a.title}</p><i data-lucide="arrow-up-right" class="w-3.5 h-3.5 text-ink-faint group-hover:text-brand-dark"></i></div>
        <p class="text-xs text-ink-soft leading-relaxed clamp-3">${a.body}</p>
        <span class="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-dark"><i data-lucide="list-ordered" class="w-3 h-3"></i>Get instructions</span>
      </button>`);
      card.onclick = () => openActivityDetail(t, a, kind);
      g.appendChild(card);
    });
    return wrap;
  };
  body.appendChild(mk('Hands-on activities', 'hand', activityIdeas(t), 'activity'));
  body.appendChild(mk('Games to play', 'gamepad-2', gameIdeas(t), 'game'));
  return section('sparkles', 'Activities & games', body);
}

function aiSection(t, student) {
  const body = el(`<div></div>`);
  const btns = el(`<div class="flex flex-wrap gap-2 mb-1">
    <button id="explain" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"><i data-lucide="wand-2" class="w-4 h-4"></i>Explain simply</button>
    <button id="quiz" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-paper border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors"><i data-lucide="list-checks" class="w-4 h-4"></i>Make a mini-quiz</button>
  </div>`);
  const out = el(`<div class="mt-3"></div>`);
  body.appendChild(btns);
  body.appendChild(out);

  const run = async (fn, label) => {
    out.innerHTML = '';
    const loading = el(`<div class="flex items-center gap-2 text-sm text-ink-soft py-2"><div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>${label}</div>`);
    out.appendChild(loading);
    try {
      const text = await fn(t, student?.name);
      out.innerHTML = `<div class="ai-prose text-sm text-ink-soft bg-paper border border-paper-line rounded-xl p-4">${text}</div>`;
    } catch (e) {
      out.innerHTML = `<p class="text-sm text-[#b0413a]">Couldn't generate that right now. Please try again.</p>`;
    }
    refreshIcons();
  };
  btns.querySelector('#explain').onclick = () => run(aiExplain, 'Writing a kid-friendly explanation\u2026');
  btns.querySelector('#quiz').onclick = () => run(aiQuiz, 'Building a quick quiz\u2026');
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
      <button id="recrec" class="text-sm font-medium text-[#b0413a] flex items-center gap-1"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
      <button id="addrec" class="text-sm font-medium text-brand-dark flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i>Add</button>
    </span>`);
  sec.querySelector('#addrec').onclick = () => openRecordForm(student.id, t);
  sec.querySelector('#recrec').onclick = () => openRecorder(student.id, t);
  return sec;
}

function recordItem(r) {
  const typeMeta = {
    observation: { icon: 'eye', label: 'Observation', color: '#3d6b93' },
    question: { icon: 'help-circle', label: 'Question', color: '#c08a2e' },
    discussion: { icon: 'messages-square', label: 'Discussion', color: '#7a5a9e' },
    assessment: { icon: 'clipboard-check', label: 'Assessment', color: '#3f7d5e' },
    recording: { icon: 'mic', label: 'Recording', color: '#b0413a' },
  }[r.type] || { icon: 'sticky-note', label: 'Note', color: '#8a847a' };
  const item = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <div class="flex items-center gap-2 mb-1 text-xs">
      <span class="flex items-center gap-1 font-600" style="color:${typeMeta.color}"><i data-lucide="${typeMeta.icon}" class="w-3.5 h-3.5"></i>${typeMeta.label}</span>
      ${r.rating ? `<span class="flex items-center gap-0.5 text-ink-faint">${'\u2605'.repeat(r.rating)}${'\u2606'.repeat(5-r.rating)}</span>` : ''}
      <span class="text-ink-faint ml-auto">${fmtDateTime(r.createdAt)}</span>
    </div>
    ${r.title ? `<p class="font-600 text-sm">${r.title}</p>` : ''}
    ${r.note ? `<p class="text-sm text-ink-soft mt-0.5 leading-relaxed whitespace-pre-wrap">${r.note}</p>` : ''}
  </div>`);
  if (r.audioPath) item.appendChild(audioPlayer(r.audioPath, r.duration));
  return item;
}

export { recordItem };
