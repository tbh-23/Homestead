import { SUBJECTS } from '../data.js';
import * as store from '../store.js';
import { el, refreshIcons, toast, openModal } from '../ui.js';
import { aiPrintables } from '../ai.js';

const TYPE_META = {
  worksheet: { icon: 'file-text', label: 'Worksheet' },
  flashcards: { icon: 'layers', label: 'Flashcards' },
  matching: { icon: 'arrow-left-right', label: 'Matching' },
  tracing: { icon: 'pen-line', label: 'Tracing' },
  sorting: { icon: 'group', label: 'Sorting cards' },
};

export async function openPrintables(topic) {
  const student = store.activeStudent();
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-start gap-3 z-10">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:${SUBJECTS[topic.subject].color}18"><i data-lucide="printer" class="w-5 h-5" style="color:${SUBJECTS[topic.subject].color}"></i></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-faint">Print &amp; go · ${topic.subject}</p>
        <h3 class="font-display text-lg font-600 leading-tight">${topic.name}</h3>
      </div>
    </div>
    <div id="stage" class="px-5 py-5"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body, { wide: true });

  stage.appendChild(loadingBlock('Preparing the easiest print-and-go materials\u2026', 'Made once, then saved for reuse.'));
  refreshIcons();

  const cacheId = 'print:' + topic.id;
  try {
    let data = await store.getCachedLesson(cacheId);
    if (!data) {
      data = await aiPrintables(topic, student?.name);
      await store.saveCachedLesson(cacheId, data);
    }
    const printables = (data && data.printables) || [];
    stage.innerHTML = '';
    if (!printables.length) { stage.appendChild(el(`<p class="text-sm text-ink-soft py-6 text-center">No printable materials for this topic.</p>`)); refreshIcons(); return; }

    const intro = el(`<p class="text-sm text-ink-soft mb-4 leading-relaxed">These are the lowest-prep materials for this topic — press print, and (where noted) cut along the lines. Nothing else to prepare.</p>`);
    stage.appendChild(intro);

    const listWrap = el(`<div class="space-y-3"></div>`);
    printables.forEach(p => listWrap.appendChild(printableCard(topic, p)));
    stage.appendChild(listWrap);

    // print all
    const all = el(`<button id="printall" class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors"><i data-lucide="printer" class="w-4 h-4"></i>Print all materials</button>`);
    all.onclick = () => printMaterials(topic, printables);
    stage.appendChild(all);
    refreshIcons();
  } catch (e) {
    console.error(e);
    stage.innerHTML = '';
    const err = el(`<div class="text-center py-10">
      <i data-lucide="cloud-off" class="w-8 h-8 text-ink-faint mx-auto mb-3"></i>
      <p class="text-sm text-ink-soft mb-3">Couldn\u2019t prepare the materials right now.</p>
      <button id="r" class="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">Try again</button>
    </div>`);
    err.querySelector('#r').onclick = () => { m.close(); openPrintables(topic); };
    stage.appendChild(err);
    refreshIcons();
  }
}

function printableCard(topic, p) {
  const meta = TYPE_META[p.type] || { icon: 'file', label: 'Printable' };
  const card = el(`<div class="rounded-xl border border-paper-line bg-paper p-3.5 flex items-start gap-3">
    <span class="w-9 h-9 rounded-lg bg-paper-card border border-paper-line flex items-center justify-center shrink-0"><i data-lucide="${meta.icon}" class="w-4.5 h-4.5 text-brand-dark"></i></span>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <p class="font-600 text-sm">${esc(p.title || meta.label)}</p>
        <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-paper-card border border-paper-line text-ink-faint">${meta.label}</span>
      </div>
      ${p.forParent ? `<p class="text-xs text-ink-soft mt-1 leading-relaxed">${esc(p.forParent)}</p>` : ''}
      <div class="flex gap-3 mt-2.5">
        <button class="prev flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink"><i data-lucide="eye" class="w-3.5 h-3.5"></i>Preview</button>
        <button class="print flex items-center gap-1.5 text-xs font-medium text-brand-dark"><i data-lucide="printer" class="w-3.5 h-3.5"></i>Print</button>
      </div>
      <div class="preview mt-3 hidden"></div>
    </div>
  </div>`);
  const previewBox = card.querySelector('.preview');
  card.querySelector('.prev').onclick = (e) => {
    const btn = e.currentTarget;
    if (previewBox.classList.contains('hidden')) {
      previewBox.innerHTML = `<div class="rounded-lg border border-paper-line bg-white p-3 text-xs text-ink-soft overflow-x-auto">${previewHtml(p)}</div>`;
      previewBox.classList.remove('hidden');
      btn.innerHTML = '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>Hide';
    } else {
      previewBox.classList.add('hidden');
      btn.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i>Preview';
    }
    refreshIcons();
  };
  card.querySelector('.print').onclick = () => printMaterials(topic, [p]);
  return card;
}

// ---- helpers ----
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function loadingBlock(title, sub) {
  return el(`<div class="text-center py-10">
    <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
    <p class="text-sm font-600">${title}</p>
    ${sub ? `<p class="text-xs text-ink-faint mt-1 max-w-xs mx-auto">${sub}</p>` : ''}
  </div>`);
}

// Small in-app preview (condensed)
function previewHtml(p) {
  const c = p.content || {};
  switch (p.type) {
    case 'worksheet':
      return `${c.intro ? `<p class="mb-1 italic">${esc(c.intro)}</p>` : ''}<ol class="ml-4 list-decimal space-y-0.5">${(c.problems || []).slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')}</ol>${(c.problems || []).length > 5 ? `<p class="text-ink-faint mt-1">+${c.problems.length - 5} more</p>` : ''}`;
    case 'flashcards':
      return `<div class="grid grid-cols-2 gap-1.5">${(c.cards || []).slice(0, 4).map(cd => `<div class="border border-paper-line rounded p-1.5"><b>${esc(cd.front)}</b> → ${esc(cd.back)}</div>`).join('')}</div>`;
    case 'matching':
      return `<div class="space-y-0.5">${(c.pairs || []).slice(0, 5).map(pr => `<div class="flex justify-between gap-3"><span>${esc(pr.left)}</span><span class="text-ink-faint">${esc(pr.right)}</span></div>`).join('')}</div>`;
    case 'tracing':
      return `<div class="flex flex-wrap gap-2" style="font-family:Georgia,serif">${(c.items || []).slice(0, 6).map(x => `<span style="color:#cfc8bb;font-size:18px;letter-spacing:2px">${esc(x)}</span>`).join('')}</div>`;
    case 'sorting':
      return `<p class="mb-1"><b>${(c.categories || []).map(esc).join('</b> · <b>')}</b></p><div class="flex flex-wrap gap-1.5">${(c.items || []).slice(0, 8).map(it => `<span class="border border-paper-line rounded px-1.5 py-0.5">${esc(it.text)}</span>`).join('')}</div>`;
    default: return '';
  }
}

// ---- Full-page print ----
function printMaterials(topic, printables) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  const pages = printables.map(p => renderPrintPage(p)).join('<div style="page-break-after:always"></div>');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(topic.name)} — Printables</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1c1a17;margin:0;padding:28px 32px;line-height:1.5}
    h1{font-size:22px;margin:0 0 2px}
    .hd{border-bottom:2px solid #1c1a17;padding-bottom:8px;margin-bottom:18px}
    .hd .meta{font-size:12px;color:#8a847a}
    .name-line{display:flex;justify-content:space-between;font-size:12px;color:#8a847a;margin-bottom:16px}
    .name-line span{border-bottom:1px solid #c9c3b8;min-width:120px;display:inline-block}
    .instr{font-style:italic;color:#4a4640;margin-bottom:14px}
    ol.ws{margin:0;padding-left:22px}
    ol.ws li{margin-bottom:20px;font-size:15px}
    .ans{margin-top:24px;padding-top:10px;border-top:1px dashed #c9c3b8;font-size:12px;color:#8a847a}
    .cards{display:grid;grid-template-columns:1fr 1fr;gap:0}
    .card{border:1px dashed #999;min-height:150px;padding:12px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
    .card .front{font-size:22px;font-weight:700}
    .card .back{font-size:14px;color:#4a4640;margin-top:8px}
    table.match{width:100%;border-collapse:collapse}
    table.match td{padding:14px 10px;font-size:16px;vertical-align:middle}
    table.match td.dot{width:16px;text-align:center;color:#999}
    table.match td.r{text-align:right}
    .trace{font-family:Georgia,serif;font-size:48px;letter-spacing:6px;color:#d9d3c7;line-height:2.1;border-bottom:1px dashed #d9d3c7}
    .sort-cats{display:flex;gap:12px;margin-bottom:18px}
    .sort-cat{flex:1;border:2px solid #1c1a17;border-radius:8px;padding:10px;min-height:120px}
    .sort-cat h3{margin:0 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.04em}
    .chips{display:flex;flex-wrap:wrap;gap:8px}
    .chip{border:1px dashed #999;border-radius:6px;padding:8px 12px;font-size:15px}
    h2.sub{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#4a4640;margin:0 0 10px}
    @media print{body{padding:0.5in}}
  </style></head><body>
  ${pages}
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
  </body></html>`);
  w.document.close();
}

function pageHeader(p, topic) {
  const meta = TYPE_META[p.type] || { label: 'Printable' };
  return `<div class="hd"><h1>${esc(p.title || meta.label)}</h1><div class="meta">${esc(topic.name)} &middot; ${esc(topic.subject)} &middot; Ages ${topic.ageRangeStart}–${topic.ageRangeEnd}</div></div>
  <div class="name-line"><div>Name: <span></span></div><div>Date: <span></span></div></div>`;
}

function renderPrintPage(p) {
  const c = p.content || {};
  const hdr = `<div class="hd"><h1>${esc(p.title || (TYPE_META[p.type]||{}).label || 'Printable')}</h1></div>
  <div class="name-line"><div>Name: <span></span></div><div>Date: <span></span></div></div>`;
  switch (p.type) {
    case 'worksheet':
      return hdr +
        (c.intro ? `<p class="instr">${esc(c.intro)}</p>` : '') +
        `<ol class="ws">${(c.problems || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>` +
        (c.answers && c.answers.length ? `<div class="ans"><strong>Answer key:</strong> ${c.answers.map((a, i) => `${i + 1}. ${esc(a)}`).join('&nbsp;&nbsp; ')}</div>` : '');
    case 'flashcards':
      return hdr + `<p class="instr">Cut along the dashed lines. Fold or use front/back.</p>` +
        `<div class="cards">${(c.cards || []).map(cd => `<div class="card"><div class="front">${esc(cd.front)}</div><div class="back">${esc(cd.back)}</div></div>`).join('')}</div>`;
    case 'matching':
      return hdr + `<p class="instr">Draw a line from each item on the left to its match on the right.</p>` +
        `<table class="match"><tbody>${(c.pairs || []).map(pr => `<tr><td class="l">${esc(pr.left)}</td><td class="dot">&bull;</td><td class="dot">&bull;</td><td class="r">${esc(pr.right)}</td></tr>`).join('')}</tbody></table>`;
    case 'tracing':
      return hdr + `<p class="instr">Trace over each one, then try writing it yourself.</p>` +
        (c.items || []).map(x => `<div class="trace">${esc(x)}</div>`).join('');
    case 'sorting':
      return hdr + `<p class="instr">Cut out the cards below and sort them into the right box.</p>` +
        `<div class="sort-cats">${(c.categories || []).map(cat => `<div class="sort-cat"><h3>${esc(cat)}</h3></div>`).join('')}</div>` +
        `<h2 class="sub">Cut these out</h2><div class="chips">${(c.items || []).map(it => `<span class="chip">${esc(it.text)}</span>`).join('')}</div>`;
    default:
      return hdr;
  }
}
