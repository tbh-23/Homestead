import * as store from '../store.js';
import { getData, subjectMeta } from '../data.js';
import { el, esc, analysisHtml, refreshIcons, toast, openModal, fmtDateTime } from '../ui.js';
import { countLabel } from '../format.js';
import { audioPlayer, openRecorder } from '../recorder.js';
import { aiDiscussionAnalysis } from '../ai.js';
import { aiErrorBlock, gateAi } from '../ai-status.js';

// The general recordings folder — all voice recordings, grouped by section or topic.
export function openRecordingsLibrary() {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  const d = getData();

  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-center gap-3 z-10">
      <span class="w-9 h-9 rounded-lg bg-[#a4473a]/10 flex items-center justify-center shrink-0"><i data-lucide="folder" class="w-5 h-5 text-[#a4473a]"></i></span>
      <div class="flex-1 min-w-0">
        <h3 class="font-display text-lg font-600 leading-tight">Recordings</h3>
        <p class="text-xs text-ink-faint">Every voice recording for ${esc(student.name)}, grouped by section or topic</p>
      </div>
      <button id="new" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#a4473a] hover:bg-[#86372c] text-white text-sm font-medium transition-colors"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
    </div>
    <div id="body" class="px-5 py-4"></div>
  </div>`);
  const bodyWrap = body.querySelector('#body');
  const m = openModal(body, { wide: true });
  body.querySelector('#new').onclick = () => { m.close(); openRecorder(student.id); };

  const render = () => {
    bodyWrap.innerHTML = '';
    const recs = store.recordingsFor(student.id);
    if (recs.length === 0) {
      bodyWrap.appendChild(el(`<div class="text-center py-12 text-ink-faint">
        <i data-lucide="mic-off" class="w-10 h-10 mx-auto mb-3"></i>
        <p class="text-sm">No recordings yet. Tap <span class="font-600">Record</span> to capture your first lesson conversation.</p>
      </div>`));
      refreshIcons();
      return;
    }

    const groups = groupRecordings(recs, d.byId);
    bodyWrap.appendChild(el(`<p class="text-xs text-ink-faint mb-3">${esc(countLabel(recs.length, 'recording'))} in ${esc(countLabel(groups.length, 'group'))}.</p>`));

    for (const g of groups) {
      // The "Not linked to a section" group has no subject: a plain folder.
      const meta = g.subject ? subjectMeta(g.subject) : { color: '#6f665a', icon: 'folder' };
      const groupEl = el(`<div class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style="background:${esc(meta.color)}18"><i data-lucide="${esc(meta.icon)}" class="w-3.5 h-3.5" style="color:${esc(meta.color)}"></i></span>
          <p class="text-sm font-600">${esc(g.label)}</p>
          <span class="text-xs text-ink-faint">${esc(g.items.length)}</span>
        </div>
        <div class="list space-y-2.5 pl-1"></div>
      </div>`);
      const listEl = groupEl.querySelector('.list');
      g.items.forEach(r => listEl.appendChild(recordingCard(r, student, render)));
      bodyWrap.appendChild(groupEl);
    }
    refreshIcons();
  };
  render();
}

// Groups recordings by section, then by topic for those without one; the rest
// share one "Not linked to a section" group. Labels never come from an
// unrelated record: a section group uses the first stored sectionLabel, else
// one derived from its id (subject|domain|age).
export function groupRecordings(recs, byId = new Map()) {
  const groups = new Map();
  recs.forEach(r => {
    const key = r.sectionId ? `section:${r.sectionId}` : r.topicId ? `topic:${r.topicId}` : 'unfiled';
    if (!groups.has(key)) groups.set(key, { key, label: '', subject: null, items: [] });
    const g = groups.get(key);
    g.items.push(r);
    if (!g.label) {
      if (r.sectionId) g.label = r.sectionLabel || '';
      else if (r.topicId) g.label = r.topicName || byId.get(r.topicId)?.name || '';
    }
    g.subject = g.subject || r.subject || (r.topicId ? byId.get(r.topicId)?.subject : null) || null;
  });
  for (const g of groups.values()) {
    if (g.label) continue;
    if (g.key.startsWith('section:')) {
      const parts = g.key.slice('section:'.length).split('|');
      g.subject = g.subject || parts[0] || null;
      g.label = parts.length >= 3 ? `${parts.slice(1, -1).join('|')} · Age ${parts[parts.length - 1]}` : parts.join(' · ');
    } else if (g.key.startsWith('topic:')) g.label = 'Linked topic';
    else g.label = 'Not linked to a section';
  }
  return [...groups.values()];
}

function recordingCard(r, student, rerender) {
  const d = getData();
  const topic = r.topicId ? d.byId.get(r.topicId) : null;
  const card = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <div class="flex items-center gap-2 text-xs mb-1">
      <span class="flex items-center gap-1 font-600 text-[#a4473a]"><i data-lucide="mic" class="w-3.5 h-3.5"></i>Recording</span>
      <span class="text-ink-faint ml-auto">${esc(fmtDateTime(r.createdAt))}</span>
      <button class="del text-ink-faint hover:text-[#a4473a] w-11 h-11 -my-[13px] -mr-[13px] flex items-center justify-center shrink-0 lg:w-auto lg:h-auto lg:m-0 lg:p-0.5" title="Delete recording" aria-label="Delete recording ${esc(r.title || fmtDateTime(r.createdAt))}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>
    ${r.title ? `<p class="font-600 text-sm">${esc(r.title)}</p>` : ''}
    ${r.topicName ? `<p class="text-[11px] text-ink-faint mt-0.5">on ${esc(r.topicName)}</p>` : ''}
    ${r.note ? `<p class="text-sm text-ink-soft mt-1 leading-relaxed whitespace-pre-wrap">${esc(r.note)}</p>` : ''}
    ${r.transcript ? `<details class="mt-2 group"><summary class="text-xs text-ink-faint cursor-pointer select-none flex items-center gap-1 list-none"><i data-lucide="chevron-right" class="w-3.5 h-3.5 transition-transform group-open:rotate-90"></i>Transcript</summary><p class="text-sm text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap bg-paper-card border border-paper-line rounded-lg p-2.5">${esc(r.transcript)}</p></details>` : ''}
    <div class="analyzewrap mt-2"></div>
  </div>`);
  if (r.audioPath) card.appendChild(audioPlayer(r.audioPath, r.duration));

  // Analysis (saved on the recording) + button to (re)generate it.
  const aw = card.querySelector('.analyzewrap');
  renderAnalysis(aw, r, student, topic);

  card.querySelector('.del').onclick = () => { if (confirm('Delete this recording?')) { store.removeRecord(student.id, r.id); rerender(); } };
  return card;
}

// Shows the saved AI summary/advice for a recording (if any), plus a button to
// generate or refresh it. Once generated, it's stored on the recording.
function renderAnalysis(container, r, student, topic) {
  container.innerHTML = '';
  const run = includeNotes => runAnalysis(container, r, student, topic, includeNotes);

  if (r.analysis) {
    container.appendChild(savedAnalysis(r.analysis));
    const redo = regenerateButton();
    if (redo) {
      container.appendChild(redo);
      container.appendChild(analysisOptIn(redo, r, run));
    }
  } else {
    const analyze = el(`<button class="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="sparkles" class="w-4 h-4"></i>Analyse &amp; get advice</button>`);
    const gated = gateAi(analyze, { capability: 'analysis' });
    container.appendChild(gated);
    if (gated === analyze) container.appendChild(analysisOptIn(analyze, r, run));
  }
  refreshIcons();
}

// The one-line privacy notice, plus the per-request notes opt-in when there
// are notes to share. Shown only beside a live AI action, never in the child view.
// `placement` says where the block sits relative to the button or output it
// belongs to: 'after' (under an analyze button) or 'before' (above a review).
// The whole label is the hit area for the 20 px box.
export function privacyControls({ hasNotes = false, placement = 'after' } = {}) {
  return el(`<div class="${placement === 'before' ? 'mb-3' : 'mt-2'} space-y-1">
    <p class="text-[11px] text-ink-faint flex items-center gap-1.5"><i data-lucide="shield-check" class="w-3.5 h-3.5 shrink-0"></i>Names of learners in this app are replaced with “the child” before this is sent.</p>
    ${hasNotes ? `<label class="flex items-center gap-2.5 min-h-11 py-1 text-xs text-ink-soft cursor-pointer select-none"><input type="checkbox" class="include-notes accent-brand w-5 h-5 shrink-0 cursor-pointer" />Include my notes in this request</label>` : ''}
  </div>`);
}

// Shown beside a spinner's result or an error when this request carries the
// parent's notes, since a retry re-sends with the same choice while the box is hidden.
export function notesIncludedLine() {
  return el(`<p class="text-[11px] text-ink-faint">This request includes your notes.</p>`);
}

// Wires an analyze/regenerate button to the privacy controls. Notes stay home
// unless the box is ticked, so without a transcript the button waits for it.
// Returns the controls for the caller to append after `btn`.
export function analysisOptIn(btn, r, run) {
  const hasTranscript = !!(r.transcript && r.transcript.trim());
  const hasNote = !!(r.note && r.note.trim());
  const controls = privacyControls({ hasNotes: hasNote });
  const box = controls.querySelector('.include-notes');
  // Touch screens never show a title tooltip, so the reason is a visible line too.
  const hint = el(`<p class="text-[11px] text-ink-soft"></p>`);
  controls.appendChild(hint);
  const sync = () => {
    const ok = hasTranscript || !!box?.checked;
    btn.disabled = !ok;
    btn.classList.toggle('opacity-50', !ok);
    btn.classList.toggle('cursor-not-allowed', !ok);
    btn.title = ok ? '' : hasNote ? 'Tick “Include my notes” to analyse your notes' : 'Add a transcript or notes to analyse';
    hint.textContent = ok ? '' : btn.title + '.';
    hint.hidden = ok;
  };
  box?.addEventListener('change', sync);
  sync();
  btn.onclick = () => run(!!box?.checked);
  return controls;
}

// The saved AI summary block, shared with the Records page so both cards render it alike.
// Stored analysis can come from an import or a hand-edited file, so it goes
// through analysisHtml() (ui.js): only the tags toHtml() writes survive.
export function savedAnalysis(html) {
  return el(`<div class="rounded-xl bg-brand-light/40 border border-brand/20 p-3.5 mt-1">
    <p class="text-[11px] font-600 uppercase tracking-wide text-brand-dark mb-1.5 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i>AI summary &amp; advice</p>
    <div class="ai-prose text-sm text-ink-soft">${analysisHtml(html)}</div>
  </div>`);
}
// Null when analysis cannot generate, so both the Recordings and Records cards hide it.
export function regenerateButton() {
  if (!store.aiAvailable('analysis')) return null;
  return el(`<button class="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink-soft"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>Regenerate</button>`);
}

function runAnalysis(container, r, student, topic, includeNotes = false) {
  const hasContent = (r.transcript && r.transcript.trim()) || (includeNotes && r.note && r.note.trim());
  if (!hasContent) { toast('No transcript or shared notes to analyse', 'error'); return; }
  container.innerHTML = `<div class="flex items-center gap-2 text-sm text-ink-soft py-1"><div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>Analysing${includeNotes ? ' (notes included)' : ''}…</div>`;
  aiDiscussionAnalysis({
    age: store.studentAge(student), topic: topic || null,
    transcript: r.transcript || '', note: r.note || '', includeNotes,
  }).then(html => {
    // Persist the analysis onto the recording so it stays with it.
    store.updateRecord(student.id, r.id, { analysis: html, analyzedAt: Date.now() });
    r.analysis = html; r.analyzedAt = Date.now();
    renderAnalysis(container, r, student, topic);
    toast('Analysis saved to this recording', 'success');
  }).catch((e) => {
    container.innerHTML = '';
    if (includeNotes) container.appendChild(notesIncludedLine());
    container.appendChild(aiErrorBlock(e, () => runAnalysis(container, r, student, topic, includeNotes), { compact: true }));
  });
}
