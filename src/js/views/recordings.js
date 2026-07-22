import * as store from '../store.js';
import { getData, SUBJECTS } from '../data.js';
import { el, refreshIcons, toast, openModal, fmtDateTime } from '../ui.js';
import { audioPlayer, openRecorder } from '../recorder.js';
import { aiDiscussionAnalysis } from '../ai.js';

// The general recordings folder — all voice recordings, grouped by section.
export function openRecordingsLibrary() {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  const d = getData();

  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-center gap-3 z-10">
      <span class="w-9 h-9 rounded-lg bg-[#b0413a]/10 flex items-center justify-center shrink-0"><i data-lucide="folder" class="w-5 h-5 text-[#b0413a]"></i></span>
      <div class="flex-1 min-w-0">
        <h3 class="font-display text-lg font-600 leading-tight">Recordings</h3>
        <p class="text-xs text-ink-faint">Every voice recording for ${student.name}, grouped by section</p>
      </div>
      <button id="new" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#b0413a] hover:bg-[#963731] text-white text-sm font-medium transition-colors"><i data-lucide="mic" class="w-4 h-4"></i>Record</button>
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

    // Group by section (fallback: "Unfiled").
    const groups = new Map();
    recs.forEach(r => {
      const key = r.sectionId || 'unfiled';
      if (!groups.has(key)) groups.set(key, { label: r.sectionLabel || (r.topicName ? r.topicName : 'Unfiled'), subject: r.subject, items: [] });
      groups.get(key).items.push(r);
    });

    bodyWrap.appendChild(el(`<p class="text-xs text-ink-faint mb-3">${recs.length} recording${recs.length > 1 ? 's' : ''} across ${groups.size} section${groups.size > 1 ? 's' : ''}.</p>`));

    for (const [, g] of groups) {
      const meta = SUBJECTS[g.subject] || { color: '#8a847a', icon: 'folder' };
      const groupEl = el(`<div class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-3.5 h-3.5" style="color:${meta.color}"></i></span>
          <p class="text-sm font-600">${esc(g.label)}</p>
          <span class="text-xs text-ink-faint">${g.items.length}</span>
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

function recordingCard(r, student, rerender) {
  const d = getData();
  const topic = r.topicId ? d.byId.get(r.topicId) : null;
  const card = el(`<div class="rounded-xl border border-paper-line bg-paper p-3">
    <div class="flex items-center gap-2 text-xs mb-1">
      <span class="flex items-center gap-1 font-600 text-[#b0413a]"><i data-lucide="mic" class="w-3.5 h-3.5"></i>Recording</span>
      <span class="text-ink-faint ml-auto">${fmtDateTime(r.createdAt)}</span>
      <button class="del text-ink-faint hover:text-[#b0413a] p-0.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
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
export function renderAnalysis(container, r, student, topic) {
  container.innerHTML = '';
  const hasContent = (r.transcript && r.transcript.trim()) || (r.note && r.note.trim());

  if (r.analysis) {
    container.appendChild(el(`<div class="rounded-xl bg-brand-light/40 border border-brand/20 p-3.5 mt-1">
      <p class="text-[11px] font-600 uppercase tracking-wide text-brand-dark mb-1.5 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i>AI summary &amp; advice</p>
      <div class="ai-prose text-sm text-ink-soft">${r.analysis}</div>
    </div>`));
    const redo = el(`<button class="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink-soft"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>Regenerate</button>`);
    if (hasContent) redo.onclick = () => runAnalysis(container, r, student, topic);
    container.appendChild(redo);
  } else {
    const analyze = el(`<button class="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand-dark/80"><i data-lucide="sparkles" class="w-4 h-4"></i>Analyze &amp; get advice</button>`);
    if (hasContent) analyze.onclick = () => runAnalysis(container, r, student, topic);
    else { analyze.disabled = true; analyze.classList.add('opacity-50', 'cursor-not-allowed'); analyze.title = 'Add a transcript or notes to analyze'; }
    container.appendChild(analyze);
  }
  refreshIcons();
}

export function runAnalysis(container, r, student, topic) {
  const hasContent = (r.transcript && r.transcript.trim()) || (r.note && r.note.trim());
  if (!hasContent) { toast('No transcript or notes to analyze', 'error'); return; }
  container.innerHTML = `<div class="flex items-center gap-2 text-sm text-ink-soft py-1"><div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>Analyzing…</div>`;
  aiDiscussionAnalysis({
    studentName: student.name, age: store.studentAge(student),
    topic: topic || null, transcript: r.transcript || '', note: r.note || '',
  }).then(html => {
    // Persist the analysis onto the recording so it stays with it.
    store.updateRecord(student.id, r.id, { analysis: html, analyzedAt: Date.now() });
    r.analysis = html; r.analyzedAt = Date.now();
    renderAnalysis(container, r, student, topic);
    toast('Analysis saved to this recording', 'success');
  }).catch(() => { container.innerHTML = `<p class="text-sm text-[#b0413a]">Couldn't analyze right now.</p>`; });
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
