import { SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast, openModal } from '../ui.js';
import { award, XP } from '../game.js';
import { isCorrect } from './masterytest.js';

// Spaced retry of mastery-test questions the student previously missed —
// extends the same expanding-interval schedule used for recall cards to
// actual problem-solving, not just recall facts.
export async function openDuePractice() {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  const { stage, m } = shell();

  const due = store.duePracticeItems(student.id);
  if (!due.length) {
    stage.appendChild(el(`<div class="text-center py-10">
      <div class="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4"><i data-lucide="check-check" class="w-8 h-8 text-brand-dark"></i></div>
      <p class="font-600 text-lg">All caught up!</p>
      <p class="text-sm text-ink-soft mt-1 max-w-sm mx-auto">No retries are due right now. Missed test questions come back here on a spaced schedule until they truly stick.</p>
    </div>`));
    refreshIcons();
    return;
  }
  // shuffle for interleaving across topics/subjects
  for (let i = due.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [due[i], due[j]] = [due[j], due[i]]; }
  runSession(stage, m, student, due, () => openDuePractice());
}

function runSession(stage, m, student, items, restart) {
  let i = 0;
  const results = { correct: 0, missed: 0 };

  const render = () => {
    if (i >= items.length) return renderDone();
    const item = items[i];
    const meta = SUBJECTS[item.subject] || SUBJECTS.Mathematics;
    let given = item.type === 'multiple_choice' ? null : '';

    stage.innerHTML = '';
    const wrap = el(`<div class="fade-up">
      <div class="flex items-center justify-between mb-4">
        <span class="text-xs text-ink-soft">Retry ${i + 1} of ${items.length}</span>
        <span class="text-xs font-medium" style="color:${meta.color}">${esc(item.sourceLabel || item.subject)}</span>
      </div>
      <div class="h-1.5 rounded-full bg-paper-line overflow-hidden mb-5"><div class="h-full rounded-full transition-all" style="width:${(i / items.length) * 100}%;background:${meta.color}"></div></div>
      <div class="rounded-2xl border border-paper-line bg-paper p-5">
        <p class="text-base font-600 mb-4">${esc(item.q)}</p>
        <div id="opts" class="space-y-2"></div>
      </div>
      <div id="controls" class="mt-5"></div>
    </div>`);
    stage.appendChild(wrap);

    const opts = wrap.querySelector('#opts');
    const controls = wrap.querySelector('#controls');
    const check = el(`<button class="w-full px-4 py-3 rounded-xl text-white font-medium transition-opacity hover:opacity-90 disabled:opacity-40" style="background:${meta.color}" disabled>Check answer</button>`);

    if (item.type === 'multiple_choice') {
      (item.options || []).forEach((opt, oi) => {
        const b = el(`<button class="w-full text-left px-3 py-2.5 rounded-lg border border-paper-line text-sm hover:border-brand/40 transition-colors">${esc(opt)}</button>`);
        b.onclick = () => {
          given = oi;
          opts.querySelectorAll('button').forEach(x => x.classList.remove('border-brand', 'bg-brand-light/50'));
          b.classList.add('border-brand', 'bg-brand-light/50');
          check.disabled = false;
        };
        opts.appendChild(b);
      });
    } else {
      const inp = el(`<input class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" placeholder="Type the answer…" />`);
      inp.oninput = () => { given = inp.value.trim(); check.disabled = !given; };
      opts.appendChild(inp);
    }
    controls.appendChild(check);

    check.onclick = () => {
      const correct = isCorrect(item, given);
      store.gradePracticeItem(student.id, item.id, correct);
      store.awardXp(student.id, XP.practiceRetry + (correct ? XP.practiceCorrect : 0));
      results[correct ? 'correct' : 'missed']++;
      showFeedback(wrap, item, correct, () => { i++; render(); });
    };
    refreshIcons();
  };

  const renderDone = () => {
    setTimeout(() => award(student.id, null, 0), 400);
    stage.innerHTML = '';
    const total = items.length;
    stage.appendChild(el(`<div class="fade-up text-center py-4">
      <div class="w-20 h-20 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4"><i data-lucide="party-popper" class="w-9 h-9 text-brand-dark"></i></div>
      <p class="font-600 text-lg">Practice session complete!</p>
      <p class="text-sm text-ink-soft mt-1">${total} retr${total > 1 ? 'ies' : 'y'} · <span class="text-brand-dark font-medium">${results.correct} correct</span>${results.missed ? ` · ${results.missed} to revisit` : ''}</p>
      <p class="text-xs text-ink-faint mt-3 max-w-sm mx-auto">Correct answers come back after a longer delay next time; missed ones return sooner — the same spacing behind active recall, now applied to real problems.</p>
      <div class="mt-6 space-y-2.5">
        <button id="again" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Practice more</button>
        <button id="close" class="w-full px-4 py-2.5 rounded-xl text-ink-soft font-medium hover:bg-paper transition-colors">Done</button>
      </div>
    </div>`));
    stage.querySelector('#again').onclick = () => { m.close(); restart(); };
    stage.querySelector('#close').onclick = () => m.close();
    refreshIcons();
  };

  render();
}

function showFeedback(wrap, item, correct, next) {
  const controls = wrap.querySelector('#controls');
  controls.innerHTML = '';
  controls.appendChild(el(`<div class="rounded-xl border ${correct ? 'border-brand/30 bg-brand-light/30' : 'border-[#e6cbae] bg-[#fbf4ea]'} p-3.5 mb-3 flex items-start gap-2.5">
    <i data-lucide="${correct ? 'check-circle-2' : 'x-circle'}" class="w-4 h-4 shrink-0 mt-0.5" style="color:${correct ? '#3f7d5e' : '#b0603a'}"></i>
    <p class="text-sm">${correct ? 'Correct!' : `Correct answer: <span class="font-600">${esc(formatAnswer(item))}</span>`}</p>
  </div>`));
  const nextBtn = el(`<button class="w-full px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Continue</button>`);
  nextBtn.onclick = next;
  controls.appendChild(nextBtn);
  refreshIcons();
}

function formatAnswer(item) {
  if (item.type === 'multiple_choice') return (item.options && item.options[item.answer] != null) ? item.options[item.answer] : '';
  return item.answer || '';
}

function shell() {
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-start gap-3 z-10">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-brand/10"><i data-lucide="repeat" class="w-5 h-5 text-brand-dark"></i></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-faint">Spaced practice</p>
        <h3 class="font-display text-lg font-600 leading-tight">Missed questions, retried</h3>
      </div>
    </div>
    <div id="stage" class="px-5 py-5"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });
  return { stage, m };
}
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
