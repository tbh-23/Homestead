import { getData, subjectMeta, subjectNames } from '../data.js';
import * as store from '../store.js';
import { el, esc, analysisHtml, refreshIcons, toast } from '../ui.js';
import { studentStats, recentActivity, recommendedNext, subjectTestReady } from '../mastery.js';
import { aiFeedback } from '../ai.js';
import { openMasteryTest } from './masterytest.js';
import { aiErrorBlock, gateAi } from '../ai-status.js';
import { fmtDate } from '../ui.js';
import { applySuggestion, dismissSuggestion } from '../adapt.js';
import { privacyControls, notesIncludedLine } from './recordings.js';
import { modeLabel } from '../observe.js';
import { countLabel } from '../format.js';
import { sectionLabel } from './observation.js';

let selSubject = 'Mathematics';

export function renderInsights(params, { navigate }) {
  const active = store.activeStudent();
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  root.appendChild(el(`<div class="mb-5">
    <h1 class="font-display text-2xl sm:text-3xl font-600">Teacher Insights</h1>
    <p class="text-ink-soft text-sm mt-1">Feedback and next steps for <span class="font-600 text-ink">${esc(active?.name || 'your student')}</span>, based on real progress and your records.</p>
  </div>`));

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to see insights.</p>`)); return root; }

  // Adaptive suggestions (parent approves/declines) — the platform adapting to the child
  const pending = store.pendingSuggestions(active.id);
  const adaptEntries = Object.entries(store.allAdaptations(active.id));
  if (pending.length || adaptEntries.length) {
    const adCard = el(`<div class="bg-paper-card border border-brand/30 rounded-2xl p-5 mb-5">
      <h2 class="font-600 flex items-center gap-2 mb-1"><i data-lucide="trending-up" class="w-4.5 h-4.5 text-brand-dark"></i>Adaptive suggestions</h2>
      <p class="text-xs text-ink-soft mb-3">Based on how ${esc(active.name)} is doing. You decide — nothing changes without your approval.</p>
      <div id="sugs" class="space-y-2"></div>
      <div id="active" class="mt-3"></div>
    </div>`);
    const sugs = adCard.querySelector('#sugs');
    if (pending.length === 0) sugs.appendChild(el(`<p class="text-sm text-ink-faint">No new suggestions right now. Keep going — strong challenge results will surface ideas here.</p>`));
    pending.forEach(s => {
      const row = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
        <p class="text-sm font-600 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-4 h-4 text-brand-dark"></i>Make ${esc(s.domain)} harder</p>
        <p class="text-xs text-ink-soft mt-1 leading-relaxed">${esc(s.reason)}</p>
        <div class="flex gap-2 mt-2.5">
          <button class="approve flex-1 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors">Approve</button>
          <button class="decline flex-1 px-3 py-2 rounded-lg border border-paper-line text-sm font-medium hover:border-ink-faint/40 transition-colors">No thanks</button>
        </div>
      </div>`);
      row.querySelector('.approve').onclick = () => { applySuggestion(active.id, s); toast(`${s.domain} will now be pitched harder`, 'success'); navigate('insights'); };
      row.querySelector('.decline').onclick = () => { dismissSuggestion(active.id, s); navigate('insights'); };
      sugs.appendChild(row);
    });
    const activeWrap = adCard.querySelector('#active');
    if (adaptEntries.length) {
      activeWrap.appendChild(el(`<p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2">Currently harder</p>`));
      const chips = el(`<div class="flex flex-wrap gap-2"></div>`);
      adaptEntries.forEach(([key]) => {
        const [subject, domain] = key.split('|');
        const meta = subjectMeta(subject);
        const chip = el(`<span class="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border" style="border-color:${esc(meta.color)}55;color:${esc(meta.color)}"><i data-lucide="trending-up" class="w-3 h-3"></i>${esc(domain)}<button class="undo ml-0.5"><i data-lucide="x" class="w-3 h-3"></i></button></span>`);
        chip.querySelector('.undo').onclick = () => { store.setAdaptation(active.id, subject, domain, 'standard'); toast(`${domain} back to standard`); navigate('insights'); };
        chips.appendChild(chip);
      });
      activeWrap.appendChild(chips);
    }
    root.appendChild(adCard);
  }

  const stats = studentStats(active.id);

  // subject picker
  const picker = el(`<div class="flex gap-2 overflow-x-auto pb-2 mb-5"></div>`);
  subjectNames().forEach(sub => {
    const on = sub === selSubject;
    const meta = subjectMeta(sub);
    const b = el(`<button class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${on ? 'text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line'}" ${on ? `style="background:${esc(meta.color)}"` : ''}>
      <i data-lucide="${esc(meta.icon)}" class="w-4 h-4"></i>${esc(sub)}</button>`);
    b.onclick = () => { selSubject = sub; navigate('insights'); };
    picker.appendChild(b);
  });
  root.appendChild(picker);

  const st = stats.per[selSubject];
  const meta = subjectMeta(selSubject);

  // progress summary card
  root.appendChild(el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-5">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="${esc(meta.icon)}" class="w-4.5 h-4.5" style="color:${esc(meta.color)}"></i>${esc(selSubject)}</h2>
      <span class="text-sm font-600" style="color:${esc(meta.color)}">${esc(st.pct)}% mastered</span>
    </div>
    <div class="h-2.5 rounded-full bg-paper-line overflow-hidden mb-3">
      <div class="mbar h-full rounded-full" style="width:${esc(st.pct)}%;background:${esc(meta.color)}"></div>
    </div>
    <div class="grid grid-cols-4 gap-2 text-center">
      ${statBox(st.mastered, 'Mastered', '#3f6b3b')}
      ${statBox(st.practicing, 'Practicing', '#2f6285')}
      ${statBox(st.learning, 'Learning', '#8a6412')}
      ${statBox(st.total - st.mastered - st.inProgress, 'Not started', '#d2c6ad')}
    </div>
  </div>`));

  // Final mastery test card — gated behind all sections passed
  const lastTest = store.lastTest(active.id, selSubject);
  const ready = subjectTestReady(active.id, selSubject);
  const passed = !!(lastTest && lastTest.passed);
  const canTake = ready || passed;
  const testCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-5">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3">
      <span class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:${esc(meta.color)}18"><i data-lucide="${canTake ? 'award' : 'lock'}" class="w-5.5 h-5.5" style="color:${esc(meta.color)}"></i></span>
      <div class="flex-1">
        <h2 class="font-600">Final ${esc(selSubject)} mastery test</h2>
        <p class="text-sm text-ink-soft leading-relaxed">${canTake
          ? 'The capstone across the whole subject. Needs 90%+ to pass — digital or printable.'
          : 'Unlocks once every section has been passed. Pass the topic and section checks on the topic pages first.'}</p>
        ${lastTest ? `<p class="text-xs mt-1.5 flex items-center gap-1.5 ${lastTest.passed ? 'text-brand-dark' : 'text-[#a4473a]'}"><i data-lucide="${lastTest.passed ? 'badge-check' : 'history'}" class="w-3.5 h-3.5"></i>Last: ${lastTest.mode === 'observed' ? 'every section mastered' : `${esc(lastTest.pct)}%`} ${lastTest.passed ? '· Passed' : '· Try again'}${modeLabel(lastTest) ? ` · ${esc(modeLabel(lastTest))}` : ''} on ${esc(fmtDate(lastTest.createdAt))}</p>` : ''}
      </div>
      <button id="test" class="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${canTake ? 'bg-brand hover:bg-brand-dark text-white' : 'bg-paper border border-paper-line text-ink-faint cursor-not-allowed'} font-medium transition-colors" ${!canTake ? 'disabled' : ''}><i data-lucide="${canTake ? 'file-check-2' : 'lock'}" class="w-4 h-4"></i>${passed ? 'Retake test' : !canTake ? 'Locked' : 'Start test'}</button>
    </div>
  </div>`);
  if (canTake) testCard.querySelector('#test').onclick = () => openMasteryTest(selSubject);
  const testBtn = testCard.querySelector('#test');
  if (canTake) testBtn.replaceWith(gateAi(testBtn, { capability: 'test' }));
  root.appendChild(testCard);

  // Observation checks (the non-AI path) for this subject
  const observedCard = observedChecksCard(active, selSubject, navigate);
  if (observedCard) root.appendChild(observedCard);

  // AI feedback card
  const fbCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="sparkles" class="w-4.5 h-4.5 text-brand-dark"></i>Progress review</h2>
      <button id="gen" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"><i data-lucide="wand-2" class="w-4 h-4"></i>Generate</button>
    </div>
    <div id="out"><p class="text-sm text-ink-faint">Generate a personalized review of ${esc(active.name)}'s ${esc(selSubject)} progress, drawing on your records and their mastery so far.</p></div>
  </div>`);
  const out = fbCard.querySelector('#out');
  const gen = fbCard.querySelector('#gen');
  const d = getData();
  const subjectRecords = () => store.recordsFor(active.id)
    .filter(r => !r.topicId || d.byId.get(r.topicId)?.subject === selSubject);
  // Records go out as counts and topic names unless the parent opts in here.
  const privacy = privacyControls({ hasNotes: subjectRecords().some(r => (r.note || '').trim()), placement: 'before' });
  if (store.aiAvailable('review')) out.before(privacy);
  gen.onclick = async () => {
    const includeNotes = !!privacy.querySelector('.include-notes')?.checked;
    out.innerHTML = `<div class="flex items-center gap-2 text-sm text-ink-soft py-3"><div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>Reviewing ${esc(active.name)}'s work${includeNotes ? ' (notes included)' : ''}\u2026</div>`;
    try {
      const recentTopics = recentActivity(active.id, 10)
        .filter(a => a.topic.subject === selSubject)
        .map(a => ({ name: a.topic.name, status: a.status }));
      const records = subjectRecords()
        .map(r => ({ type: r.type, rating: r.rating, note: r.note, title: r.title, topicName: r.topicName }));
      const html = await aiFeedback({
        age: store.studentAge(active), subject: selSubject,
        stats: st, recentTopics, records,
        includeNotes,
      });
      out.innerHTML = `<div class="ai-prose text-sm text-ink-soft">${analysisHtml(html)}</div>`;
    } catch (e) {
      out.innerHTML = '';
      if (includeNotes) out.appendChild(notesIncludedLine());
      out.appendChild(aiErrorBlock(e, () => gen.onclick(), { compact: true }));
    }
    refreshIcons();
  };
  gen.replaceWith(gateAi(gen, { capability: 'review' }));
  root.appendChild(fbCard);

  // recommended next steps
  // Rank every subject, then keep this one: a top six across all subjects can
  // leave a smaller subject with nothing to suggest though it has open topics.
  const nexts = recommendedNext(active.id, Infinity).filter(n => n.topic.subject === selSubject).slice(0, 6);
  const recCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <h2 class="font-600 flex items-center gap-2 mb-3.5"><i data-lucide="footprints" class="w-4.5 h-4.5 text-brand-dark"></i>Recommended next in ${esc(selSubject)}</h2>
    <div id="rec" class="space-y-2"></div>
  </div>`);
  const recList = recCard.querySelector('#rec');
  if (nexts.length === 0) {
    recList.appendChild(el(`<p class="text-sm text-ink-faint">No unlocked ${esc(selSubject)} topics waiting — mark some topics mastered from the map or a topic page to open the next ones.</p>`));
  } else {
    nexts.forEach(n => {
      const row = el(`<button class="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${esc(meta.color)}18"><i data-lucide="arrow-right" class="w-4 h-4" style="color:${esc(meta.color)}"></i></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-600 truncate">${esc(n.topic.name)}</span>
          <span class="block text-xs text-ink-faint">${esc(n.topic.domain)} · ages ${esc(n.topic.ageRangeStart)}–${esc(n.topic.ageRangeEnd)}</span>
        </span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint"></i>
      </button>`);
      row.onclick = () => navigate('topic', { id: n.topic.id });
      recList.appendChild(row);
    });
  }
  root.appendChild(recCard);

  refreshIcons();
  return root;
}

// Recent evidence-checklist results in a subject, each labelled "observed".
function observedChecksCard(student, subject, navigate) {
  const d = getData();
  const results = store.observedChecks(student.id, subject);
  if (!results.length) return null;
  const passed = results.filter(t => t.scope === 'topic' && t.passed).length;
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-5">
    <h2 class="font-600 flex items-center gap-2 mb-1"><i data-lucide="eye" class="w-4.5 h-4.5 text-brand-dark"></i>Observation checks</h2>
    <p class="text-xs text-ink-soft mb-3">Mastery you checked by watching, with no quiz. ${esc(countLabel(passed, 'topic'))} mastered this way in ${esc(subject)}.</p>
    <div class="obs-list space-y-1.5"></div>
  </div>`);
  const list = card.querySelector('.obs-list');
  results.slice(0, 6).forEach(t => {
    const topic = t.topicId ? d.byId.get(t.topicId) : null;
    const what = t.scope === 'topic' ? (topic ? topic.name : 'A topic')
      : t.scope === 'section' ? `Section: ${sectionLabel(t.sectionId)}` : `${subject}: every section`;
    const row = el(`<div class="flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper text-sm">
      <i data-lucide="${t.passed ? 'badge-check' : 'circle-dashed'}" class="w-4 h-4 shrink-0 ${t.passed ? 'text-brand-dark' : 'text-[#8a6412]'}"></i>
      <span class="flex-1 min-w-0 truncate">${esc(what)}</span>
      <span class="text-xs text-ink-faint shrink-0">${t.scope === 'topic' ? `${esc(t.score)} of ${esc(t.total)} seen · ` : ''}${esc(modeLabel(t))} · ${esc(fmtDate(t.createdAt))}</span>
    </div>`);
    if (topic) { row.classList.add('cursor-pointer', 'hover:border-brand/40'); row.onclick = () => navigate('topic', { id: topic.id }); }
    list.appendChild(row);
  });
  return card;
}

function statBox(n, label, color) {
  return `<div class="rounded-xl bg-paper py-2.5">
    <p class="text-lg font-700" style="color:${esc(color)}">${esc(n)}</p>
    <p class="text-[11px] text-ink-faint">${esc(label)}</p>
  </div>`;
}
