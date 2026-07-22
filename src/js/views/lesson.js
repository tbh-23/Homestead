import { SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast, openModal } from '../ui.js';
import { aiLesson, aiActivityDetail } from '../ai.js';
import { openPrintables } from './printables.js';

// ---- Full lesson plan modal ----
export async function openLesson(topic) {
  const student = store.activeStudent();
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-start gap-3 z-10">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:${SUBJECTS[topic.subject].color}18"><i data-lucide="notebook-text" class="w-5 h-5" style="color:${SUBJECTS[topic.subject].color}"></i></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-faint">Lesson plan · ${topic.subject}</p>
        <h3 class="font-display text-lg font-600 leading-tight">${topic.name}</h3>
      </div>
      <button id="print" class="hidden sm:flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink shrink-0"><i data-lucide="printer" class="w-4 h-4"></i>Print</button>
    </div>
    <div id="stage" class="px-5 py-5"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });

  const printBtn = body.querySelector('#print');
  printBtn.onclick = () => printLesson(topic, currentLesson);
  let currentLesson = null;

  // loading state
  stage.appendChild(loadingBlock(`Building a full lesson for ${topic.name}\u2026`, 'This takes a few seconds the first time. It\u2019s then saved for reuse.'));
  refreshIcons();

  const cacheId = 'topic:' + topic.id;

  const regen = async () => {
    stage.innerHTML = '';
    stage.appendChild(loadingBlock('Writing a fresh version\u2026', ''));
    refreshIcons();
    try {
      const fresh = await aiLesson(topic, student?.name);
      await store.saveCachedLesson(cacheId, fresh);
      currentLesson = fresh;
      stage.innerHTML = '';
      stage.appendChild(renderLesson(fresh, topic, regen));
      refreshIcons();
    } catch { toast('Could not regenerate', 'error'); }
  };

  try {
    let lesson = await store.getCachedLesson(cacheId);
    if (!lesson) {
      lesson = await aiLesson(topic, student?.name);
      await store.saveCachedLesson(cacheId, lesson);
    }
    currentLesson = lesson;
    stage.innerHTML = '';
    stage.appendChild(renderLesson(lesson, topic, regen));
    refreshIcons();
  } catch (e) {
    console.error(e);
    stage.innerHTML = '';
    stage.appendChild(errorBlock(() => { m.close(); openLesson(topic); }));
    refreshIcons();
  }
}

function renderLesson(L, topic, onRegen) {
  const wrap = el(`<div class="space-y-5 fade-up"></div>`);

  // meta row
  wrap.appendChild(el(`<div class="flex flex-wrap gap-2 text-xs">
    ${L.objective ? `<span class="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-brand-light text-brand-dark font-medium max-w-full"><i data-lucide="target" class="w-4 h-4 shrink-0 mt-px"></i><span>${esc(L.objective)}</span></span>` : ''}
    ${L.duration ? `<span class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-paper border border-paper-line text-ink-soft"><i data-lucide="clock" class="w-4 h-4"></i>${esc(L.duration)}</span>` : ''}
  </div>`));

  if (L.materials && L.materials.length) {
    wrap.appendChild(block('package', 'What you\u2019ll need', el(`<div class="flex flex-wrap gap-2">${L.materials.map(m => `<span class="text-sm px-2.5 py-1 rounded-lg bg-paper border border-paper-line text-ink-soft">${esc(m)}</span>`).join('')}</div>`)));
  }

  // Parent tips — focus / struggles / advice
  const tips = L.parentTips;
  if (tips && (tips.focus || tips.struggles || tips.advice)) {
    const tipRow = (icon, color, label, text) => text ? `<div class="flex gap-2.5">
      <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${color}18"><i data-lucide="${icon}" class="w-4 h-4" style="color:${color}"></i></span>
      <div><p class="text-xs font-600" style="color:${color}">${label}</p><p class="text-sm text-ink-soft leading-relaxed mt-0.5">${esc(text)}</p></div>
    </div>` : '';
    wrap.appendChild(el(`<div class="rounded-2xl border border-[#e6cbae] bg-[#fbf4ea] p-4">
      <p class="text-xs font-600 uppercase tracking-wide text-[#a86a2e] mb-3 flex items-center gap-1.5"><i data-lucide="heart-handshake" class="w-3.5 h-3.5"></i>Notes for you (the parent)</p>
      <div class="space-y-3">
        ${tipRow('crosshair', '#3f7d5e', 'What to focus on', tips.focus)}
        ${tipRow('life-buoy', '#b0603a', 'Where they may struggle', tips.struggles)}
        ${tipRow('message-circle-heart', '#7a5a9e', 'Advice', tips.advice)}
      </div>
    </div>`));
  }

  if (L.hook) wrap.appendChild(block('sparkles', 'Get started (hook)', el(`<p class="text-sm text-ink-soft leading-relaxed">${esc(L.hook)}</p>`)));

  if (L.teach && L.teach.length) {
    const steps = el(`<div class="space-y-3"></div>`);
    L.teach.forEach((s, i) => steps.appendChild(el(`<div class="flex gap-3">
      <span class="w-6 h-6 rounded-full bg-brand text-white text-xs font-700 flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
      <div class="flex-1">
        ${s.title ? `<p class="font-600 text-sm">${esc(s.title)}</p>` : ''}
        ${s.say ? `<p class="text-sm text-ink-soft mt-1 leading-relaxed"><span class="inline-flex items-center gap-1 text-xs font-medium text-brand-dark mr-1"><i data-lucide="quote" class="w-3 h-3"></i>Say:</span>${esc(s.say)}</p>` : ''}
        ${s.do ? `<p class="text-sm text-ink-soft mt-1 leading-relaxed"><span class="inline-flex items-center gap-1 text-xs font-medium text-[#c08a2e] mr-1"><i data-lucide="hand" class="w-3 h-3"></i>Do:</span>${esc(s.do)}</p>` : ''}
      </div>
    </div>`)));
    wrap.appendChild(block('presentation', 'Teach it step by step', steps));
  }

  if (L.guidedPractice && L.guidedPractice.length) {
    wrap.appendChild(block('users', 'Practice together', list(L.guidedPractice)));
  }

  if (L.independentActivity) {
    const ia = L.independentActivity;
    const inner = el(`<div>${ia.title ? `<p class="font-600 text-sm mb-1.5">${esc(ia.title)}</p>` : ''}</div>`);
    if (ia.steps && ia.steps.length) inner.appendChild(orderedList(ia.steps));
    wrap.appendChild(block('pencil', 'Child works on their own', inner));
  }

  if (L.questions && L.questions.length) {
    wrap.appendChild(block('message-circle-question', 'Discussion & check questions', list(L.questions)));
  }

  if (L.commonMistakes && L.commonMistakes.length) {
    wrap.appendChild(block('alert-triangle', 'Watch out for', list(L.commonMistakes)));
  }

  if (L.masteryCheck) {
    wrap.appendChild(el(`<div class="rounded-xl border border-brand/30 bg-brand-light/60 p-4">
      <p class="text-sm font-600 text-brand-dark flex items-center gap-1.5 mb-1"><i data-lucide="badge-check" class="w-4 h-4"></i>Mastery check</p>
      <p class="text-sm text-ink-soft leading-relaxed">${esc(L.masteryCheck)}</p>
    </div>`));
  }

  if (L.extension) {
    wrap.appendChild(block('rocket', 'Ready for more?', el(`<p class="text-sm text-ink-soft leading-relaxed">${esc(L.extension)}</p>`)));
  }

  // print-and-go materials shortcut
  wrap.appendChild((() => {
    const b = el(`<button class="w-full flex items-center gap-3 p-3.5 rounded-xl border border-brand/30 bg-brand-light/50 hover:bg-brand-light transition-colors text-left">
      <span class="w-9 h-9 rounded-lg bg-paper-card border border-brand/20 flex items-center justify-center shrink-0"><i data-lucide="printer" class="w-4.5 h-4.5 text-brand-dark"></i></span>
      <span class="flex-1"><span class="block font-600 text-sm">Print &amp; go materials</span><span class="block text-xs text-ink-soft">Ready-to-print worksheets and cards — the lowest-prep option.</span></span>
      <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint"></i>
    </button>`);
    b.onclick = () => openPrintables(topic);
    return b;
  })());

  // footer actions
  const footer = el(`<div class="flex items-center justify-between gap-2 pt-2 border-t border-paper-line">
    <button id="regen" class="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"><i data-lucide="refresh-cw" class="w-4 h-4"></i>Generate a different version</button>
    <button id="printm" class="sm:hidden flex items-center gap-1.5 text-sm text-brand-dark font-medium"><i data-lucide="printer" class="w-4 h-4"></i>Print</button>
  </div>`);
  footer.querySelector('#regen').onclick = onRegen;
  footer.querySelector('#printm').onclick = () => printLesson(topic, L);
  wrap.appendChild(footer);

  return wrap;
}

// ---- Activity / game detail modal ----
export async function openActivityDetail(topic, activity, kind) {
  const body = el(`<div class="p-5">
    <div class="flex items-start gap-3 mb-4">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="${activity.icon || 'lightbulb'}" class="w-5 h-5 text-brand-dark"></i></span>
      <div>
        <p class="text-xs text-ink-faint capitalize">${kind} · ${topic.name}</p>
        <h3 class="font-display text-lg font-600 leading-tight">${activity.title}</h3>
      </div>
    </div>
    <div id="stage"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body);
  stage.appendChild(loadingBlock('Writing step-by-step instructions\u2026', ''));
  refreshIcons();

  const cacheId = `act:${topic.id}:${kind}:${activity.title}`;
  try {
    let detail = await store.getCachedLesson(cacheId);
    if (!detail) {
      detail = await aiActivityDetail(topic, activity, kind);
      await store.saveCachedLesson(cacheId, detail);
    }
    stage.innerHTML = '';
    const wrap = el(`<div class="space-y-4 fade-up"></div>`);
    wrap.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed">${esc(activity.body)}</p>`));
    if (detail.materials && detail.materials.length) wrap.appendChild(block('package', 'You\u2019ll need', el(`<div class="flex flex-wrap gap-2">${detail.materials.map(x => `<span class="text-sm px-2.5 py-1 rounded-lg bg-paper border border-paper-line text-ink-soft">${esc(x)}</span>`).join('')}</div>`)));
    if (detail.setup) wrap.appendChild(block('settings-2', 'Set up', el(`<p class="text-sm text-ink-soft leading-relaxed">${esc(detail.setup)}</p>`)));
    if (detail.steps && detail.steps.length) wrap.appendChild(block('list-ordered', 'How to play', orderedList(detail.steps)));
    if (detail.example) wrap.appendChild(el(`<div class="rounded-xl bg-paper border border-paper-line p-3.5"><p class="text-xs font-600 text-ink-faint uppercase tracking-wide mb-1">Example</p><p class="text-sm text-ink-soft leading-relaxed">${esc(detail.example)}</p></div>`));
    if (detail.tip) wrap.appendChild(el(`<div class="flex gap-2 text-sm text-ink-soft"><i data-lucide="lightbulb" class="w-4 h-4 text-[#c08a2e] shrink-0 mt-0.5"></i><span>${esc(detail.tip)}</span></div>`));
    stage.appendChild(wrap);
    refreshIcons();
  } catch (e) {
    console.error(e);
    stage.innerHTML = '';
    stage.appendChild(errorBlock(() => { m.close(); openActivityDetail(topic, activity, kind); }));
    refreshIcons();
  }
}

// ---- helpers ----
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function block(icon, title, contentEl) {
  const b = el(`<div><p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-2 flex items-center gap-1.5"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${title}</p><div class="body"></div></div>`);
  b.querySelector('.body').appendChild(contentEl);
  return b;
}
function list(items) {
  return el(`<ul class="space-y-1.5">${items.map(i => `<li class="flex gap-2 text-sm text-ink-soft leading-relaxed"><i data-lucide="dot" class="w-4 h-4 text-brand shrink-0 mt-0.5"></i><span>${esc(i)}</span></li>`).join('')}</ul>`);
}
function orderedList(items) {
  return el(`<ol class="space-y-2">${items.map((i, n) => `<li class="flex gap-2.5 text-sm text-ink-soft leading-relaxed"><span class="w-5 h-5 rounded-full bg-paper-line text-ink-soft text-[11px] font-700 flex items-center justify-center shrink-0 mt-0.5">${n + 1}</span><span>${esc(i)}</span></li>`).join('')}</ol>`);
}
function loadingBlock(title, sub) {
  return el(`<div class="text-center py-10">
    <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-sm font-600">${title}</p>
    ${sub ? `<p class="text-xs text-ink-faint mt-1 max-w-xs mx-auto">${sub}</p>` : ''}
  </div>`);
}
function errorBlock(retry) {
  const b = el(`<div class="text-center py-10">
    <i data-lucide="cloud-off" class="w-8 h-8 text-ink-faint mx-auto mb-3"></i>
    <p class="text-sm text-ink-soft mb-3">Couldn\u2019t create the lesson right now.</p>
    <button id="r" class="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">Try again</button>
  </div>`);
  b.querySelector('#r').onclick = retry;
  return b;
}

// ---- Printable lesson ----
function printLesson(topic, L) {
  if (!L) return;
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  const sec = (title, html) => html ? `<h2>${title}</h2>${html}` : '';
  const ul = arr => arr && arr.length ? `<ul>${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  const ol = arr => arr && arr.length ? `<ol>${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ol>` : '';
  const teach = (L.teach || []).map((s, i) => `<div class="step"><strong>${i + 1}. ${esc(s.title || '')}</strong>${s.say ? `<p><em>Say:</em> ${esc(s.say)}</p>` : ''}${s.do ? `<p><em>Do:</em> ${esc(s.do)}</p>` : ''}</div>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(topic.name)} — Lesson</title>
  <style>
    body{font-family:Georgia,serif;max-width:720px;margin:32px auto;padding:0 20px;color:#1c1a17;line-height:1.55}
    h1{font-size:26px;margin-bottom:4px}
    .sub{color:#8a847a;font-size:13px;margin-bottom:20px}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#3f7d5e;margin:22px 0 6px;border-bottom:1px solid #ece7dd;padding-bottom:4px}
    .obj{background:#e7f0ea;padding:10px 14px;border-radius:8px;font-size:15px}
    .tips{background:#fbf4ea;padding:10px 14px;border-radius:8px}
    .tips p{margin:4px 0}
    .step{margin-bottom:10px}
    ul,ol{margin:6px 0 6px 20px}
    li{margin-bottom:4px}
    p{margin:4px 0}
    @media print{body{margin:0}}
  </style></head><body>
    <h1>${esc(topic.name)}</h1>
    <div class="sub">${esc(topic.subject)} &middot; ${esc(topic.domain)} &middot; Ages ${topic.ageRangeStart}–${topic.ageRangeEnd}${L.duration ? ' &middot; ' + esc(L.duration) : ''}</div>
    ${L.objective ? `<div class="obj"><strong>Objective:</strong> ${esc(L.objective)}</div>` : ''}
    ${L.parentTips && (L.parentTips.focus || L.parentTips.struggles || L.parentTips.advice) ? sec('Notes for the parent', `<div class="tips">${L.parentTips.focus ? `<p><strong>Focus on:</strong> ${esc(L.parentTips.focus)}</p>` : ''}${L.parentTips.struggles ? `<p><strong>Likely struggles:</strong> ${esc(L.parentTips.struggles)}</p>` : ''}${L.parentTips.advice ? `<p><strong>Advice:</strong> ${esc(L.parentTips.advice)}</p>` : ''}</div>`) : ''}
    ${sec('Materials', ul(L.materials))}
    ${sec('Get started', L.hook ? `<p>${esc(L.hook)}</p>` : '')}
    ${sec('Teach it', teach)}
    ${sec('Practice together', ul(L.guidedPractice))}
    ${L.independentActivity ? sec('Independent activity', `<p><strong>${esc(L.independentActivity.title || '')}</strong></p>${ol(L.independentActivity.steps)}`) : ''}
    ${sec('Questions', ul(L.questions))}
    ${sec('Watch out for', ul(L.commonMistakes))}
    ${sec('Mastery check', L.masteryCheck ? `<p>${esc(L.masteryCheck)}</p>` : '')}
    ${sec('Extension', L.extension ? `<p>${esc(L.extension)}</p>` : '')}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`);
  w.document.close();
}
