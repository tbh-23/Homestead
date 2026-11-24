// Learner profile editor — a quick, optional picture of how a child learns best.
// What's captured here personalizes AI-generated lessons, explanations, tests,
// printables and remediation across the app.
import { el, esc, openModal, toast, refreshIcons } from '../ui.js';
import * as store from '../store.js';

const MODALITIES = [
  { v: 'visual', icon: 'eye', label: 'Seeing', hint: 'pictures, diagrams' },
  { v: 'hands_on', icon: 'hand', label: 'Doing', hint: 'hands-on, concrete' },
  { v: 'verbal', icon: 'ear', label: 'Talking', hint: 'discuss, read-aloud' },
  { v: 'reading', icon: 'book-open', label: 'Reading', hint: 'written, lists' },
];
const PACES = [
  { v: 'slower', label: 'More time', hint: 'smaller steps' },
  { v: 'standard', label: 'Standard', hint: 'typical pace' },
  { v: 'faster', label: 'Quickly', hint: 'ready to stretch' },
];

export function openProfileEditor(studentId) {
  const student = store.get().students.find(s => s.id === studentId);
  if (!student) { toast('Add a student first', 'error'); return; }
  const p = store.getProfile(studentId);
  const interests = Array.isArray(p.interests) ? p.interests.join(', ') : (p.interests || '');

  const chip = (groupSel, v, label, hint, on) =>
    `<button type="button" data-group="${groupSel}" data-val="${v}" class="opt flex-1 min-w-0 text-left px-3 py-2.5 rounded-xl border ${on ? 'border-brand bg-brand-light/50' : 'border-paper-line'} transition-colors">
       <span class="block text-sm font-600 truncate">${esc(label)}</span>
       <span class="block text-[11px] text-ink-faint truncate">${esc(hint)}</span>
     </button>`;

  const body = el(`<div class="p-5">
    <div class="flex items-center gap-2.5 mb-1">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-600 shrink-0" style="background:${student.color || '#8a847a'}">${esc((student.name || '?').slice(0, 1).toUpperCase())}</span>
      <div>
        <h3 class="font-display text-lg font-600 leading-tight">How ${esc(student.name)} learns</h3>
        <p class="text-xs text-ink-faint">All optional — it personalizes lessons, tests &amp; tips.</p>
      </div>
    </div>

    <form id="f" class="space-y-4 mt-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Learns best by</label>
        <div class="grid grid-cols-2 gap-2" data-field="modality">
          ${MODALITIES.map(m => chip('modality', m.v, m.label, m.hint, p.modality === m.v)).join('')}
        </div>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Pace</label>
        <div class="flex gap-2" data-field="pace">
          ${PACES.map(x => chip('pace', x.v, x.label, x.hint, p.pace === x.v)).join('')}
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-medium block mb-1.5">Reading level</label>
          <select name="readingLevel" class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">
            <option value="">—</option>
            ${['below grade', 'on grade', 'above grade'].map(v => `<option value="${v}" ${p.readingLevel === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-sm font-medium block mb-1.5">Attention span</label>
          <select name="attention" class="w-full px-3 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">
            <option value="">—</option>
            ${[['short', 'Short'], ['typical', 'Typical'], ['long', 'Long']].map(([v, l]) => `<option value="${v}" ${p.attention === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Interests <span class="text-ink-faint font-normal">(comma-separated)</span></label>
        <input name="interests" value="${esc(interests)}" placeholder="e.g. dinosaurs, soccer, space" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        <p class="text-[11px] text-ink-faint mt-1">We weave these into examples and word problems.</p>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Anything else to keep in mind <span class="text-ink-faint font-normal">(optional)</span></label>
        <textarea name="notes" rows="2" placeholder="e.g. gets discouraged by timed tasks; loves a challenge" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">${esc(p.notes || '')}</textarea>
      </div>
      <button class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Save profile</button>
    </form>
  </div>`);

  // selectable chip groups
  const picked = { modality: p.modality || '', pace: p.pace || '' };
  body.querySelectorAll('.opt').forEach(btn => {
    btn.onclick = () => {
      const group = btn.dataset.group;
      const already = picked[group] === btn.dataset.val;
      picked[group] = already ? '' : btn.dataset.val;
      body.querySelectorAll(`.opt[data-group="${group}"]`).forEach(b => {
        const on = b.dataset.val === picked[group];
        b.classList.toggle('border-brand', on);
        b.classList.toggle('bg-brand-light/50', on);
        b.classList.toggle('border-paper-line', !on);
      });
    };
  });

  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.setProfile(studentId, {
      modality: picked.modality || '',
      pace: picked.pace || '',
      readingLevel: fd.get('readingLevel') || '',
      attention: fd.get('attention') || '',
      interests: String(fd.get('interests') || '').split(',').map(s => s.trim()).filter(Boolean),
      notes: String(fd.get('notes') || '').trim(),
    });
    toast(`${student.name}'s learning profile saved`, 'success');
    m.close();
  };

  const m = openModal(body);
  refreshIcons();
}

// A compact dashboard card: prompts setup when empty, or shows a summary + edit.
export function learnerProfileCard(student) {
  if (!student) return el('<span></span>');
  const has = store.hasProfile(student.id);
  const p = store.getProfile(student.id);

  if (!has) {
    const card = el(`<button class="w-full text-left rounded-2xl border border-dashed border-brand/40 bg-brand-light/30 p-4 mb-6 flex items-center gap-4 hover:bg-brand-light/50 transition-colors">
      <span class="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0"><i data-lucide="user-cog" class="w-5.5 h-5.5 text-brand-dark"></i></span>
      <span class="flex-1 min-w-0">
        <span class="block font-600">Tell us how ${esc(student.name)} learns</span>
        <span class="block text-sm text-ink-soft">A 60-second profile personalizes every lesson, test and tip to them.</span>
      </span>
      <span class="shrink-0 flex items-center gap-1.5 text-sm font-medium text-brand-dark">Set up<i data-lucide="chevron-right" class="w-4 h-4"></i></span>
    </button>`);
    card.onclick = () => openProfileEditor(student.id);
    return card;
  }

  const interests = Array.isArray(p.interests) ? p.interests : (p.interests ? [p.interests] : []);
  const bits = [];
  const modalityLabel = (MODALITIES.find(m => m.v === p.modality) || {}).label;
  if (modalityLabel) bits.push(modalityLabel);
  if (p.pace) bits.push((PACES.find(x => x.v === p.pace) || {}).label || p.pace);
  if (interests.length) bits.push(interests.slice(0, 3).join(', '));

  const card = el(`<div class="rounded-2xl border border-paper-line bg-paper-card p-4 mb-6 flex items-center gap-4">
    <span class="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0"><i data-lucide="user-cog" class="w-5.5 h-5.5 text-brand-dark"></i></span>
    <span class="flex-1 min-w-0">
      <span class="block font-600">Learning profile</span>
      <span class="block text-sm text-ink-soft truncate">${bits.length ? esc(bits.join(' · ')) : 'Personalizing content for ' + esc(student.name)}</span>
    </span>
    <button id="edit" class="shrink-0 text-sm font-medium text-brand-dark flex items-center gap-1">Edit<i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
  </div>`);
  card.querySelector('#edit').onclick = () => openProfileEditor(student.id);
  return card;
}
