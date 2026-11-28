import { getData, SUBJECTS, subjectMeta } from '../data.js';
import * as store from '../store.js';
import { el, esc, refreshIcons, toast, openModal } from '../ui.js';
import { aiRecallCards } from '../ai.js';
import { aiErrorBlock, gateAi, generateAnotherButton, offerRetrySave, regenerateInto } from '../ai-status.js';
import { award, XP } from '../game.js';
import { countLabel } from '../format.js';

// Cards are cached per topic (shared, like lessons) so retrieval practice is
// instant. Stored as { cards }; generateCached also reads the older bare arrays.
function recallKey(topic) { return 'recall:' + topic.id; }
function generateCards(topic) {
  return () => aiRecallCards(topic, topic.ageRangeStart || 8).then(cards => ({ cards }));
}
// Every card is checked before the session starts, so a malformed one is left
// out (and counted) instead of breaking the session when it is reached.
// `fresh` is true when this call generated the set (nothing valid was cached).
export async function cardsForTopic(topic) {
  let fresh = false;
  const generate = generateCards(topic);
  const value = await store.generateCached(recallKey(topic), () => { fresh = true; return generate(); });
  return { ...store.recallCardsOf(value), fresh };
}

function droppedNote(dropped) {
  return el(`<p class="recall-dropped text-xs text-ink-faint mb-3">${countLabel(dropped, 'card')} couldn’t be shown and ${dropped === 1 ? 'was' : 'were'} left out.</p>`);
}

// The child view never shows provider wording (HAR-15), so failures read neutrally there.
function failureBlock(e, retry) {
  if (!store.isChildViewOpen()) return aiErrorBlock(e, retry);
  return el(`<p class="text-sm text-ink-soft py-6 text-center">These cards aren’t ready yet. Try again later.</p>`);
}

// Study a single topic's recall cards.
export async function openRecall(topic) {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  const meta = subjectMeta(topic.subject);

  const { body, stage, m } = shell('brain', topic.subject, topic.name, meta);
  stage.appendChild(loading('Preparing recall cards…', 'Made once, then saved for reuse.'));
  refreshIcons();

  let set;
  try {
    set = await cardsForTopic(topic);
  } catch (e) {
    stage.replaceChildren(failureBlock(e, () => { m.close(); openRecall(topic); }));
    return;
  }
  if (!set.cards.length) { stage.replaceChildren(el(`<p class="text-sm text-ink-soft py-6 text-center">No recall cards for this topic.</p>`)); return; }

  // Each session renders into its own node, so a regenerate can be tried off-screen.
  const session = ({ cards, dropped }) => {
    const wrap = el(`<div></div>`);
    if (dropped) wrap.appendChild(droppedNote(dropped));
    const box = wrap.appendChild(el(`<div></div>`));
    runSession(box, m, student, meta, cards.map(c => ({ ...c, topicId: topic.id })), () => openRecall(topic), false, onRegen);
    return wrap;
  };
  const track = (list) => list.forEach(c => store.ensureRecallCard(student.id, c.id, topic.id));
  // No regenerate in the child view.
  const onRegen = store.isChildViewOpen() ? null : () => regenerateInto(stage, {
    key: recallKey(topic), generate: generateCards(topic),
    render: (fresh) => session(store.recallCardsOf(fresh)),
    loading: loading('Writing a fresh set of cards\u2026', ''),
    // New cards reuse positional ids, so the old schedule is dropped for every learner.
    onShow: (fresh) => { store.resetRecallTopic(topic.id); track(store.recallCardsOf(fresh).cards); },
  });
  // A fresh set reuses positional ids, so any schedule left from a set that
  // was lost (never saved, or cleared) would attach to different questions.
  if (set.fresh) store.resetRecallTopic(topic.id);
  track(set.cards);
  stage.replaceChildren(session(set));
  refreshIcons();
  if (!store.isChildViewOpen()) offerRetrySave(recallKey(topic));
}

// Study everything due today across all topics (mixed retrieval practice).
export async function openDueRecall() {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  const d = getData();
  const { body, stage, m } = shell('brain', 'Active recall', 'Due today', SUBJECTS.Mathematics);

  const due = store.dueRecallCards(student.id);
  if (!due.length) {
    stage.appendChild(caughtUp());
    refreshIcons();
    return;
  }

  stage.appendChild(loading('Loading your review…', ''));
  refreshIcons();

  // We need the actual card text; regenerate/pull from cache per involved topic.
  const byTopic = {};
  // Card ids are `${topicId}::${n}`; fall back to that for records saved without a topicId.
  due.forEach(c => { const t = c.topicId || String(c.id).split('::')[0]; (byTopic[t] = byTopic[t] || []).push(c.id); });
  const allCards = [];
  let dropped = 0;
  try {
    for (const [topicId, ids] of Object.entries(byTopic)) {
      const topic = d.byId.get(topicId);
      if (!topic) continue;
      const set = await cardsForTopic(topic);
      if (!store.isChildViewOpen()) offerRetrySave(recallKey(topic));
      // A freshly generated set is not the one these entries were scheduled
      // against: start it over, as regenerate does, and skip it today.
      if (set.fresh) { store.resetRecallTopic(topic.id); continue; }
      // Due entries whose card no longer exists (an older, longer card set, or
      // a malformed card) are dropped.
      store.dropOrphanRecall(student.id, topic.id, set.cards);
      const due = set.cards.filter(c => ids.includes(c.id));
      due.forEach(c => allCards.push({ ...c, subject: topic.subject, topicId: topic.id }));
      dropped += set.droppedIds.filter(id => ids.includes(id)).length;
    }
    if (!allCards.length) { stage.replaceChildren(caughtUp()); refreshIcons(); return; }
    // shuffle for interleaving
    for (let i = allCards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allCards[i], allCards[j]] = [allCards[j], allCards[i]]; }
    stage.replaceChildren();
    if (dropped) stage.appendChild(droppedNote(dropped));
    runSession(stage.appendChild(el(`<div></div>`)), m, student, SUBJECTS.Mathematics, allCards, () => openDueRecall(), true);
  } catch (e) {
    stage.replaceChildren(failureBlock(e, () => { m.close(); openDueRecall(); }));
  }
}

function caughtUp() {
  return el(`<div class="text-center py-10">
    <div class="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4"><i data-lucide="check-check" class="w-8 h-8 text-brand-dark"></i></div>
    <p class="font-600 text-lg">All caught up!</p>
    <p class="text-sm text-ink-soft mt-1 max-w-sm mx-auto">Nothing is due for review right now. Recall cards appear here after you study a topic — come back tomorrow to keep it fresh.</p>
  </div>`);
}

function runSession(stage, m, student, meta, cards, restart, mixed = false, onRegen = null) {
  let i = 0, revealed = false;
  const results = { again: 0, good: 0, easy: 0 };

  const render = () => {
    if (i >= cards.length) return renderDone();
    const c = cards[i];
    const cardMeta = mixed && c.subject ? subjectMeta(c.subject) : meta;
    revealed = false;
    stage.innerHTML = '';
    const wrap = el(`<div class="fade-up">
      <div class="flex items-center justify-between mb-4">
        <span class="text-xs text-ink-soft">Card ${i + 1} of ${cards.length}</span>
        <span class="text-xs font-medium flex items-center gap-1.5" style="color:${cardMeta.color}"><i data-lucide="brain" class="w-3.5 h-3.5"></i>Answer from memory</span>
      </div>
      <div class="h-1.5 rounded-full bg-paper-line overflow-hidden mb-5"><div class="h-full rounded-full transition-all" style="width:${(i / cards.length) * 100}%;background:${cardMeta.color}"></div></div>
      <div class="rounded-2xl border border-paper-line bg-paper p-6 min-h-[160px] flex flex-col items-center justify-center text-center">
        <p class="text-lg font-600 leading-snug">${esc(c.front)}</p>
        ${c.hint ? `<button id="hint" class="mt-3 text-xs text-ink-faint hover:text-ink-soft flex items-center gap-1"><i data-lucide="lightbulb" class="w-3.5 h-3.5"></i>Show hint</button><p id="hinttext" class="hidden text-xs text-ink-soft mt-2 italic"></p>` : ''}
        <div id="answer" class="hidden mt-4 pt-4 border-t border-paper-line w-full">
          <p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint mb-1">Answer</p>
          <p class="text-base text-ink leading-snug">${esc(c.back)}</p>
        </div>
      </div>
      <div id="controls" class="mt-5"></div>
    </div>`);
    stage.appendChild(wrap);

    const hintBtn = wrap.querySelector('#hint');
    if (hintBtn) hintBtn.onclick = () => { const h = wrap.querySelector('#hinttext'); h.textContent = c.hint; h.classList.remove('hidden'); hintBtn.classList.add('hidden'); };

    const controls = wrap.querySelector('#controls');
    const reveal = el(`<button class="w-full px-4 py-3 rounded-xl text-white font-medium transition-opacity hover:opacity-90" style="background:${cardMeta.color}">Show answer</button>`);
    reveal.onclick = () => {
      revealed = true;
      wrap.querySelector('#answer').classList.remove('hidden');
      controls.innerHTML = '';
      controls.appendChild(el(`<p class="text-xs text-ink-faint text-center mb-2">How well did you remember it?</p>`));
      const grid = el(`<div class="grid grid-cols-3 gap-2"></div>`);
      [['again', 'Missed it', '#a4473a', 'x'], ['good', 'Got it', '#2f6285', 'check'], ['easy', 'Easy', '#3f6b3b', 'zap']].forEach(([g, label, color, icon]) => {
        const b = el(`<button class="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-paper-line hover:border-brand/40 transition-colors"><i data-lucide="${icon}" class="w-4 h-4" style="color:${color}"></i><span class="text-xs font-medium">${label}</span></button>`);
        b.onclick = () => {
          results[g]++;
          store.gradeRecall(student.id, c.id, c.topicId, g);
          // Quiet XP per card (no popup mid-session); bonus if remembered.
          store.awardXp(student.id, XP.recallCard + (g !== 'again' ? XP.recallGood : 0));
          i++; render();
        };
        grid.appendChild(b);
      });
      controls.appendChild(grid);
      refreshIcons();
    };
    controls.appendChild(reveal);
    if (onRegen) wrap.appendChild(el(`<div class="mt-5 pt-2 border-t border-paper-line"></div>`)).appendChild(generateAnotherButton(onRegen, 'recall'));
    refreshIcons();
  };

  const renderDone = () => {
    // Trigger badge checks + a celebration for the session (XP already added per card).
    setTimeout(() => award(student.id, null, 0), 400);
    stage.innerHTML = '';
    const total = cards.length;
    // Child view: no counts. Grades are already recorded for the parent.
    if (store.isChildViewOpen()) {
      stage.appendChild(el(`<div class="fade-up text-center py-4">
        <div class="w-20 h-20 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4"><i data-lucide="sprout" class="w-9 h-9 text-brand-dark"></i></div>
        <p class="font-display text-2xl font-600">All done, well tried!</p>
        <p class="text-sm text-ink-soft mt-1 max-w-sm mx-auto">These cards will come back another day to help them stick.</p>
        <div class="mt-6 space-y-2.5">
          <button id="again" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Walk again</button>
          <button id="close" class="w-full px-4 py-2.5 rounded-xl text-ink-soft font-medium hover:bg-paper transition-colors">Done</button>
        </div>
      </div>`));
      stage.querySelector('#again').onclick = () => { m.close(); restart(); };
      stage.querySelector('#close').onclick = () => m.close();
      refreshIcons();
      return;
    }
    stage.appendChild(el(`<div class="fade-up text-center py-4">
      <div class="w-20 h-20 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4"><i data-lucide="party-popper" class="w-9 h-9 text-brand-dark"></i></div>
      <p class="font-600 text-lg">Recall session complete!</p>
      <p class="text-sm text-ink-soft mt-1">${total} card${total > 1 ? 's' : ''} reviewed · <span class="text-brand-dark font-medium">${results.good + results.easy} remembered</span>${results.again ? ` · ${results.again} to revisit` : ''}</p>
      <p class="text-xs text-ink-faint mt-3 max-w-sm mx-auto">Cards you remembered will come back later; missed ones return sooner. This spacing is what locks learning into long-term memory.</p>
      <div class="mt-6 space-y-2.5">
        <button id="again" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Study again</button>
        <button id="close" class="w-full px-4 py-2.5 rounded-xl text-ink-soft font-medium hover:bg-paper transition-colors">Done</button>
      </div>
    </div>`));
    stage.querySelector('#again').onclick = () => { m.close(); restart(); };
    stage.querySelector('#close').onclick = () => m.close();
    refreshIcons();
  };

  render();
}

// ---- shared UI ----
function shell(icon, kicker, title, meta) {
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-start gap-3 z-10">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${icon}" class="w-5 h-5" style="color:${meta.color}"></i></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-faint">Active recall · ${esc(kicker)}</p>
        <h3 class="font-display text-lg font-600 leading-tight">${esc(title)}</h3>
      </div>
    </div>
    <div id="stage" class="px-5 py-5"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });
  return { body, stage, m };
}
function loading(t, s) {
  return el(`<div class="text-center py-10"><div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p class="text-sm font-600">${t}</p>${s ? `<p class="text-xs text-ink-faint mt-1">${s}</p>` : ''}</div>`);
}

// A compact "Active recall" card for the topic page.
export function recallSectionCard(topic, student) {
  const body = el(`<div></div>`);
  if (!student) { body.appendChild(el(`<p class="text-sm text-ink-faint">Add a student to practice recall.</p>`)); return sectionWrap(body); }
  body.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed mb-3 [overflow-wrap:anywhere]">Retrieval practice: ${esc(student.name)} answers short questions <span class="font-600">from memory</span>, then reviews on a spaced schedule so it sticks.</p>`));
  const btn = el(`<button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm transition-colors"><i data-lucide="brain" class="w-4 h-4"></i>Practice recall</button>`);
  btn.onclick = () => openRecall(topic);
  body.appendChild(gateAi(btn, { capability: 'recall', cachedKey: recallKey(topic) }));
  return sectionWrap(body);
}
function sectionWrap(body) {
  const s = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <div class="flex items-center justify-between mb-3.5"><h2 class="font-600 flex items-center gap-2"><i data-lucide="brain" class="w-4.5 h-4.5 text-brand-dark"></i>Active recall</h2></div>
    <div class="body"></div>
  </div>`);
  s.querySelector('.body').appendChild(body);
  return s;
}
