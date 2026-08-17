// Data & backup center: export the whole account to a JSON file, restore from
// one, and open a printable year-end report for any student. All of a family's
// data lives in one Puter KV record — this makes it portable and recoverable.
import { el, esc, openModal, toast, refreshIcons, fmtDateTime } from '../ui.js';
import * as store from '../store.js';
import { openReport } from './report.js';

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function openSettings() {
  const state = store.get();
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-center gap-3 z-10">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="database" class="w-5 h-5 text-brand-dark"></i></span>
      <div class="flex-1 min-w-0">
        <h3 class="font-display text-lg font-600 leading-tight">Data &amp; reports</h3>
        <p class="text-xs text-ink-faint">Back up your account and print progress reports</p>
      </div>
    </div>
    <div class="px-5 py-4 space-y-5">

      <div>
        <h4 class="font-600 text-sm mb-1 flex items-center gap-1.5"><i data-lucide="file-down" class="w-4 h-4 text-brand-dark"></i>Year-end report</h4>
        <p class="text-xs text-ink-soft mb-2.5">A printable portfolio for each student — mastery, assessments, attendance and records. Great for your records or state reporting. Use your browser's "Save as PDF" to keep a copy.</p>
        <div id="students" class="space-y-1.5"></div>
      </div>

      <div class="border-t border-paper-line pt-4">
        <h4 class="font-600 text-sm mb-1 flex items-center gap-1.5"><i data-lucide="hard-drive-download" class="w-4 h-4 text-brand-dark"></i>Back up your data</h4>
        <p class="text-xs text-ink-soft mb-2.5">Download everything — students, progress, records, tests and settings — as a single JSON file you can keep safe.</p>
        <button id="export" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"><i data-lucide="download" class="w-4 h-4"></i>Export backup (.json)</button>
      </div>

      <div class="border-t border-paper-line pt-4">
        <h4 class="font-600 text-sm mb-1 flex items-center gap-1.5"><i data-lucide="upload" class="w-4 h-4 text-[#b0603a]"></i>Restore from a backup</h4>
        <p class="text-xs text-ink-soft mb-2.5">Import a Homestead backup file. This <span class="font-600">replaces</span> everything currently in this account, so export first if you're unsure.</p>
        <button id="import" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-paper-line text-sm font-medium hover:border-[#b0603a]/50 transition-colors"><i data-lucide="folder-input" class="w-4 h-4"></i>Choose backup file…</button>
        <input id="file" type="file" accept="application/json,.json" class="hidden" />
      </div>

    </div>
  </div>`);

  const list = body.querySelector('#students');
  if (state.students.length === 0) {
    list.appendChild(el(`<p class="text-xs text-ink-faint">Add a student to generate a report.</p>`));
  }
  state.students.forEach(s => {
    const row = el(`<button class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors text-left">
      <span class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-600 shrink-0" style="background:${s.color || '#8a847a'}">${esc((s.name || '?').slice(0, 1).toUpperCase())}</span>
      <span class="flex-1 text-sm font-600 truncate">${esc(s.name)}</span>
      <span class="flex items-center gap-1 text-xs font-medium text-brand-dark shrink-0"><i data-lucide="printer" class="w-3.5 h-3.5"></i>Open report</span>
    </button>`);
    row.onclick = () => openReport(s);
    list.appendChild(row);
  });

  body.querySelector('#export').onclick = () => {
    try {
      downloadJson(`homestead-backup-${todayStamp()}.json`, store.exportData());
      toast('Backup downloaded', 'success');
    } catch (e) { toast('Could not export backup', 'error'); }
  };

  const fileInput = body.querySelector('#file');
  body.querySelector('#import').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let payload;
    try { payload = JSON.parse(await file.text()); }
    catch { toast('That file isn’t valid JSON', 'error'); return; }
    const count = Array.isArray(payload?.data?.students) ? payload.data.students.length
      : Array.isArray(payload?.students) ? payload.students.length : null;
    if (count == null) { toast('Not a Homestead backup file', 'error'); return; }
    if (!confirm(`Restore this backup? It will REPLACE the current account with ${count} student(s). Consider exporting first.`)) return;
    const res = await store.importData(payload);
    if (!res.ok) { toast(res.error || 'Import failed', 'error'); return; }
    toast(`Restored ${res.students} student${res.students === 1 ? '' : 's'} — reloading…`, 'success');
    setTimeout(() => location.reload(), 700);
  };

  openModal(body);
  refreshIcons();
}
