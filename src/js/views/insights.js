import { SUBJECTS, getData } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast } from '../ui.js';
import { studentStats, recentActivity, recommendedNext, subjectTestReady } from '../mastery.js';
import { aiFeedback } from '../ai.js';
import { openMasteryTest } from './masterytest.js';
import { fmtDate } from '../ui.js';
import { applySuggestion, dismissSuggestion } from '../adapt.js';

let selSubject = 'Mathematics';

export function renderInsights(params, { navigate }) {
  const active = store.activeStudent();
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  root.appendChild(el(`<div class="mb-5">
    <h1 class="font-display text-2xl sm:text-3xl font-600">Teacher Insights</h1>
    <p class="text-ink-soft text-sm mt-1">Feedback and next steps for <span class="font-600 text-ink">${active?.name || 'your student'}</span>, based on real progress and your records.</p>
  </div>`));

  if (!active) { root.appendChild(el(`<p class="text-ink-soft">Add a student to see insights.</p>`)); return root; }

  // Adaptive suggestions (parent approves/declines) — the platform adapting to the child
  const pending = store.pendingSuggestions(active.id);
  const adaptEntries = Object.entries(store.allAdaptations(active.id));
  if (pending.length || adaptEntries.length) {
    const adCard = el(`<div class="bg-paper-card border border-brand/30 rounded-2xl p-5 mb-5">
      <h2 class="font-600 flex items-center gap-2 mb-1"><i data-lucide="trending-up" class="w-4.5 h-4.5 text-brand-dark"></i>Adaptive suggestions</h2>
      <p class="text-xs text-ink-soft mb-3">Based on how ${active.name} is doing. You decide — nothing changes without your approval.</p>
      <div id="sugs" class="space-y-2"></div>
      <div id="active" class="mt-3"></div>
    </div>`);
    const sugs = adCard.querySelector('#sugs');
    if (pending.length === 0) sugs.appendChild(el(`<p class="text-sm text-ink-faint">No new suggestions right now. Keep going — strong challenge results will surface ideas here.</p>`));
    pending.forEach(s => {
      const row = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
        <p class="text-sm font-600 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-4 h-4 text-brand-dark"></i>Make ${s.domain} harder</p>
        <p class="text-xs text-ink-soft mt-1 leading-relaxed">${s.reason}</p>
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
        const meta = SUBJECTS[subject] || { color: '#8a847a' };
        const chip = el(`<span class="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border" style="border-color:${meta.color}55;color:${meta.color}"><i data-lucide="trending-up" class="w-3 h-3"></i>${domain}<button class="undo ml-0.5"><i data-lucide="x" class="w-3 h-3"></i></button></span>`);
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
  Object.keys(SUBJECTS).forEach(sub => {
    const on = sub === selSubject;
    const meta = SUBJECTS[sub];
    const b = el(`<button class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${on ? 'text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line'}" ${on ? `style="background:${meta.color}"` : ''}>
      <i data-lucide="${meta.icon}" class="w-4 h-4"></i>${sub}</button>`);
    b.onclick = () => { selSubject = sub; navigate('insights'); };
    picker.appendChild(b);
  });
  root.appendChild(picker);

  const st = stats.per[selSubject];
  const meta = SUBJECTS[selSubject];

  // progress summary card
  root.appendChild(el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-5">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="${meta.icon}" class="w-4.5 h-4.5" style="color:${meta.color}"></i>${selSubject}</h2>
      <span class="text-sm font-600" style="color:${meta.color}">${st.pct}% mastered</span>
    </div>
    <div class="h-2.5 rounded-full bg-paper-line overflow-hidden mb-3">
      <div class="mbar h-full rounded-full" style="width:${st.pct}%;background:${meta.color}"></div>
    </div>
    <div class="grid grid-cols-4 gap-2 text-center">
      ${statBox(st.mastered, 'Mastered', '#3f7d5e')}
      ${statBox(st.practicing, 'Practicing', '#3d6b93')}
      ${statBox(st.learning, 'Learning', '#d99b45')}
      ${statBox(st.total - st.mastered - st.inProgress, 'Not started', '#c9c3b8')}
    </div>
  </div>`));

  // Final mastery test card — gated behind all sections passed
  const lastTest = store.lastTest(active.id, selSubject);
  const ready = subjectTestReady(active.id, selSubject);
  const passed = !!(lastTest && lastTest.passed);
  const canTake = ready || passed;
  const testCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-5">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3">
      <span class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${canTake ? 'award' : 'lock'}" class="w-5.5 h-5.5" style="color:${meta.color}"></i></span>
      <div class="flex-1">
        <h2 class="font-600">Final ${selSubject} mastery test</h2>
        <p class="text-sm text-ink-soft leading-relaxed">${canTake
          ? 'The capstone across the whole subject. Needs 90%+ to pass — digital or printable.'
          : 'Unlocks once every section has been passed. Work through the timeline\u2019s topic and section checks first.'}</p>
        ${lastTest ? `<p class="text-xs mt-1.5 flex items-center gap-1.5 ${lastTest.passed ? 'text-brand-dark' : 'text-[#b0603a]'}"><i data-lucide="${lastTest.passed ? 'badge-check' : 'history'}" class="w-3.5 h-3.5"></i>Last: ${lastTest.pct}% ${lastTest.passed ? '· Passed' : '· Try again'} on ${fmtDate(lastTest.createdAt)}</p>` : ''}
      </div>
      <button id="test" class="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${canTake ? 'bg-brand hover:bg-brand-dark text-white' : 'bg-paper border border-paper-line text-ink-faint cursor-not-allowed'} font-medium transition-colors" ${!canTake ? 'disabled' : ''}><i data-lucide="${canTake ? 'file-check-2' : 'lock'}" class="w-4 h-4"></i>${passed ? 'Retake test' : !canTake ? 'Locked' : 'Start test'}</button>
    </div>
  </div>`);
  if (canTake) testCard.querySelector('#test').onclick = () => openMasteryTest(selSubject);
  root.appendChild(testCard);

  // AI feedback card
  const fbCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5 mb-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-600 flex items-center gap-2"><i data-lucide="sparkles" class="w-4.5 h-4.5 text-brand-dark"></i>Progress review</h2>
      <button id="gen" class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"><i data-lucide="wand-2" class="w-4 h-4"></i>Generate</button>
    </div>
    <div id="out"><p class="text-sm text-ink-faint">Generate a personalized review of ${active.name}'s ${selSubject} progress, drawing on your records and their mastery so far.</p></div>
  </div>`);
  const out = fbCard.querySelector('#out');
  fbCard.querySelector('#gen').onclick = async () => {
    out.innerHTML = `<div class="flex items-center gap-2 text-sm text-ink-soft py-3"><div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>Reviewing ${active.name}'s work\u2026</div>`;
    try {
      const d = getData();
      const recentTopics = recentActivity(active.id, 10)
        .filter(a => a.topic.subject === selSubject)
        .map(a => ({ name: a.topic.name, status: a.status }));
      const records = store.recordsFor(active.id)
        .filter(r => !r.topicId || d.byId.get(r.topicId)?.subject === selSubject)
        .map(r => ({ type: r.type, rating: r.rating, note: r.note, title: r.title, topicName: r.topicName }));
      const html = await aiFeedback({
        studentName: active.name, age: store.studentAge(active), subject: selSubject,
        stats: st, recentTopics, records,
      });
      out.innerHTML = `<div class="ai-prose text-sm text-ink-soft">${html}</div>`;
    } catch (e) {
      out.innerHTML = `<p class="text-sm text-[#b0413a]">Couldn't generate feedback right now. Please try again.</p>`;
    }
    refreshIcons();
  };
  root.appendChild(fbCard);

  // recommended next steps
  const nexts = recommendedNext(active.id, 6).filter(n => n.topic.subject === selSubject);
  const recCard = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <h2 class="font-600 flex items-center gap-2 mb-3.5"><i data-lucide="footprints" class="w-4.5 h-4.5 text-brand-dark"></i>Recommended next in ${selSubject}</h2>
    <div id="rec" class="space-y-2"></div>
  </div>`);
  const recList = recCard.querySelector('#rec');
  if (nexts.length === 0) {
    recList.appendChild(el(`<p class="text-sm text-ink-faint">No unlocked ${selSubject} topics waiting — mark some topics mastered on the timeline to open the next ones.</p>`));
  } else {
    nexts.forEach(n => {
      const row = el(`<button class="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="arrow-right" class="w-4 h-4" style="color:${meta.color}"></i></span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-600 truncate">${n.topic.name}</span>
          <span class="block text-xs text-ink-faint">${n.topic.domain} · ages ${n.topic.ageRangeStart}–${n.topic.ageRangeEnd}</span>
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

function statBox(n, label, color) {
  return `<div class="rounded-xl bg-paper py-2.5">
    <p class="text-lg font-700" style="color:${color}">${n}</p>
    <p class="text-[11px] text-ink-faint">${label}</p>
  </div>`;
}
