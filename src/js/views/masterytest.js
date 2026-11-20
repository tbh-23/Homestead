import { getData, subjectMeta } from '../data.js';
import * as store from '../store.js';
import { el, esc, refreshIcons, toast, openModal, fmtDate } from '../ui.js';
import { aiMasteryTest } from '../ai.js';
import { aiErrorBlock } from '../ai-status.js';
import { studentStats } from '../mastery.js';
import { openChallenge } from './challenge.js';
import { award } from '../game.js';
import { isCorrect } from '../grading.js';
import { GROWTH, stageForArea, stageForStatus } from '../meadow.js';
import { countLabel, formatCount } from '../format.js';

const PASS = 90;

// Knowledge-heavy subjects suit an on-screen auto-graded quiz; skill/observation
// subjects suit a printed paper test or hands-on observation.
const DEFAULT_MODE = {
  'Mathematics': 'digital',
  'Science': 'digital',
  'History': 'digital',
  'Computing': 'digital',
  'Learning to Learn': 'digital',
  'Geography': 'digital',
  'English': 'physical',
  'Personal & Social Development': 'physical',
  'Life Skills': 'physical',
};

function pointsOf(q) { return q.points || 1; }

// Scope is decided by args: pass `topic` for a topic test, `section` for a
// section test, or neither for the final subject test.
export async function openMasteryTest(subject, section = null, topic = null) {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  const meta = subjectMeta(subject);
  const label = topic ? `Topic check · ${subject}` : section ? `Section check · ${subject}` : `Final mastery test · ${subject}`;
  const title = topic ? topic.name : section ? section.domain + ' · Age ' + section.age : student.name;
  const icon = topic ? 'target' : section ? 'clipboard-check' : 'award';

  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-start gap-3 z-10">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${icon}" class="w-5 h-5" style="color:${meta.color}"></i></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-faint">${esc(label)}</p>
        <h3 class="font-display text-lg font-600 leading-tight">${esc(title)}</h3>
      </div>
    </div>
    <div id="stage" class="px-5 py-5"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  // A test is in progress while its Submit (digital) or Record result (paper) button is showing.
  const m = openModal(body, {
    wide: true,
    beforeClose: () => !stage.querySelector('#submit, #finish')
      || confirm('Leave this test? Answers so far won\'t be saved.'),
  });

  renderIntro(stage, subject, student, m, section, topic);
  refreshIcons();
}

function topicScope(subject) {
  const d = getData();
  const list = (d.bySubject[subject] || []);
  // Prefer the most central topics for a representative sample.
  return [...list].sort((a, b) => (b.centrality || 0) - (a.centrality || 0))
    .slice(0, 20).map(t => t.name);
}

function renderIntro(stage, subject, student, m, section = null, topic = null) {
  const meta = subjectMeta(subject);
  const isTopic = !!topic;
  const isSection = !isTopic && !!section;
  const stats = studentStats(student.id).per[subject];
  const secStats = isSection ? { total: section.topics.length, mastered: section.topics.filter(t => store.statusOf(student.id, t.id) === 'mastered').length } : null;
  const recommended = DEFAULT_MODE[subject] || 'digital';
  const last = isTopic ? store.lastTopicTest(student.id, topic.id) : isSection ? store.lastSectionTest(student.id, section.id) : store.lastTest(student.id, subject);
  let mode = recommended;
  // Child view: growth words instead of pass marks, percentages and scores.
  const childSafe = store.isChildViewOpen();
  const growthStage = isTopic ? stageForStatus(store.statusOf(student.id, topic.id), true)
    : isSection ? stageForArea(secStats.total ? Math.round(secStats.mastered / secStats.total * 100) : 0, secStats.mastered > 0)
    : stageForArea(stats.pct, stats.mastered + stats.inProgress > 0);
  const growth = GROWTH[growthStage];

  stage.innerHTML = '';
  const wrap = el(`<div class="fade-up">
    ${childSafe ? `<p class="text-sm text-ink-soft leading-relaxed mb-4">A few questions about <span class="font-600 text-ink">${esc(isTopic ? topic.name : isSection ? section.domain : subject)}</span>. Right now it is <span class="font-600" style="color:${growth.color}">${growth.kid.toLowerCase()}</span>. Take your time and do your best.</p>
    ${last ? `<p class="text-xs text-ink-faint mb-4">You tried this before on ${fmtDate(last.createdAt)}.</p>` : ''}` : `<p class="text-sm text-ink-soft leading-relaxed mb-4">${isTopic
      ? `A short check that ${esc(student.name)} has mastered <span class="font-600 text-ink">${esc(topic.name)}</span>. Passing marks this topic mastered. Needs <span class="font-600" style="color:${meta.color}">${PASS}% or more</span> correct.`
      : isSection
      ? `A check that ${esc(student.name)} has mastered <span class="font-600 text-ink">${esc(section.domain)}</span> (age ${esc(section.age)}) before moving on. Passing needs <span class="font-600" style="color:${meta.color}">${PASS}% or more</span> correct.`
      : `A final check that ${esc(student.name)} has truly mastered <span class="font-600 text-ink">${esc(subject)}</span>. Passing needs <span class="font-600" style="color:${meta.color}">${PASS}% or more</span> correct.`}</p>`}

    ${isTopic && topic.description ? `<div class="rounded-xl bg-brand-light/50 border border-brand/20 p-3 mb-4"><p class="text-xs text-ink-soft leading-relaxed">${esc(topic.description)}</p></div>` : ''}
    ${isSection && section.summary ? `<div class="rounded-xl bg-brand-light/50 border border-brand/20 p-3 mb-4"><p class="text-xs text-ink-soft leading-relaxed">${esc(section.summary)}</p></div>` : ''}

    ${last && !childSafe ? `<div class="rounded-xl border ${last.passed ? 'border-brand/30 bg-brand-light/50' : 'border-[#f3b7a8] bg-[#fbecc4]'} p-3 mb-4 flex items-center gap-2.5 text-sm">
      <i data-lucide="${last.passed ? 'badge-check' : 'history'}" class="w-4 h-4 ${last.passed ? 'text-brand-dark' : 'text-[#a4473a]'}"></i>
      <span>Last attempt: <strong>${esc(last.pct)}%</strong> ${last.passed ? '· Passed' : '· Not yet mastered'} <span class="text-ink-faint">on ${fmtDate(last.createdAt)}</span></span>
    </div>` : ''}

    ${!isTopic && !childSafe ? `<div class="rounded-xl border border-paper-line bg-paper p-3.5 mb-4">
      <p class="text-xs text-ink-soft"><span class="font-600">Progress so far:</span> ${isSection
        ? `${formatCount(secStats.mastered)} of ${countLabel(secStats.total, 'topic')} in this section marked mastered.`
        : `${formatCount(stats.mastered)} of ${countLabel(stats.total, 'topic')} marked mastered (${stats.pct}%).`}</p>
    </div>` : ''}

    ${childSafe ? '' : `<p class="text-sm font-600 mb-2">How would you like to give the test?</p>
    <div id="modes" class="grid sm:grid-cols-2 gap-2.5 mb-2"></div>
    <p class="text-xs text-ink-faint mb-5" id="modehint"></p>`}

    <button id="start" class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="${childSafe ? 'sprout' : 'file-check-2'}" class="w-4 h-4"></i>${childSafe ? 'Let\u2019s begin' : 'Create the test'}</button>
  </div>`);
  stage.appendChild(wrap);

  const modesWrap = wrap.querySelector('#modes');
  const hint = wrap.querySelector('#modehint');
  const MODE_INFO = {
    digital: { icon: 'monitor', label: 'On screen', desc: 'Auto-graded instantly', hint: 'Answered here in the app; results are calculated for you.' },
    physical: { icon: 'printer', label: 'On paper / hands-on', desc: 'Print or observe, then grade', hint: 'Print the test (or observe hands-on tasks), then tick what they got right and we\u2019ll score it.' },
  };
  // Child view: no mode chooser (its copy is about grading); use the recommended mode.
  const renderModes = () => {
    if (childSafe) return;
    modesWrap.innerHTML = '';
    ['digital', 'physical'].forEach(k => {
      const info = MODE_INFO[k];
      const on = mode === k;
      const isRec = recommended === k;
      const b = el(`<button class="text-left p-3 rounded-xl border transition-all ${on ? 'border-brand bg-brand-light/50' : 'border-paper-line bg-paper hover:border-ink-faint/40'}">
        <div class="flex items-center gap-2 mb-1">
          <i data-lucide="${info.icon}" class="w-4 h-4 ${on ? 'text-brand-dark' : 'text-ink-soft'}"></i>
          <span class="font-600 text-sm">${info.label}</span>
          ${isRec ? '<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand text-white ml-auto">Recommended</span>' : ''}
        </div>
        <p class="text-xs text-ink-soft">${info.desc}</p>
      </button>`);
      b.onclick = () => { mode = k; renderModes(); hint.textContent = MODE_INFO[mode].hint; };
      modesWrap.appendChild(b);
    });
    refreshIcons();
  };
  renderModes();
  if (hint) hint.textContent = MODE_INFO[mode].hint;

  wrap.querySelector('#start').onclick = async () => {
    stage.innerHTML = '';
    stage.appendChild(loadingBlock(
      isTopic ? `Building a check for ${esc(topic.name)}\u2026` : isSection ? `Building a ${esc(section.domain)} section check\u2026` : `Building a ${subject} mastery test\u2026`,
      'Writing questions and double-checking every answer. This takes a few seconds.'));
    refreshIcons();
    try {
      const level = isTopic
        ? store.adaptationLevel(student.id, subject, topic.domain)
        : isSection ? store.adaptationLevel(student.id, subject, section.domain) : 'standard';
      const test = await aiMasteryTest({
        subject,
        age: isTopic ? (topic.ageRangeStart || store.studentAge(student)) : isSection ? section.age : store.studentAge(student),
        topicNames: isSection ? section.topics.map(t => t.name) : topicScope(subject),
        mode,
        section: isSection ? `${section.domain} (age ${section.age})` : null,
        topic: isTopic ? topic : null,
        level,
      });
      if (!Array.isArray(test.questions) || !test.questions.length) {
        stage.innerHTML = '';
        stage.appendChild(errorBlock(() => renderIntro(stage, subject, student, m, section, topic),
          'The test came back without any questions, so nothing was recorded. Try building the test again.'));
        refreshIcons();
        return;
      }
      test.mode = mode;
      test.subject = subject;
      test.section = section;
      test.topic = isTopic ? topic : null;
      if (mode === 'digital') renderDigital(stage, subject, student, test, m);
      else renderPhysical(stage, subject, student, test, m);
      refreshIcons();
    } catch (e) {
      stage.innerHTML = '';
      stage.appendChild(aiErrorBlock(e, () => renderIntro(stage, subject, student, m, section, topic)));
    }
  };
  refreshIcons();
}

// ---------- DIGITAL (auto-graded) ----------
function renderDigital(stage, subject, student, test, m) {
  const meta = subjectMeta(subject);
  const questions = test.questions || [];
  const answers = new Array(questions.length).fill(null);

  stage.innerHTML = '';
  const wrap = el(`<div class="fade-up">
    <div class="rounded-xl bg-paper border border-paper-line p-3.5 mb-4">
      <p class="text-sm font-600 mb-0.5">${esc(test.title || subject + ' Mastery Test')}</p>
      <p class="text-xs text-ink-soft">${store.isChildViewOpen() ? 'Answer every question. Take your time.' : esc(test.instructions || 'Answer every question. You need 90% to pass.')}</p>
    </div>
    <div id="qs" class="space-y-4"></div>
    <button id="submit" class="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors disabled:opacity-50"><i data-lucide="check-check" class="w-4 h-4"></i>Submit &amp; grade</button>
    <p id="warn" class="text-xs text-[#a4473a] text-center mt-2 hidden">Please answer every question first.</p>
  </div>`);
  const qs = wrap.querySelector('#qs');

  questions.forEach((q, i) => {
    const card = el(`<div class="rounded-xl border border-paper-line bg-paper-card p-4">
      <p class="text-sm font-600 mb-3"><span class="text-ink-faint mr-1.5">${i + 1}.</span>${esc(q.q)}</p>
      <div class="opts space-y-2"></div>
    </div>`);
    const opts = card.querySelector('.opts');
    if (q.type === 'multiple_choice') {
      (q.options || []).forEach((opt, oi) => {
        const b = el(`<button class="w-full text-left px-3 py-2.5 rounded-lg border border-paper-line text-sm hover:border-brand/40 transition-colors flex items-center gap-2.5">
          <span class="w-4 h-4 rounded-full border-2 border-ink-faint/40 shrink-0"></span><span>${esc(opt)}</span></button>`);
        b.onclick = () => { answers[i] = oi; markSelected(opts, b); };
        opts.appendChild(b);
      });
    } else {
      // short_answer typed
      const inp = el(`<input class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" placeholder="Type the answer\u2026" />`);
      inp.oninput = () => { answers[i] = inp.value.trim(); };
      opts.appendChild(inp);
      card.appendChild(el(`<p class="text-[11px] text-ink-faint mt-2">Checked against the correct answer; you can adjust the grade after.</p>`));
    }
    qs.appendChild(card);
  });
  wrap.querySelector('#submit').onclick = () => {
    const unanswered = answers.some(a => a === null || a === '');
    if (unanswered) { wrap.querySelector('#warn').classList.remove('hidden'); return; }
    const graded = gradeDigital(questions, answers);
    recordResult(subject, student, test, graded);
    renderResult(stage, subject, student, test, graded, m, { questions, answers });
  };
  stage.appendChild(wrap);
  refreshIcons();
}

function markSelected(container, chosen) {
  container.querySelectorAll('button').forEach(b => {
    b.classList.remove('border-brand', 'bg-brand-light/50');
    const dot = b.querySelector('span');
    if (dot) { dot.classList.remove('border-brand'); dot.style.background = ''; }
  });
  chosen.classList.add('border-brand', 'bg-brand-light/50');
  const dot = chosen.querySelector('span');
  if (dot) { dot.classList.add('border-brand'); dot.style.background = '#3f6b3b'; }
}

function gradeDigital(questions, answers) {
  let earned = 0, total = 0;
  const perQ = questions.map((q, i) => {
    const pts = pointsOf(q); total += pts;
    const correct = isCorrect(q, answers[i]);
    if (correct) earned += pts;
    return { correct, points: pts };
  });
  return { earned, total, pct: total ? Math.round((earned / total) * 100) : 0, perQ };
}

// ---------- PHYSICAL (print + manual grade) ----------
function renderPhysical(stage, subject, student, test, m) {
  const meta = subjectMeta(subject);
  const questions = test.questions || [];
  const marks = new Array(questions.length).fill(false);
  // Child view: no answer key (on screen or printed) and no live score.
  const childSafe = store.isChildViewOpen();

  stage.innerHTML = '';
  const wrap = el(`<div class="fade-up">
    <div class="rounded-xl bg-paper border border-paper-line p-3.5 mb-4 flex items-start gap-2.5">
      <i data-lucide="info" class="w-4 h-4 text-brand-dark shrink-0 mt-0.5"></i>
      <p class="text-xs text-ink-soft leading-relaxed">${childSafe ? 'Try each one with a grown-up nearby, then check the ones you did.' : esc(test.instructions || 'Print the test for your child, or read the tasks aloud and observe. Then come back and tick each question they got right — we\u2019ll calculate the score.')}</p>
    </div>
    ${childSafe ? '' : `<button id="print" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ink hover:bg-ink-soft text-white font-medium transition-colors mb-5"><i data-lucide="printer" class="w-4 h-4"></i>Print the test &amp; answer key</button>`}

    <p class="text-sm font-600 mb-1">${childSafe ? 'What you tried' : 'Grade it'}</p>
    <p class="text-xs text-ink-faint mb-3">${childSafe ? 'Check each one you did.' : `Tick every question ${esc(student.name)} answered correctly.`}</p>
    <div id="grade" class="space-y-2"></div>

    <div class="mt-4 flex items-center justify-between px-1 ${childSafe ? 'hidden' : ''}">
      <span class="text-sm text-ink-soft">Score</span>
      <span id="live" class="text-sm font-700" style="color:${meta.color}">0%</span>
    </div>
    <button id="finish" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="flag" class="w-4 h-4"></i>Record result</button>
  </div>`);

  const gradeWrap = wrap.querySelector('#grade');
  const live = wrap.querySelector('#live');
  const totalPts = questions.reduce((s, q) => s + pointsOf(q), 0);
  const updateLive = () => {
    const earned = questions.reduce((s, q, i) => s + (marks[i] ? pointsOf(q) : 0), 0);
    const pct = totalPts ? Math.round((earned / totalPts) * 100) : 0;
    live.textContent = pct + '%';
    live.style.color = pct >= PASS ? '#3f6b3b' : '#a4473a';
  };

  questions.forEach((q, i) => {
    const row = el(`<label class="flex items-start gap-3 p-3 rounded-xl border border-paper-line bg-paper-card cursor-pointer">
      <input type="checkbox" class="mt-0.5 w-4 h-4 accent-brand shrink-0" />
      <span class="flex-1 min-w-0">
        <span class="block text-sm"><span class="text-ink-faint mr-1.5">${i + 1}.</span>${esc(q.q)}</span>
        ${childSafe ? '' : `<span class="block text-xs text-ink-faint mt-1"><span class="font-medium">Correct:</span> ${esc(formatAnswer(q))}</span>`}
      </span>
    </label>`);
    row.querySelector('input').onchange = e => { marks[i] = e.target.checked; updateLive(); };
    gradeWrap.appendChild(row);
  });

  if (!childSafe) wrap.querySelector('#print').onclick = () => printTest(subject, student, test);
  wrap.querySelector('#finish').onclick = () => {
    const earned = questions.reduce((s, q, i) => s + (marks[i] ? pointsOf(q) : 0), 0);
    const graded = {
      earned, total: totalPts, pct: totalPts ? Math.round((earned / totalPts) * 100) : 0,
      perQ: questions.map((q, i) => ({ correct: marks[i], points: pointsOf(q) })),
    };
    recordResult(subject, student, test, graded);
    renderResult(stage, subject, student, test, graded, m, null);
  };
  stage.appendChild(wrap);
  updateLive();
  refreshIcons();
}

function formatAnswer(q) {
  if (q.type === 'multiple_choice') return (q.options && q.options[q.answer] != null) ? q.options[q.answer] : '';
  return q.answer || '';
}

// ---------- RESULT ----------
// Side effects of a finished attempt (test record, mastery, practice queue,
// XP). Runs exactly once per attempt; renderResult below is view-only so the
// Review <-> Result round trip never re-saves or re-awards.
function recordResult(subject, student, test, graded) {
  if (test.recorded || !graded.total) return;
  test.recorded = true;
  const passed = graded.pct >= PASS;
  const topic = test.topic || null;
  const isTopic = !!topic;
  const section = test.section || null;
  const isSection = !isTopic && !!section;

  // save result
  store.addTestResult(student.id, {
    scope: isTopic ? 'topic' : isSection ? 'section' : 'subject',
    subject,
    topicId: isTopic ? topic.id : null,
    sectionId: isSection ? section.id : null,
    mode: test.mode, score: graded.earned, total: graded.total,
    pct: graded.pct, passed,
  });

  // Passing a topic test IS what marks the topic mastered.
  if (isTopic && passed) {
    store.setStatus(student.id, topic.id, 'mastered');
  }

  // Queue every missed question for spaced retry, regardless of overall pass/fail —
  // the gap this surfaces is specific to that question, not the whole topic.
  if (graded.perQ && test.questions) {
    test.questions.forEach((q, i) => {
      const pq = graded.perQ[i];
      if (!pq || pq.correct) return;
      store.enqueuePracticeItem(student.id, {
        topicId: isTopic ? topic.id : null,
        subject,
        q: q.q,
        type: q.type,
        options: q.options || null,
        answer: q.answer,
        source: isTopic ? 'topic' : isSection ? 'section' : 'subject',
        sourceLabel: isTopic ? topic.name : isSection ? section.domain : subject,
      });
    });
  }

  // Award XP + badges for a pass (celebration fires after the result renders).
  if (passed) {
    const kind = isTopic ? 'topic' : isSection ? 'section' : 'subject';
    setTimeout(() => award(student.id, kind), 500);
  }
}

function renderResult(stage, subject, student, test, graded, m, digitalReview) {
  const passed = graded.pct >= PASS;
  const topic = test.topic || null;
  const isTopic = !!topic;
  const section = test.section || null;
  const isSection = !isTopic && !!section;

  stage.innerHTML = '';
  if (store.isChildViewOpen()) { renderChildResult(stage, m); return; }
  const wrap = el(`<div class="fade-up text-center py-4">
    <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style="background:${passed ? '#e4eedf' : '#fbecc4'}">
      <i data-lucide="${passed ? 'party-popper' : 'refresh-cw'}" class="w-9 h-9" style="color:${passed ? '#3f6b3b' : '#a4473a'}"></i>
    </div>
    <p class="text-4xl font-700 font-display" style="color:${passed ? '#3f6b3b' : '#a4473a'}">${graded.pct}%</p>
    <p class="text-sm text-ink-soft mt-1">${formatCount(graded.earned)} of ${countLabel(graded.total, 'point')}</p>
    <p class="mt-3 font-600 text-lg">${passed
      ? (isTopic ? `${esc(topic.name)} mastered!` : isSection ? `${esc(section.domain)} mastered!` : `${esc(subject)} mastered!`)
      : 'Not quite mastered yet'}</p>
    <p class="text-sm text-ink-soft mt-1 max-w-sm mx-auto leading-relaxed">${passed
      ? (isTopic
          ? `This topic is now marked mastered. Keep going!`
          : isSection
          ? `${esc(student.name)} is ready to move on from this section. Great work!`
          : `${esc(student.name)} scored above the ${PASS}% mastery mark. Fantastic work!`)
      : (isTopic
          ? `Mastery needs ${PASS}%. Revisit this topic's lesson and try again when ready — this isn't a failure, just a signpost.`
          : `Mastery needs ${PASS}%. Revisit the trickier topics and try again when ready — this isn't a failure, just a signpost.`)}</p>
    <div id="actions" class="mt-6 space-y-2.5"></div>
  </div>`);
  const actions = wrap.querySelector('#actions');

  if (passed) {
    if (isTopic) {
      // Offer a fun timed challenge to stretch the child now they've mastered it.
      const ch = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="zap" class="w-4 h-4"></i>Try the challenge quiz</button>`);
      ch.onclick = () => { m.close(); openChallenge(topic); };
      actions.appendChild(ch);
      actions.appendChild(el(`<p class="text-xs text-ink-faint">A timed, slightly harder stretch — optional and just for fun.</p>`));
    } else if (isSection) {
      // Section: unlocks the next section.
    } else {
      const markAll = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="check-check" class="w-4 h-4"></i>Mark all ${esc(subject)} topics as mastered</button>`);
      markAll.onclick = () => {
        const d = getData();
        store.setStatusBulk(student.id, (d.bySubject[subject] || []).map(t => t.id), 'mastered');
        toast(`All ${subject} topics marked mastered`, 'success');
        markAll.disabled = true;
        markAll.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>Done';
        refreshIcons();
      };
      actions.appendChild(markAll);
      const cert = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper-card border border-paper-line font-medium hover:border-brand/40 transition-colors"><i data-lucide="award" class="w-4 h-4"></i>Print certificate</button>`);
      cert.onclick = () => printCertificate(subject, student, graded.pct);
      actions.appendChild(cert);
    }
  }

  if (digitalReview) {
    const rev = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper-card border border-paper-line font-medium hover:border-brand/40 transition-colors"><i data-lucide="list-checks" class="w-4 h-4"></i>Review answers</button>`);
    rev.onclick = () => renderReview(stage, subject, student, test, graded, m, digitalReview);
    actions.appendChild(rev);
  }

  const done = el(`<button class="w-full px-4 py-2.5 rounded-xl text-ink-soft font-medium hover:bg-paper transition-colors">Close</button>`);
  done.onclick = () => m.close();
  actions.appendChild(done);

  stage.appendChild(wrap);
  refreshIcons();
}

// Child view result: no score, no answer review. The parent sees the numbers
// later on the topic page.
function renderChildResult(stage, m) {
  const wrap = el(`<div class="fade-up text-center py-4">
    <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style="background:#e4eedf">
      <i data-lucide="sprout" class="w-9 h-9" style="color:#3f6b3b"></i>
    </div>
    <p class="font-display text-2xl font-600">All done, well tried!</p>
    <p class="text-sm text-ink-soft mt-1 max-w-sm mx-auto leading-relaxed">A grown-up will look at how it went with you.</p>
    <button class="mt-6 w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Close</button>
  </div>`);
  wrap.querySelector('button').onclick = () => m.close();
  stage.appendChild(wrap);
  refreshIcons();
}

function renderReview(stage, subject, student, test, graded, m, review) {
  const { questions, answers } = review;
  stage.innerHTML = '';
  const wrap = el(`<div class="fade-up">
    <button id="back" class="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-4"><i data-lucide="arrow-left" class="w-4 h-4"></i>Back to result</button>
    <div id="list" class="space-y-3"></div>
  </div>`);
  const list = wrap.querySelector('#list');
  questions.forEach((q, i) => {
    const correct = isCorrect(q, answers[i]);
    const given = q.type === 'multiple_choice'
      ? (Number.isInteger(answers[i]) ? (q.options?.[answers[i]] ?? '—') : '—')
      : (answers[i] || '—');
    list.appendChild(el(`<div class="rounded-xl border ${correct ? 'border-brand/30 bg-brand-light/30' : 'border-[#f3b7a8] bg-[#fbecc4]'} p-3.5">
      <div class="flex items-start gap-2">
        <i data-lucide="${correct ? 'check-circle-2' : 'x-circle'}" class="w-4 h-4 shrink-0 mt-0.5" style="color:${correct ? '#3f6b3b' : '#a4473a'}"></i>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-600">${esc(q.q)}</p>
          <p class="text-xs text-ink-soft mt-1">Their answer: <span class="font-medium">${esc(given)}</span></p>
          ${!correct ? `<p class="text-xs text-ink-soft mt-0.5">Correct: <span class="font-medium">${esc(formatAnswer(q))}</span></p>` : ''}
        </div>
      </div>
    </div>`));
  });
  wrap.querySelector('#back').onclick = () => renderResult(stage, subject, student, test, graded, m, review);
  stage.appendChild(wrap);
  refreshIcons();
}

// ---------- helpers ----------
function loadingBlock(title, sub) {
  return el(`<div class="text-center py-10">
    <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-sm font-600">${title}</p>
    ${sub ? `<p class="text-xs text-ink-faint mt-1 max-w-xs mx-auto">${sub}</p>` : ''}
  </div>`);
}
function errorBlock(retry, message = 'Couldn\u2019t build the test right now.') {
  const b = el(`<div class="text-center py-10">
    <i data-lucide="cloud-off" class="w-8 h-8 text-ink-faint mx-auto mb-3"></i>
    <p class="text-sm text-ink-soft mb-3 max-w-xs mx-auto">${esc(message)}</p>
    <button id="r" class="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">Try again</button>
  </div>`);
  b.querySelector('#r').onclick = retry;
  return b;
}

// ---------- printing ----------
function printTest(subject, student, test) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  const questions = test.questions || [];
  const qHtml = questions.map((q, i) => {
    let ans = '';
    if (q.type === 'multiple_choice') ans = `<div class="opts">${(q.options || []).map((o, oi) => `<div class="opt"><span class="bub">${String.fromCharCode(65 + oi)}</span>${esc(o)}</div>`).join('')}</div>`;
    else ans = `<div class="lines"><div class="line"></div><div class="line"></div></div>`;
    return `<div class="q"><p class="qt"><b>${i + 1}.</b> ${esc(q.q)}</p>${ans}</div>`;
  }).join('');
  const key = questions.map((q, i) => `${i + 1}. ${esc(formatAnswer(q))}`).join('<br>');

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(test.title || subject + ' Mastery Test')}</title>
  <style>
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#2e2a24;margin:0;padding:0.5in;line-height:1.5}
    h1{font-size:22px;margin:0 0 2px}
    .meta{font-size:12px;color:#6f665a;margin-bottom:6px}
    .name-line{display:flex;justify-content:space-between;font-size:13px;margin:14px 0 4px}
    .name-line span{border-bottom:1px solid #999;min-width:150px;display:inline-block}
    .instr{font-style:italic;color:#5f574c;font-size:13px;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:8px 0;margin:10px 0 18px}
    .q{margin-bottom:20px}
    .qt{font-size:15px;margin:0 0 8px}
    .opts{margin-left:16px}
    .opt{display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px}
    .bub{width:16px;height:16px;border:1.5px solid #666;border-radius:50%;display:inline-block}
    .lines{margin-left:4px}
    .line{border-bottom:1px solid #bbb;height:22px}
    .key{page-break-before:always}
    .key h2{font-size:16px;border-bottom:2px solid #2e2a24;padding-bottom:6px}
    .key .k{font-size:14px;line-height:2}
    @media print{body{padding:0.5in}}
  </style></head><body>
    <h1>${esc(test.title || subject + ' Mastery Test')}</h1>
    <div class="meta">${esc(subject)} &middot; Pass mark: ${PASS}%${test.estimatedMinutes ? ' &middot; ~' + esc(test.estimatedMinutes) + ' min' : ''}</div>
    <div class="name-line"><div>Name: <span></span></div><div>Date: <span></span></div><div>Score: <span></span></div></div>
    <div class="instr">${esc(test.instructions || 'Answer every question as fully as you can.')}</div>
    ${qHtml}
    <div class="key"><h2>Answer key (for the parent)</h2><div class="k">${key}</div></div>
    <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
  </body></html>`);
  w.document.close();
}

function printCertificate(subject, student, pct) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Certificate — ${esc(student.name)}</title>
  <style>
    body{font-family:Georgia,serif;margin:0;padding:0;color:#2e2a24}
    .cert{margin:0.5in;border:3px double #3f6b3b;border-radius:8px;padding:56px 48px;text-align:center;min-height:6.5in;display:flex;flex-direction:column;justify-content:center}
    .k{font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#3f6b3b;margin-bottom:24px}
    h1{font-family:'Fraunces',Georgia,serif;font-size:40px;margin:0 0 8px}
    .sub{font-size:15px;color:#5f574c;margin-bottom:28px}
    .name{font-family:'Fraunces',Georgia,serif;font-size:34px;color:#2e4f2b;border-bottom:2px solid #ede3cf;display:inline-block;padding:0 30px 8px;margin-bottom:24px}
    .body{font-size:16px;line-height:1.7;max-width:460px;margin:0 auto 32px}
    .score{font-size:15px;color:#3f6b3b;font-weight:bold}
    .foot{display:flex;justify-content:space-between;max-width:420px;margin:24px auto 0;font-size:12px;color:#6f665a}
    .foot span{border-top:1px solid #999;padding-top:6px;min-width:150px;display:inline-block}
  </style></head><body>
    <div class="cert">
      <div class="k">Certificate of Mastery</div>
      <h1>${esc(subject)}</h1>
      <div class="sub">This certifies that</div>
      <div class="name">${esc(student.name)}</div>
      <div class="body">has demonstrated <b>mastery</b> of ${esc(subject)} by passing the final mastery test with a score of <span class="score">${pct}%</span>.</div>
      <div class="foot"><div>Parent / Teacher: <span></span></div><div>Date: ${date}</div></div>
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
  </body></html>`);
  w.document.close();
}
