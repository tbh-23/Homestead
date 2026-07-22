import { SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast, openModal } from '../ui.js';
import { aiChallenge } from '../ai.js';
import { isCorrect } from './masterytest.js';
import { evaluateChallenge, nextConceptHint } from '../adapt.js';
import { award, XP } from '../game.js';

const DURATION = 120; // seconds

export async function openChallenge(topic) {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  const meta = SUBJECTS[topic.subject];

  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-start gap-3 z-10">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="zap" class="w-5 h-5" style="color:${meta.color}"></i></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-faint">Challenge · ${topic.subject}</p>
        <h3 class="font-display text-lg font-600 leading-tight">${topic.name}</h3>
      </div>
    </div>
    <div id="stage" class="px-5 py-5"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });
  let timerId = null;
  const origClose = m.close;
  m.close = () => { if (timerId) clearInterval(timerId); origClose(); };

  renderIntro();

  function renderIntro() {
    stage.innerHTML = '';
    const best = store.challengesFor(student.id, topic.id)
      .sort((a, b) => (b.correct / b.total) - (a.correct / a.total))[0];
    const wrap = el(`<div class="fade-up text-center py-2">
      <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background:${meta.color}18"><i data-lucide="zap" class="w-8 h-8" style="color:${meta.color}"></i></div>
      <p class="font-600 text-lg">Beat the clock!</p>
      <p class="text-sm text-ink-soft mt-1 max-w-sm mx-auto leading-relaxed">${student.name} has already mastered this — now a fun stretch. Answer as many as you can in <span class="font-600">${DURATION / 60} minutes</span>. Slightly bigger and trickier than usual, but doable!</p>
      ${best ? `<p class="text-xs text-ink-faint mt-3">Best so far: ${best.correct}/${best.total} correct</p>` : ''}
      <button id="go" class="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white font-medium transition-opacity hover:opacity-90" style="background:${meta.color}"><i data-lucide="play" class="w-4 h-4"></i>Start challenge</button>
    </div>`);
    wrap.querySelector('#go').onclick = build;
    stage.appendChild(wrap);
    refreshIcons();
  }

  async function build() {
    stage.innerHTML = '';
    stage.appendChild(el(`<div class="text-center py-10"><div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p class="text-sm font-600">Building a challenge\u2026</p><p class="text-xs text-ink-faint mt-1">A fun stretch, double-checked for fairness.</p></div>`));
    refreshIcons();
    try {
      const test = await aiChallenge({
        subject: topic.subject, age: (topic.ageRangeStart || store.studentAge(student)),
        topic, nextHint: nextConceptHint(topic),
      });
      if (!test.questions || !test.questions.length) throw new Error('no questions');
      runQuiz(test);
    } catch (e) {
      console.error(e);
      stage.innerHTML = '';
      const err = el(`<div class="text-center py-10"><i data-lucide="cloud-off" class="w-8 h-8 text-ink-faint mx-auto mb-3"></i><p class="text-sm text-ink-soft mb-3">Couldn't build the challenge. Try again.</p><button id="r" class="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">Try again</button></div>`);
      err.querySelector('#r').onclick = renderIntro;
      stage.appendChild(err);
      refreshIcons();
    }
  }

  function runQuiz(test) {
    const questions = test.questions;
    let idx = 0, correct = 0, remaining = DURATION;
    const startTs = Date.now();
    stage.innerHTML = '';
    const wrap = el(`<div class="fade-up">
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm text-ink-soft">Question <span id="qn">1</span> · <span id="score">0</span> right</span>
        <span id="clock" class="flex items-center gap-1.5 text-lg font-700 tabular-nums" style="color:${meta.color}"><i data-lucide="timer" class="w-4 h-4"></i>${fmt(remaining)}</span>
      </div>
      <div class="h-1.5 rounded-full bg-paper-line overflow-hidden mb-5"><div id="bar" class="h-full rounded-full transition-all" style="width:100%;background:${meta.color}"></div></div>
      <div id="q"></div>
    </div>`);
    stage.appendChild(wrap);
    const clock = wrap.querySelector('#clock');
    const bar = wrap.querySelector('#bar');

    timerId = setInterval(() => {
      remaining--;
      clock.innerHTML = `<i data-lucide="timer" class="w-4 h-4"></i>${fmt(remaining)}`;
      bar.style.width = (remaining / DURATION * 100) + '%';
      refreshIcons();
      if (remaining <= 0) { clearInterval(timerId); finish(); }
    }, 1000);

    const showQ = () => {
      const q = questions[idx];
      wrap.querySelector('#qn').textContent = idx + 1;
      const qBox = wrap.querySelector('#q');
      qBox.innerHTML = '';
      const card = el(`<div class="fade-up"><p class="text-base font-600 mb-4">${esc(q.q)}</p><div class="grid gap-2"></div></div>`);
      const opts = card.querySelector('div');
      (q.options || []).forEach((opt, oi) => {
        const b = el(`<button class="w-full text-left px-4 py-3 rounded-xl border border-paper-line hover:border-brand/50 transition-colors text-sm font-medium">${esc(opt)}</button>`);
        b.onclick = () => {
          const right = isCorrect(q, oi);
          if (right) correct++;
          b.classList.add(right ? 'border-brand' : 'border-[#b0603a]');
          b.style.background = right ? '#e7f0ea' : '#fbf4ea';
          wrap.querySelector('#score').textContent = correct;
          opts.querySelectorAll('button').forEach(x => x.disabled = true);
          setTimeout(() => { idx++; if (idx >= questions.length) { clearInterval(timerId); finish(); } else showQ(); }, 350);
        };
        opts.appendChild(b);
      });
      qBox.appendChild(card);
      refreshIcons();
    };
    showQ();

    function finish() {
      const seconds = Math.min(DURATION, Math.round((Date.now() - startTs) / 1000));
      // Previous best for this topic (by correct count) BEFORE saving this run.
      const prior = store.challengesFor(student.id, topic.id);
      const prevBest = prior.reduce((m, c) => Math.max(m, c.correct || 0), -1);
      const isFirst = prior.length === 0;
      const beatBest = !isFirst && correct > prevBest;

      const rec = store.addChallenge(student.id, {
        topicId: topic.id, subject: topic.subject, domain: topic.domain,
        correct, total: questions.length, answered: idx, seconds,
      });
      const raised = evaluateChallenge(student.id, { ...rec, total: questions.length });
      // XP for the challenge (bonus for acing). Celebration fires after result.
      const aced = questions.length && (correct / questions.length) >= 0.8;
      setTimeout(() => award(student.id, null, aced ? XP.challengeAce : XP.challenge), 500);

      // Celebrate a new personal best (not the very first attempt).
      if (beatBest) {
        store.addNotification({
          type: 'challenge',
          title: `New best score! ${student.name} · ${topic.name}`,
          body: `${student.name} beat their previous best on the ${topic.name} challenge — ${correct}/${questions.length} correct (up from ${prevBest}). Keep up the momentum!`,
          meta: { subject: topic.subject, topicId: topic.id, correct, total: questions.length, prevBest },
        });
      }
      renderResult(correct, questions.length, idx, seconds, raised, beatBest);
    }
  }

  function renderResult(correct, total, answered, seconds, raised, beatBest) {
    stage.innerHTML = '';
    const pct = Math.round((correct / total) * 100);
    const great = pct >= 80;
    const wrap = el(`<div class="fade-up text-center py-4">
      <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style="background:${meta.color}18"><i data-lucide="${great ? 'trophy' : 'sparkles'}" class="w-9 h-9" style="color:${meta.color}"></i></div>
      ${beatBest ? `<span class="inline-flex items-center gap-1.5 text-xs font-600 px-2.5 py-1 rounded-full mb-2 text-white" style="background:${meta.color}"><i data-lucide="trophy" class="w-3.5 h-3.5"></i>New best score!</span>` : ''}
      <p class="text-4xl font-700 font-display" style="color:${meta.color}">${correct}/${total}</p>
      <p class="text-sm text-ink-soft mt-1">correct in ${fmt(seconds)}</p>
      <p class="mt-3 font-600 text-lg">${great ? 'Awesome work!' : 'Nice effort!'}</p>
      <p class="text-sm text-ink-soft mt-1 max-w-sm mx-auto leading-relaxed">${great
        ? `${student.name} smashed the stretch challenge. ${raised ? 'A suggestion to make this area harder is waiting for you to approve.' : ''}`
        : `A tricky one — great for keeping skills sharp. Try again anytime to beat the score.`}</p>
      ${raised ? `<div class="mt-4 rounded-xl border border-brand/30 bg-brand-light/50 p-3 text-left flex items-start gap-2.5"><i data-lucide="trending-up" class="w-4 h-4 text-brand-dark shrink-0 mt-0.5"></i><p class="text-xs text-ink-soft">We suggested pitching future <strong>${topic.domain}</strong> work harder. Review it under <strong>Insights → Adaptive suggestions</strong> — you can approve or decline.</p></div>` : ''}
      <div class="mt-6 space-y-2.5">
        <button id="again" class="w-full px-4 py-2.5 rounded-xl text-white font-medium transition-opacity hover:opacity-90" style="background:${meta.color}">Try again</button>
        <button id="close" class="w-full px-4 py-2.5 rounded-xl text-ink-soft font-medium hover:bg-paper transition-colors">Close</button>
      </div>
    </div>`);
    wrap.querySelector('#again').onclick = renderIntro;
    wrap.querySelector('#close').onclick = () => m.close();
    stage.appendChild(wrap);
    refreshIcons();
  }
}

function fmt(s) { s = Math.max(0, s); const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; }
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
