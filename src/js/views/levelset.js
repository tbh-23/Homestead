// Level-set workbook (HAR-24): per learner and lane, a "Can they…?" sheet at
// a time (one area, at most twelve topics); the parent marks each topic Yes,
// Not yet or Unsure, and the walk (src/js/levelset.js) finds where to start.
// Saving a sheet keeps its answers only. At the end the parent sees exactly
// what Yes would mark mastered and confirms it as one placement record,
// which Records can undo. Parent view only.
import { getData, topicAge, hardPrereqs, isCurrentTopic, orderTopics } from '../data.js';
import * as store from '../store.js';
import { LANES } from '../daily.js';
import { el, esc, refreshIcons, toast } from '../ui.js';
import * as ls from '../levelset.js';
import { countLabel } from '../format.js';

// A sitting runs while the parent keeps answering, per learner and lane:
// key -> { start, base, last }, where base is the time saved before this
// sitting. Half an hour without an answer starts a new sitting.
const sittings = new Map();
const IDLE_MS = 30 * 60000;
let clockTimer = null;
// Answer buttons are 44 px tall tap targets.
const ANSWER_CLS = 'h-11 min-w-[44px] px-2.5 sm:px-4 flex items-center justify-center gap-1.5 rounded-full text-sm font-medium whitespace-nowrap';

function makeCtx(studentId, lane) {
  const d = getData();
  // Sheets list topics by the lane's domains, then in learning order.
  const rank = (t) => lane.domains.indexOf(t.domain);
  const topics = orderTopics(ls.laneTopics(d.topics, lane)).sort((a, b) => rank(a) - rank(b));
  return {
    topics, domains: lane.domains, topicAge, hardPrereqs, isCurrent: isCurrentTopic,
    mastered: (id) => store.statusOf(studentId, id) === 'mastered',
  };
}

function sittingFor(studentId, laneKey, session) {
  const key = `${studentId}|${laneKey}`;
  const now = Date.now();
  const cur = sittings.get(key);
  if (!cur || now - cur.last > IDLE_MS) sittings.set(key, { start: now, base: session ? session.elapsedMs || 0 : 0, last: now });
  return sittings.get(key);
}

export function renderLevelset(params, { navigate }) {
  const d = getData();
  const student = store.get().students.find(s => s.id === params.id) || store.activeStudent();
  const root = el(`<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  if (!student) { root.appendChild(el(`<p class="text-ink-soft">Add a student first.</p>`)); return root; }
  const saved = store.levelsetFor(student.id).lane;
  const laneSel = LANES[saved] ? saved : 'literacy';
  const lane = LANES[laneSel];
  const ctx = makeCtx(student.id, lane);
  let session = store.levelsetSession(student.id, laneSel);
  // A session from an older sheet layout, or one whose walk can move on.
  if (session) {
    const moved = ls.advance(ctx, session);
    if (moved !== session) { session = moved; store.saveLevelsetSession(student.id, laneSel, session, { quiet: true }); }
  }

  root.appendChild(el(`<div class="mb-5">
    <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1">Parent view</p>
    <h1 class="font-display text-2xl sm:text-3xl font-600">Level-set workbook</h1>
    <p class="text-ink-soft text-sm mt-1 leading-relaxed [overflow-wrap:anywhere]">Find where <span class="font-600 text-ink">${esc(student.name)}</span> is in reading and number, one short sheet at a time: one area, up to twelve topics. Mark each topic <b>Yes</b> if you have seen them do it, <b>Not yet</b> if not, or <b>Unsure</b> to check it later by watching. Saving a sheet keeps your answers; nothing is marked until you confirm the list at the end.</p>
  </div>`));

  // Lane tabs
  const tabs = el(`<div class="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Lane"></div>`);
  Object.entries(LANES).forEach(([key, l]) => {
    const on = key === laneSel;
    const s = store.levelsetSession(student.id, key);
    const badge = s ? (s.done ? 'done' : `sheet ${s.sheets.length}`) : 'not started';
    const b = el(`<button role="tab" aria-selected="${on}" class="h-11 flex items-center gap-2 px-3.5 rounded-full text-sm font-medium border ${on ? 'bg-ink text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line'}"><i data-lucide="${l.icon}" class="w-4 h-4"></i>${esc(l.label)}<span class="text-xs ${on ? 'text-white/70' : 'text-ink-faint'}">${badge}</span></button>`);
    b.onclick = () => { if (!on) store.setLevelsetLane(student.id, key); };
    tabs.appendChild(b);
  });
  root.appendChild(tabs);

  if (!session) {
    const start = ls.startLevel(store.studentAge(student), ls.laneLevels(ctx.topics, topicAge));
    const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
      <h2 class="font-600 mb-1">${esc(lane.label)}</h2>
      <p class="text-sm text-ink-soft leading-relaxed mb-4">Covers ${esc(lane.domains.join(', '))}, one area at a time. Each area starts with its topics for about age ${start}, then moves up or down depending on your answers. About twenty minutes a sitting; stop whenever you like and pick up where you left off.</p>
      <button id="ls-start" class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm"><i data-lucide="play" class="w-4 h-4"></i>Start the ${esc(lane.label.toLowerCase())} workbook</button>
    </div>`);
    card.querySelector('#ls-start').onclick = () => {
      const s = ls.advance(ctx, ls.newSession(laneSel, { age: store.studentAge(student) }));
      sittings.set(`${student.id}|${laneSel}`, { start: Date.now(), base: 0, last: Date.now() });
      store.saveLevelsetSession(student.id, laneSel, s);
    };
    root.appendChild(card);
    root.appendChild(queueCard(student, navigate));
    refreshIcons();
    return root;
  }

  const sitting = sittingFor(student.id, laneSel, session);
  root.appendChild(clockBar(sitting));

  if (session.done) {
    root.appendChild(frontierCard(student, lane, session, navigate));
    root.appendChild(proposalCard(student, lane, session));
  } else root.appendChild(sheetCard(student, lane, session, sitting, d));

  root.appendChild(historyCard(student, lane, session));
  root.appendChild(queueCard(student, navigate));

  const over = el(`<button class="mt-4 h-11 text-sm text-ink-faint hover:text-[#a4473a] flex items-center gap-1.5"><i data-lucide="rotate-ccw" class="w-4 h-4"></i>Start the ${esc(lane.label.toLowerCase())} workbook over</button>`);
  over.onclick = () => {
    const msg = session.placed
      ? `Start the ${lane.label.toLowerCase()} workbook over? The topics you confirmed stay mastered; undo them from Records if you want.`
      : `Start the ${lane.label.toLowerCase()} workbook over? Your answers are cleared. Nothing was marked mastered.`;
    if (!confirm(msg)) return;
    sittings.delete(`${student.id}|${laneSel}`);
    store.saveLevelsetSession(student.id, laneSel, null);
  };
  root.appendChild(over);
  refreshIcons();
  return root;
}

// Elapsed time this sitting, and a gentle pause suggestion at twenty minutes.
function clockBar(sitting) {
  const bar = el(`<div class="ls-clock flex items-center gap-2 text-xs text-ink-soft mb-4" aria-live="polite"></div>`);
  const paint = () => {
    const n = ls.sittingNotice(Date.now() - sitting.start);
    const total = ls.sittingNotice(sitting.base + (Date.now() - sitting.start)).minutes;
    bar.innerHTML = `<i data-lucide="timer" class="w-4 h-4"></i><span>This sitting: ${n.minutes} min${total > n.minutes ? ` · all sittings: ${total} min` : ''}</span>`
      + (n.pause ? `<span class="ml-2 px-2.5 py-1 rounded-full bg-[#fbecc4] text-[#6b4d0e] font-medium">About ${ls.SITTING_MINUTES} minutes: a good moment to pause. Your answers are saved.</span>` : '');
    refreshIcons();
  };
  paint();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { if (!bar.isConnected) { clearInterval(clockTimer); return; } paint(); }, 15000);
  return bar;
}

function sheetCard(student, lane, session, sitting, d) {
  const index = session.sheets.length - 1;
  const sheet = session.sheets[index];
  const rows = ls.sheetRows(d.byId, sheet.ids, { name: student.name });
  const card = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-5">
    <div class="flex items-start justify-between gap-3 mb-1">
      <h2 class="font-600">${esc(ls.sheetTitle(sheet, lane.label))}</h2>
      <button id="ls-print" class="shrink-0 h-11 -my-2 flex items-center gap-1.5 text-sm font-medium text-brand-dark"><i data-lucide="printer" class="w-4 h-4"></i>Print this sheet</button>
    </div>
    <p class="text-xs text-ink-faint mb-4">${sheet.kind === 'foundations'
      ? 'What the Not yet topics build on. Answer these to find where to start.'
      : `${countLabel(rows.length, 'topic')}. Can they…? Answer from what you have seen.`}</p>
    <div class="ls-rows space-y-2.5"></div>
    <p class="ls-left text-xs text-ink-faint mt-3"></p>
    <button id="ls-save" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"><i data-lucide="check" class="w-4 h-4"></i>Save this sheet and continue</button>
  </div>`);
  const list = card.querySelector('.ls-rows');
  const left = card.querySelector('.ls-left');
  const save = card.querySelector('#ls-save');
  const refresh = () => {
    const n = sheet.ids.filter(id => isCurrentTopic(id) && !session.answers[id]).length;
    save.disabled = n > 0;
    left.textContent = n ? `${n} still to answer.` : 'All answered.';
  };

  rows.forEach(row => {
    const r = el(`<div class="rounded-xl border border-paper-line bg-paper p-3.5">
      <p class="font-600 text-sm">${esc(row.name)}</p>
      <p class="text-[11px] text-ink-faint">${esc(row.domain)}</p>
      ${row.prompts.length ? `<ul class="mt-1.5 space-y-0.5">${row.prompts.map(p => `<li class="text-sm text-ink-soft leading-snug">${esc(p)}</li>`).join('')}</ul>` : ''}
      <div class="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 mt-2.5" role="radiogroup" aria-label="${esc(row.name)}"></div>
    </div>`);
    const group = r.querySelector('[role="radiogroup"]');
    const buttons = Object.entries(ls.ANSWERS).map(([key, a]) => {
      const b = el(`<button role="radio" class="${ANSWER_CLS} border"><i data-lucide="${a.icon}" class="w-4 h-4 shrink-0"></i>${a.label}</button>`);
      b.dataset.answer = key;
      b.onclick = () => {
        session = ls.setAnswer(session, row.id, key);
        sitting.last = Date.now();
        session = { ...session, elapsedMs: sitting.base + (sitting.last - sitting.start) };
        store.saveLevelsetSession(student.id, session.lane, session, { quiet: true });
        paintButtons();
        refresh();
      };
      group.appendChild(b);
      return b;
    });
    const paintButtons = () => buttons.forEach(b => {
      const on = session.answers[row.id] === b.dataset.answer;
      b.setAttribute('aria-checked', String(on));
      b.className = `${ANSWER_CLS} border ${on ? 'bg-ink text-white border-transparent' : 'bg-paper-card text-ink-soft border-paper-line hover:border-ink-faint/40'}`;
    });
    paintButtons();
    list.appendChild(r);
  });
  refresh();

  card.querySelector('#ls-print').onclick = () => printSheet(student, lane, sheet, rows);
  let saving = false;
  save.onclick = () => {
    if (saving || !ls.sheetComplete(session, isCurrentTopic)) return;
    saving = true;
    // Answers only: nothing is marked until the list at the end is confirmed.
    const next = ls.completeSheet(makeCtx(student.id, lane), session);
    store.saveLevelsetSession(student.id, session.lane, { ...next, elapsedMs: sitting.base + (Date.now() - sitting.start) });
    toast(next.done ? 'Sheet saved. Check the list below, then confirm it.' : 'Sheet saved. Nothing is marked until you confirm at the end.', 'success');
  };
  return card;
}

function frontierCard(student, lane, session, navigate) {
  const d = getData();
  const f = session.frontier || { status: 'complete', ids: [], waitingOn: [], unsure: [] };
  const what = lane.label.toLowerCase();
  const copy = {
    ready: `These ${what} topics are where to start: you marked them Not yet, and everything they build on is known.`,
    blocked: f.waitingOn && f.waitingOn.length
      ? `No Not yet topic has all its foundations known yet: some wait on topics you marked Unsure. Check those by watching; until then, start with the youngest Not yet topics.`
      : `None of the Not yet topics has every foundation known (some depend on each other). Start with the youngest of them.`,
    unsure: `You marked nothing Not yet, so the topics you marked Unsure decide where to start. Check them by watching first.`,
    known: `Everything the workbook asked about is known or already mastered. These ${what} topics come next.`,
    complete: `Every ${what} topic is known or already mastered.`,
  }[f.status] || '';
  const card = el(`<div class="bg-paper-card border border-brand/30 rounded-2xl p-5">
    <h2 class="font-600 flex items-center gap-2 mb-1"><i data-lucide="flag" class="w-4.5 h-4.5 text-brand-dark"></i>${esc(lane.label)}: where to start</h2>
    <p class="ls-status text-sm text-ink-soft mb-3" data-status="${esc(f.status)}">${esc(copy)}</p>
    <div class="ls-front space-y-1.5"></div>
  </div>`);
  const list = card.querySelector('.ls-front');
  const row = (t, icon) => {
    const b = el(`<button class="w-full min-h-[44px] text-left flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper hover:border-brand/40 text-sm">
      <i data-lucide="${icon}" class="w-4 h-4 text-brand-dark shrink-0"></i><span class="flex-1 min-w-0 truncate">${esc(t.name)}</span><span class="text-xs text-ink-faint shrink-0">${esc(t.domain)}</span>
    </button>`);
    b.onclick = () => navigate('topic', { id: t.id });
    return b;
  };
  f.ids.map(id => d.byId.get(id)).filter(Boolean).forEach(t => list.appendChild(row(t, 'sprout')));
  if (f.waitingOn && f.waitingOn.length) {
    list.appendChild(el(`<p class="text-xs font-600 uppercase tracking-wide text-ink-faint pt-2">Check these first</p>`));
    f.waitingOn.map(id => d.byId.get(id)).filter(Boolean).forEach(t => list.appendChild(row(t, 'eye')));
  }
  return card;
}

// The one write: everything Yes marks mastered, by subject, confirmed as a
// single placement record; Unsure topics join the observation list.
function proposalCard(student, lane, session) {
  const d = getData();
  const wrap = el(`<div class="mt-5 bg-paper-card border border-paper-line rounded-2xl p-5"></div>`);
  if (session.placed) {
    const rec = store.recordsFor(student.id).find(r => r.id === session.placed.recordId);
    const undone = rec && rec.placement && rec.placement.undoneAt;
    wrap.appendChild(el(`<p class="ls-placed text-sm text-ink-soft"><i data-lucide="badge-check" class="w-4 h-4 inline text-brand-dark"></i> ${undone
      ? 'You confirmed this list, then undid it in Records. Change an answer below to confirm again.'
      : session.placed.count
        ? `Confirmed: ${esc(countLabel(session.placed.count, 'topic'))} marked mastered as one record. Undo it from Records.`
        : 'Confirmed. Nothing needed marking.'}</p>`));
    return wrap;
  }
  const p = ls.proposal(makeCtx(student.id, lane), session);
  const bySubject = new Map();
  p.master.map(id => d.byId.get(id)).filter(Boolean).forEach(t => {
    if (!bySubject.has(t.subject)) bySubject.set(t.subject, []);
    bySubject.get(t.subject).push(t);
  });
  wrap.appendChild(el(`<h2 class="font-600 mb-1">Confirm what to mark</h2>`));
  wrap.appendChild(el(`<p class="text-sm text-ink-soft mb-3">${p.master.length
    ? `Your Yes answers mark these topics mastered, with the foundations they build on, even in other subjects. Nothing is written until you confirm, and it is one record you can undo.`
    : 'None of your answers marks anything mastered.'}</p>`));
  const groups = el(`<div class="ls-proposal space-y-2 mb-3"></div>`);
  for (const [subject, topics] of bySubject) {
    groups.appendChild(el(`<details class="rounded-xl border border-paper-line bg-paper p-3" data-subject="${esc(subject)}">
      <summary class="cursor-pointer text-sm font-medium">${esc(subject)}: ${esc(countLabel(topics.length, 'topic'))}</summary>
      <ul class="mt-2 space-y-0.5">${topics.map(t => `<li class="text-sm text-ink-soft">${esc(t.name)} <span class="text-xs text-ink-faint">· ${esc(t.domain)}</span></li>`).join('')}</ul>
    </details>`));
  }
  wrap.appendChild(groups);
  if (p.unsure.length) wrap.appendChild(el(`<p class="text-xs text-ink-soft mb-3">${esc(countLabel(p.unsure.length, 'topic'))} you marked Unsure will wait for an observation check.</p>`));
  const label = p.master.length ? `Mark ${countLabel(p.master.length, 'topic')} mastered` : p.unsure.length ? 'Add them to the observation list' : 'Finish';
  const btn = el(`<button id="ls-confirm" class="w-full h-11 flex items-center justify-center gap-2 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm"><i data-lucide="check" class="w-4 h-4"></i>${esc(label)}</button>`);
  let busy = false;
  btn.onclick = () => {
    if (busy) return;
    busy = true;
    // Worked out again at confirm time, against current progress.
    const now = ls.proposal(makeCtx(student.id, lane), session);
    if (now.unsure.length) store.queueObservation(student.id, now.unsure, { quiet: true });
    let recordId = null;
    if (now.master.length) {
      const rec = store.applyPlacement(student.id, {
        topicIds: now.master,
        title: ls.levelsetTitle({ count: now.master.length, own: now.own, laneLabel: lane.label }),
        subject: lane.subject, domain: null, maxAge: now.level || null,
        levelset: { lane: session.lane },
      });
      recordId = rec ? rec.id : null;
    }
    store.saveLevelsetSession(student.id, session.lane, { ...session, placed: { recordId, at: Date.now(), count: now.master.length, queued: now.unsure } });
    toast(now.master.length ? `Marked ${countLabel(now.master.length, 'topic')} mastered. Undo it from Records.` : 'Done.', 'success');
  };
  wrap.appendChild(btn);
  return wrap;
}

function historyCard(student, lane, session) {
  const saved = session.sheets.map((s, i) => ({ s, i })).filter(x => x.s.savedAt);
  const wrap = el(`<div class="mt-5"></div>`);
  if (!saved.length) return wrap;
  wrap.appendChild(el(`<h2 class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2">Saved sheets</h2>`));
  const list = el(`<div class="space-y-2"></div>`);
  saved.forEach(({ s, i }) => {
    const count = (a) => s.ids.filter(id => session.answers[id] === a).length;
    const row = el(`<div class="flex items-center gap-3 p-3 rounded-xl border border-paper-line bg-paper-card text-sm">
      <span class="flex-1 min-w-0"><span class="block font-medium">${esc(ls.sheetTitle(s, lane.label))}</span>
      <span class="block text-xs text-ink-faint">${count('yes')} Yes · ${count('no')} Not yet · ${count('unsure')} Unsure</span></span>
      <button class="reopen shrink-0 h-11 px-3 text-xs font-medium text-brand-dark flex items-center gap-1"><i data-lucide="undo-2" class="w-3.5 h-3.5 shrink-0"></i>Change answers</button>
    </div>`);
    row.querySelector('.reopen').onclick = () => {
      const later = saved.filter(x => x.i > i).length;
      const parts = [];
      if (later) parts.push(`the ${countLabel(later, 'sheet')} after it ${later === 1 ? 'is' : 'are'} removed`);
      if (session.placed && session.placed.recordId) parts.push(`the ${countLabel(session.placed.count, 'topic')} you confirmed go back to how they were`);
      if (parts.length && !confirm(`Change your answers on this sheet? ${parts.join(', and ')}.`)) return;
      const { session: reopened, recordIds } = ls.reopenSheet(session, i);
      recordIds.forEach(id => store.undoPlacement(student.id, id));
      const queued = (session.placed && session.placed.queued) || [];
      if (queued.length) store.unqueueObservation(student.id, queued, { quiet: true });
      store.saveLevelsetSession(student.id, session.lane, reopened);
      toast(recordIds.length ? 'Sheet open again. The confirmed marks were undone.' : 'Sheet open again.', 'success');
    };
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

// Topics marked Unsure, waiting for an observation check on their topic page.
function queueCard(student, navigate) {
  const d = getData();
  const queued = store.levelsetFor(student.id).observe.map(id => d.byId.get(id)).filter(Boolean);
  const wrap = el(`<div class="mt-5"></div>`);
  if (!queued.length) return wrap;
  wrap.appendChild(el(`<h2 class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1">Waiting for an observation check</h2>`));
  wrap.appendChild(el(`<p class="text-xs text-ink-soft mb-2">You marked these Unsure. Open one and use “Check mastery by observation” while you watch.</p>`));
  const list = el(`<div class="space-y-1.5"></div>`);
  queued.forEach(t => {
    const row = el(`<button class="w-full min-h-[44px] text-left flex items-center gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper-card hover:border-brand/40 text-sm">
      <i data-lucide="eye" class="w-4 h-4 text-[#8a6412] shrink-0"></i><span class="flex-1 min-w-0 truncate">${esc(t.name)}</span><span class="text-xs text-ink-faint shrink-0">${esc(t.subject)} · age ${topicAge(t)}</span>
    </button>`);
    row.onclick = () => navigate('topic', { id: t.id });
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

// A print-friendly copy of the current sheet: tick boxes to fill in by hand.
function printSheet(student, lane, sheet, rows) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const body = rows.map(r => `<div class="row">
    <div class="t">${esc(r.name)} <span class="d">${esc(r.domain)}</span></div>
    ${r.prompts.map(p => `<div class="p">${esc(p)}</div>`).join('')}
    <div class="a"><span>&#9744; Yes</span><span>&#9744; Not yet</span><span>&#9744; Unsure</span></div>
  </div>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(ls.sheetTitle(sheet, lane.label))}</title>
  <style>
    body{font-family:Georgia,'Times New Roman',serif;color:#2e2a24;max-width:780px;margin:0 auto;padding:40px 48px;line-height:1.45}
    h1{font-size:22px;margin:0 0 4px} .sub{color:#6b665d;font-size:13px;margin-bottom:18px}
    .row{border-bottom:1px solid #e6dfd0;padding:10px 0;break-inside:avoid}
    .t{font-weight:700;font-size:15px} .d{font-weight:400;color:#6b665d;font-size:12px;margin-left:6px}
    .p{font-size:14px;margin-top:2px} .a{margin-top:6px;font-size:14px;display:flex;gap:28px}
    footer{margin-top:24px;font-size:11px;color:#6f665a}
    @media print{body{padding:0.5in}}
  </style></head><body>
    <h1>${esc(ls.sheetTitle(sheet, lane.label))}</h1>
    <div class="sub">${esc(student.name)} &middot; ${esc(date)} &middot; Tick one box per topic, then enter the answers in the workbook.</div>
    ${body}
    <footer>Harrington level-set workbook. Topics from the Marble Skill Taxonomy (CC BY-SA 4.0).</footer>
    <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
  </body></html>`);
  w.document.close();
}
