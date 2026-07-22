import { SUBJECTS, AGES, getData, topicAge } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons } from '../ui.js';
import { subjectByAge, isUnlocked, blockingPrereqs, MASTERY, subjectSections, topicsMasteryStats, sectionTestReady, subjectTestReady } from '../mastery.js';
import { openLesson } from './lesson.js';
import { openMasteryTest } from './masterytest.js';
import { openRecorder } from '../recorder.js';
import { studentStats } from '../mastery.js';

let filterSubject = 'Mathematics';

// Let other views (e.g. the dashboard) preselect which subject the timeline shows.
export function setTimelineSubject(subject) {
  if (SUBJECTS[subject]) filterSubject = subject;
}

export function renderTimeline(params, { navigate }) {
  const state = store.get();
  const active = store.activeStudent();
  const age = store.studentAge(active);

  const root = el(`<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  root.appendChild(el(`
    <div class="mb-5">
      <h1 class="font-display text-2xl sm:text-3xl font-600">Learning Timeline</h1>
      <p class="text-ink-soft text-sm mt-1">A connected, age 5–13 path for <span class="font-600 text-ink">${active?.name || 'your student'}</span>. Pass each section's check to move on to the next.</p>
    </div>`));

  // Subject tabs
  const tabs = el(`<div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-5"></div>`);
  Object.keys(SUBJECTS).forEach(sub => {
    const meta = SUBJECTS[sub];
    const on = sub === filterSubject;
    const b = el(`<button class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${on ? 'text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line hover:border-ink-faint/40'}" ${on ? `style="background:${meta.color}"` : ''}>
      <i data-lucide="${meta.icon}" class="w-4 h-4"></i>${sub}</button>`);
    b.onclick = () => { filterSubject = sub; navigate('timeline'); };
    tabs.appendChild(b);
  });
  root.appendChild(tabs);

  // How it works
  root.appendChild(el(`<div class="rounded-xl bg-brand-light/40 border border-brand/20 p-3.5 mb-5 flex items-start gap-2.5">
    <i data-lucide="route" class="w-4 h-4 text-brand-dark shrink-0 mt-0.5"></i>
    <p class="text-xs text-ink-soft leading-relaxed"><span class="font-600 text-ink">The mastery ladder:</span> pass a <strong>topic</strong> test to master each topic → master every topic in a <strong>section</strong> to unlock its section check → pass every section to unlock the final <strong>subject</strong> test. Each step needs 90%+.</p>
  </div>`));

  // Legend
  root.appendChild(el(`<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-soft mb-6">
    ${Object.entries(MASTERY).map(([k, v]) => `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:${v.color}"></span>${v.label}</span>`).join('')}
    <span class="flex items-center gap-1.5"><i data-lucide="lock" class="w-3.5 h-3.5"></i>Locked until the previous section is passed</span>
  </div>`));

  const meta = SUBJECTS[filterSubject];
  const sections = subjectSections(filterSubject);

  const rail = el(`<div class="relative"></div>`);
  rail.appendChild(el(`<div class="hidden sm:block absolute left-[27px] top-2 bottom-2 w-px rail-line"></div>`));

  let prevAge = null;
  // A section is "gated" (locked) if the immediately preceding section in the
  // sequence hasn't been passed yet. First section is always open.
  sections.forEach((sec, idx) => {
    const prevSec = idx > 0 ? sections[idx - 1] : null;
    const prevPassed = !prevSec || !active || store.sectionPassed(active.id, prevSec.id);
    const gated = active ? !prevPassed : false;

    // Age divider marker when age changes
    if (sec.age !== prevAge) {
      prevAge = sec.age;
      const isCurrent = sec.age === age;
      const band = el(`<div class="relative flex gap-4 mb-2 mt-2"></div>`);
      band.appendChild(el(`<div class="hidden sm:flex flex-col items-center shrink-0 w-14 pt-0.5">
        <div class="w-14 h-14 rounded-2xl flex flex-col items-center justify-center ${isCurrent ? 'text-white' : 'bg-paper-card border border-paper-line text-ink-soft'}" ${isCurrent ? `style="background:${meta.color}"` : ''}>
          <span class="text-[10px] uppercase tracking-wide opacity-70">Age</span>
          <span class="text-lg font-700 leading-none">${sec.age}</span>
        </div>
      </div>`));
      band.appendChild(el(`<div class="flex-1 flex items-center">
        <span class="sm:hidden px-2.5 py-1 rounded-full text-xs font-600 ${isCurrent ? 'text-white' : 'bg-paper-card border border-paper-line text-ink-soft'}" ${isCurrent ? `style="background:${meta.color}"` : ''}>Age ${sec.age}</span>
        ${isCurrent ? '<span class="text-xs text-brand-dark font-medium sm:ml-0 ml-2">Current age</span>' : ''}
      </div>`));
      rail.appendChild(band);
    }

    rail.appendChild(sectionBlock(sec, active, navigate, meta, gated));
  });

  root.appendChild(rail);

  // Capstone final mastery test — unlocked only when every section is passed
  if (active) {
    const ready = subjectTestReady(active.id, filterSubject);
    const lastSubj = store.lastTest(active.id, filterSubject);
    const passed = !!(lastSubj && lastSubj.passed);
    const banner = el(`<div class="mt-4 rounded-2xl border-2 border-dashed p-5 flex flex-col sm:flex-row sm:items-center gap-3 ${!ready && !passed ? 'node-lock' : ''}" style="border-color:${meta.color}55;background:${meta.color}0d">
      <span class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background:${meta.color}"><i data-lucide="${!ready && !passed ? 'lock' : 'award'}" class="w-6 h-6 text-white"></i></span>
      <div class="flex-1">
        <p class="font-600 flex items-center gap-2">Final ${filterSubject} mastery test ${passed ? `<span class="text-[11px] font-medium px-1.5 py-0.5 rounded-full text-white" style="background:${meta.color}">Passed ${lastSubj.pct}%</span>` : ''}</p>
        <p class="text-sm text-ink-soft leading-relaxed">${passed
          ? 'Subject mastered! You can retake the capstone or print a certificate anytime.'
          : ready
            ? 'Every section is passed — take the capstone to certify mastery of the whole subject. Needs 90%+.'
            : 'Unlocks once every section above has been passed. This is the final capstone for the subject.'}</p>
      </div>
      <button id="capstone" class="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${!ready && !passed ? 'bg-paper border border-paper-line text-ink-faint cursor-not-allowed' : 'text-white'} font-medium transition-opacity hover:opacity-90" ${(ready || passed) ? `style="background:${meta.color}"` : ''} ${!ready && !passed ? 'disabled' : ''}><i data-lucide="${!ready && !passed ? 'lock' : 'file-check-2'}" class="w-4 h-4"></i>${passed ? 'Retake capstone' : !ready ? 'Locked' : 'Take the test'}</button>
    </div>`);
    if (ready || passed) banner.querySelector('#capstone').onclick = () => openMasteryTest(filterSubject);
    root.appendChild(banner);
  }

  refreshIcons();
  return root;
}

function sectionBlock(sec, active, navigate, meta, gated) {
  const d = getData();
  const stats = active ? topicsMasteryStats(active.id, sec.topics) : { mastered: 0, total: sec.topics.length, pct: 0 };
  const lastTest = active ? store.lastSectionTest(active.id, sec.id) : null;
  const passed = !!(lastTest && lastTest.passed);
  const allMastered = stats.mastered === stats.total && stats.total > 0;

  const band = el(`<div class="relative flex gap-4 mb-3"></div>`);
  // connector dot on rail
  band.appendChild(el(`<div class="hidden sm:flex justify-center shrink-0 w-14 pt-4">
    <span class="w-3.5 h-3.5 rounded-full border-2 ${passed ? 'border-transparent' : 'bg-paper border-paper-line'}" ${passed ? `style="background:${meta.color}"` : ''}></span>
  </div>`));

  const col = el(`<div class="flex-1 min-w-0"></div>`);
  const cardBorder = passed ? 'border-brand/40' : gated ? 'border-paper-line' : 'border-paper-line';
  const wrap = el(`<div class="rounded-2xl border ${cardBorder} bg-paper-card overflow-hidden ${gated ? 'node-lock' : ''}"></div>`);

  // Section header
  const header = el(`<div class="p-4 ${gated ? '' : 'cursor-pointer'} flex items-start gap-3">
    <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18">
      <i data-lucide="${gated ? 'lock' : (passed ? 'check-circle-2' : 'book-marked')}" class="w-4.5 h-4.5" style="color:${meta.color}"></i>
    </span>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <p class="font-600">${sec.domain}</p>
        <span class="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-paper border border-paper-line text-ink-faint">Age ${sec.age}</span>
        ${passed ? `<span class="text-[11px] font-medium px-1.5 py-0.5 rounded-full text-white" style="background:${meta.color}">Section passed</span>` : ''}
      </div>
      <p class="text-xs text-ink-soft mt-1 leading-relaxed clamp-2">${sec.summary || sec.topics.length + ' topics to learn and master.'}</p>
      <div class="flex items-center gap-2 mt-2">
        <div class="h-1.5 rounded-full bg-paper-line overflow-hidden flex-1 max-w-[160px]">
          <div class="mbar h-full rounded-full" style="width:${stats.pct}%;background:${meta.color}"></div>
        </div>
        <span class="text-[11px] text-ink-faint">${stats.mastered}/${stats.total} mastered</span>
      </div>
    </div>
    ${!gated ? '<i data-lucide="chevron-down" class="toggle w-4 h-4 text-ink-faint shrink-0 mt-1 transition-transform"></i>' : ''}
  </div>`);
  wrap.appendChild(header);

  if (gated) {
    wrap.appendChild(el(`<div class="px-4 pb-4 -mt-1"><p class="text-xs text-[#b0603a] flex items-center gap-1.5"><i data-lucide="lock" class="w-3.5 h-3.5"></i>Pass the previous section's check to unlock this.</p></div>`));
    col.appendChild(wrap);
    band.appendChild(col);
    return band;
  }

  // Expandable body
  const bodyBox = el(`<div class="hidden border-t border-paper-line"></div>`);
  const grid = el(`<div class="grid sm:grid-cols-2 gap-2.5 p-4"></div>`);
  sec.topics.forEach(t => grid.appendChild(topicCard(t, active, navigate, meta)));
  bodyBox.appendChild(grid);

  // Section check footer — unlocked only when all topics are mastered
  const ready = active ? sectionTestReady(active.id, sec) : false;
  const canTake = passed || ready;
  const testRow = el(`<div class="px-4 pb-4 flex flex-col sm:flex-row sm:items-center gap-2.5 border-t border-paper-line pt-4">
    <div class="flex-1">
      <p class="text-sm font-600 flex items-center gap-1.5"><i data-lucide="${canTake ? 'clipboard-check' : 'lock'}" class="w-4 h-4" style="color:${meta.color}"></i>Section check</p>
      <p class="text-xs text-ink-soft mt-0.5">${passed
        ? `Passed with ${lastTest.pct}%. Retake anytime.`
        : ready
          ? 'All topics mastered — pass this to unlock the next section.'
          : `Master all ${stats.total} topics above (pass each topic test) to unlock this. ${stats.mastered}/${stats.total} done.`}</p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <button class="rec flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#b0413a]/40 text-[#b0413a] font-medium text-sm hover:bg-[#b0413a]/5 transition-colors" title="Record a conversation for this section"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
      <button class="test flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ${!canTake ? 'bg-paper border border-paper-line text-ink-faint cursor-not-allowed' : passed ? 'bg-paper border border-paper-line text-ink-soft hover:border-brand/40' : 'text-white'} font-medium text-sm transition-colors" ${canTake && !passed ? `style="background:${meta.color}"` : ''} ${!canTake ? 'disabled' : ''}>
        <i data-lucide="${!canTake ? 'lock' : 'file-check-2'}" class="w-4 h-4"></i>${passed ? 'Retake check' : !canTake ? 'Locked' : 'Take section check'}</button>
    </div>
  </div>`);
  if (canTake) testRow.querySelector('.test').onclick = () => openMasteryTest(sec.subject, sec);
  testRow.querySelector('.rec').onclick = () => { if (!active) { return; } openRecorder(active.id, null, sec); };
  bodyBox.appendChild(testRow);
  wrap.appendChild(bodyBox);

  // toggle expand
  header.onclick = () => {
    const open = !bodyBox.classList.contains('hidden');
    bodyBox.classList.toggle('hidden');
    const chev = header.querySelector('.toggle');
    if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
  };

  col.appendChild(wrap);
  band.appendChild(col);
  return band;
}

function topicCard(t, student, navigate, meta) {
  const status = student ? store.statusOf(student.id, t.id) : 'none';
  const unlocked = student ? isUnlocked(student.id, t.id) : true;
  const blocking = student ? blockingPrereqs(student.id, t.id) : [];
  const m = MASTERY[status];
  const d = getData();
  const prereqCount = (d.prereqsOf.get(t.id) || []).length;
  const unlockCount = (d.unlocksOf.get(t.id) || []).length;

  const card = el(`<div class="bg-paper-card border border-paper-line rounded-xl p-3.5 card-hover ${!unlocked ? 'node-lock' : ''}">
    <button class="open text-left w-full">
      <div class="flex items-start gap-2.5">
        <span class="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style="background:${m.color}"></span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="font-600 text-sm leading-snug clamp-2">${t.name}</p>
          </div>
          <p class="text-xs text-ink-faint mt-0.5">${t.domain}</p>
          <p class="text-xs text-ink-soft mt-1.5 clamp-2 leading-relaxed">${t.description || ''}</p>
          <div class="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[11px] text-ink-faint">
            ${!unlocked ? `<span class="flex items-center gap-1 text-[#b0603a] font-medium"><i data-lucide="lock" class="w-3 h-3"></i>${blocking.length} to master first</span>` : `<span class="flex items-center gap-1 font-medium" style="color:${m.color}"><i data-lucide="${statusIcon(status)}" class="w-3 h-3"></i>${m.label}</span>`}
            ${prereqCount ? `<span class="flex items-center gap-1"><i data-lucide="corner-left-down" class="w-3 h-3"></i>${prereqCount} prereq${prereqCount>1?'s':''}</span>` : ''}
            ${unlockCount ? `<span class="flex items-center gap-1"><i data-lucide="corner-right-up" class="w-3 h-3"></i>unlocks ${unlockCount}</span>` : ''}
          </div>
        </div>
      </div>
    </button>
    <div class="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-paper-line">
      <button class="lesson flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="notebook-text" class="w-3.5 h-3.5"></i>Lesson</button>
      <button class="test flex items-center gap-1.5 text-xs font-medium ${status === 'mastered' ? 'text-ink-faint' : ''}" ${status !== 'mastered' ? `style="color:${meta.color}"` : ''}><i data-lucide="${status === 'mastered' ? 'rotate-ccw' : 'file-check-2'}" class="w-3.5 h-3.5"></i>${status === 'mastered' ? 'Retest' : 'Take test'}</button>
      <button class="details flex items-center gap-1 text-xs font-medium text-ink-faint hover:text-ink-soft ml-auto">Details<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
    </div>
  </div>`);
  card.querySelector('.open').onclick = () => navigate('topic', { id: t.id });
  card.querySelector('.details').onclick = () => navigate('topic', { id: t.id });
  card.querySelector('.lesson').onclick = () => openLesson(t);
  card.querySelector('.test').onclick = () => openMasteryTest(t.subject, null, t);
  return card;
}

function statusIcon(status) {
  return { none: 'circle', learning: 'circle-dot', practicing: 'loader', mastered: 'check-circle-2' }[status] || 'circle';
}
