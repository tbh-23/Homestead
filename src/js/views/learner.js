// The learner's page (HAR-45): for now one section, Reading. The parent
// ticks the sounds and tricky words the child reads, set by set; the stage is
// worked out from the ticks and never stored. "Find the level" walks the
// sets one screen at a time and fills the same checklist. Print preferences
// for the books live here too. No AI: nothing here is ever sent anywhere.
// `#learner/<id>`; `#learner/<id>/books` is the books page (views/books.js).
import * as store from '../store.js';
import { el, esc, keepFocus, openModal, refreshIcons, toast } from '../ui.js';
import { sequenceById } from '../phonics/sequence.js';
import { GRAPHEME_MAX, readingSummary, stageChecklist, stageOf, trickyOf, WORD_MAX } from '../phonics/reading.js';
import { renderBooks } from './books.js';

const CARD = 'bg-paper-card border border-paper-line rounded-2xl p-4 sm:p-5';
const BTN = 'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-full text-sm font-medium';
const tileCls = (on) => `relative inline-flex items-center justify-center min-w-[44px] h-11 px-2.5 rounded-xl border text-lg font-600 cursor-pointer select-none ${on ? 'bg-brand-light border-brand text-ink' : 'bg-paper border-paper-line text-ink-soft'}`;

export function renderLearner(params, { navigate }) {
  const student = store.get().students.find(s => s.id === params.id) || store.activeStudent();
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  if (!student) { root.appendChild(el(`<p class="text-ink-soft">Add a student first.</p>`)); return root; }
  if (params.sub === 'books') return renderBooks(student, { navigate });
  const reading = store.readingFor(student.id);

  root.appendChild(el(`<div class="mb-5">
    <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1">Parent view</p>
    <h1 class="font-display text-2xl sm:text-3xl font-600 [overflow-wrap:anywhere]">${esc(student.name)}</h1>
    <p class="text-ink-soft text-sm mt-1">Age ${store.studentAge(student)}</p>
  </div>`));

  const section = el(`<section aria-labelledby="reading-h" class="space-y-4">
    <div class="${CARD}">
      <div class="flex flex-wrap items-start gap-3 justify-between">
        <div class="min-w-0">
          <h2 id="reading-h" class="font-display text-xl font-600">Reading</h2>
          <p id="reading-stage" class="text-sm text-ink mt-1 font-medium">${esc(readingSummary(reading))}</p>
          <p class="text-xs text-ink-faint mt-1 leading-relaxed [overflow-wrap:anywhere]">Tick the sounds and tricky words ${esc(student.name)} can read. Books and new stories use only what is ticked, so this is all there is to change when they learn more.</p>
        </div>
        <div class="flex flex-wrap gap-2 max-w-full">
          <button id="find-level" class="${BTN} bg-paper text-ink border border-paper-line"><i data-lucide="search-check" class="w-4 h-4 shrink-0"></i>Find the level</button>
          <button id="to-books" class="${BTN} h-auto min-h-11 py-2 max-w-full text-left bg-brand text-white"><i data-lucide="book-open" class="w-4 h-4 shrink-0"></i><span class="min-w-0 [overflow-wrap:anywhere]">Books for ${esc(student.name)}</span></button>
        </div>
      </div>
    </div>
    <div class="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div class="${CARD}" id="sounds"><h3 class="font-600 mb-1">Sounds</h3>
        <p class="text-xs text-ink-faint mb-3">In the order the school teaches them. "Whole set" ticks or clears a set at once.</p></div>
      <div class="space-y-4">
        <div class="${CARD}" id="tricky"><h3 class="font-600 mb-1">Tricky words</h3></div>
        <div class="${CARD}" id="prefs"><h3 class="font-600 mb-3">Printing</h3></div>
      </div>
    </div>
  </section>`);
  root.appendChild(section);
  section.querySelector('#find-level').onclick = () => openFindLevel(student);
  section.querySelector('#to-books').onclick = () => navigate('learner', { id: student.id, sub: 'books' });

  // ---- sounds, set by set ----
  const sounds = section.querySelector('#sounds');
  const known = new Set(reading.graphemes);
  // Every change re-renders the page; the focus stays on the control used.
  const save = (patch) => { const restore = keepFocus(); store.setReading(student.id, patch); restore(); };
  for (const row of stageChecklist(reading)) {
    const { stage, number } = row;
    const box = el(`<fieldset class="border-t border-paper-line pt-3 mt-3 first-of-type:border-0 first-of-type:pt-0 first-of-type:mt-0" data-stage="${number}">
      <legend class="sr-only">${esc(stage.label)}</legend>
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-sm font-600">${esc(stage.label)}${stage.note ? `<span class="font-normal text-ink-faint"> · ${esc(stage.note)}</span>` : ''}</span>
        <label class="inline-flex items-center gap-2 text-xs text-ink-soft h-11 cursor-pointer"><input type="checkbox" class="whole w-4 h-4 accent-[#3f6b3b]" ${row.all ? 'checked' : ''} aria-label="Whole ${esc(stage.label.toLowerCase())}">Whole set</label>
      </div>
      <div class="tiles flex flex-wrap gap-2"></div>
    </fieldset>`);
    const tiles = box.querySelector('.tiles');
    if (stage.clusters) {
      tiles.appendChild(el(`<p class="text-xs text-ink-faint">No new sounds: two consonants side by side, as in stop, mist and jumps.</p>`));
    }
    for (const g of stage.graphemes) {
      const on = known.has(g);
      const t = el(`<label class="${tileCls(on)}"><input type="checkbox" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0" ${on ? 'checked' : ''} aria-label="Sound ${esc(g)}">${esc(g)}</label>`);
      t.querySelector('input').onchange = (e) => {
        const next = new Set(store.readingFor(student.id).graphemes);
        if (e.target.checked) next.add(g); else next.delete(g);
        save({ graphemes: [...next] });
      };
      tiles.appendChild(t);
    }
    box.querySelector('.whole').onchange = (e) => {
      if (stage.clusters) { save({ clusters: e.target.checked }); return; }
      const next = new Set(store.readingFor(student.id).graphemes);
      for (const g of stage.graphemes) { if (e.target.checked) next.add(g); else next.delete(g); }
      save({ graphemes: [...next] });
    };
    sounds.appendChild(box);
  }
  // The parent's own sounds.
  const own = el(`<div class="border-t border-paper-line pt-3 mt-3">
    <p class="text-sm font-600 mb-2">Your own sounds</p>
    <div class="tiles flex flex-wrap gap-2 mb-2"></div>
    <form class="flex gap-2 items-center"><label class="sr-only" for="add-sound">Add a sound</label>
      <input id="add-sound" maxlength="${GRAPHEME_MAX}" autocomplete="off" placeholder="e.g. oa" class="w-28 h-11 px-3 rounded-lg border border-paper-line bg-paper">
      <button class="${BTN} bg-paper border border-paper-line text-ink">Add a sound</button></form>
  </div>`);
  for (const g of reading.custom.graphemes) {
    const on = known.has(g);
    const t = el(`<label class="${tileCls(on)}"><input type="checkbox" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0" ${on ? 'checked' : ''} aria-label="Sound ${esc(g)}">${esc(g)}</label>`);
    t.querySelector('input').onchange = (e) => {
      const next = new Set(store.readingFor(student.id).graphemes);
      if (e.target.checked) next.add(g); else next.delete(g);
      save({ graphemes: [...next] });
    };
    own.querySelector('.tiles').appendChild(t);
  }
  own.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const g = own.querySelector('input').value.trim().toLowerCase();
    if (!/^[a-z]{1,4}$/.test(g)) { toast(`A sound is one to ${GRAPHEME_MAX} letters, a to z`, 'error'); return; }
    const cur = store.readingFor(student.id);
    save({ custom: { ...cur.custom, graphemes: [...cur.custom.graphemes, g] }, graphemes: [...cur.graphemes, g] });
    toast(`Added the sound ${g}`, 'success');
  };
  sounds.appendChild(own);

  // ---- tricky words ----
  const tricky = section.querySelector('#tricky');
  const seq = sequenceById(reading.sequence);
  const ticked = new Set(trickyOf(reading).map(w => w.toLowerCase()));
  tricky.appendChild(el(`<p class="text-xs text-ink-faint mb-3">${reading.tricky === null
    ? `Ticked to match the sounds: the usual words up to set ${stageOf(reading) || 1}. Change any and the list is yours.`
    : 'Your own list. "Back to the usual words" follows the sounds again.'}</p>`));
  const list = el(`<div class="flex flex-wrap gap-2"></div>`);
  const allWords = [...seq.stages.flatMap(s => seq.tricky[s.key] || []), ...reading.custom.tricky];
  for (const w of allWords) {
    const on = ticked.has(w.toLowerCase());
    const t = el(`<label class="${tileCls(on)} text-base"><input type="checkbox" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0" ${on ? 'checked' : ''} aria-label="Tricky word ${esc(w)}">${esc(w)}</label>`);
    t.querySelector('input').onchange = (e) => {
      const next = trickyOf(store.readingFor(student.id)).filter(x => x.toLowerCase() !== w.toLowerCase());
      if (e.target.checked) next.push(w);
      save({ tricky: next });
    };
    list.appendChild(t);
  }
  tricky.appendChild(list);
  const addWord = el(`<form class="flex gap-2 items-center mt-3"><label class="sr-only" for="add-word">Add a word</label>
    <input id="add-word" maxlength="${WORD_MAX}" autocomplete="off" placeholder="e.g. said" class="w-32 h-11 px-3 rounded-lg border border-paper-line bg-paper">
    <button class="${BTN} bg-paper border border-paper-line text-ink">Add a word</button></form>`);
  addWord.onsubmit = (e) => {
    e.preventDefault();
    const w = addWord.querySelector('input').value.trim();
    if (!/^[A-Za-z]{1,20}$/.test(w)) { toast('A word is letters only, a to z', 'error'); return; }
    const cur = store.readingFor(student.id);
    save({ custom: { ...cur.custom, tricky: [...cur.custom.tricky, w] }, tricky: [...trickyOf(cur), w] });
    toast(`Added the word ${w}`, 'success');
  };
  tricky.appendChild(addWord);
  if (reading.tricky !== null) {
    const reset = el(`<button class="${BTN} mt-2 text-brand-dark px-0">Back to the usual words</button>`);
    reset.onclick = () => save({ tricky: null });
    tricky.appendChild(reset);
  }

  // ---- print preferences ----
  const prefs = section.querySelector('#prefs');
  const p = reading.prefs;
  prefs.appendChild(el(`<div class="space-y-3 text-sm">
    <label class="flex items-start gap-2 cursor-pointer"><input type="checkbox" id="name-on-cover" class="w-4 h-4 mt-0.5 accent-[#3f6b3b]" ${p.nameOnCover ? 'checked' : ''}>
      <span class="min-w-0 [overflow-wrap:anywhere]">Print ${esc(student.name)}'s name on the cover<span class="block text-xs text-ink-faint">Only on the paper; the name is never sent anywhere.</span></span></label>
    <fieldset><legend class="text-xs text-ink-faint mb-1">Print layout</legend>
      <div class="flex flex-wrap gap-4">
        <label class="inline-flex items-center gap-2 h-11 cursor-pointer"><input type="radio" name="layout" value="booklet" class="accent-[#3f6b3b]" ${p.layout === 'booklet' ? 'checked' : ''}>Booklet (A4, fold and staple)</label>
        <label class="inline-flex items-center gap-2 h-11 cursor-pointer"><input type="radio" name="layout" value="flat" class="accent-[#3f6b3b]" ${p.layout === 'flat' ? 'checked' : ''}>Flat (A5 pages)</label>
      </div></fieldset>
  </div>`));
  prefs.querySelector('#name-on-cover').onchange = (e) => store.setReading(student.id, { prefs: { ...store.readingFor(student.id).prefs, nameOnCover: e.target.checked } }, { quiet: true });
  prefs.querySelectorAll('input[name=layout]').forEach(r => {
    r.onchange = () => store.setReading(student.id, { prefs: { ...store.readingFor(student.id).prefs, layout: r.value } }, { quiet: true });
  });
  return root;
}

// ---- Find the level ----
// One set at a time: the parent points at each sound, the child says it, and
// the parent taps the ones said right away. Done writes the ticks into the
// checklist (the sounds of sets not reached keep their ticks).
function openFindLevel(student) {
  const start = store.readingFor(student.id);
  const seq = sequenceById(start.sequence);
  const picked = new Set(start.graphemes);
  let clusters = start.clusters;
  let index = Math.min(stageOf(start), seq.stages.length - 1);
  const body = el(`<div class="p-5 sm:p-6" aria-live="polite"></div>`);
  const m = openModal(body);
  const finish = () => {
    store.setReading(student.id, { graphemes: [...picked], clusters });
    m.close();
    toast(readingSummary(store.readingFor(student.id)), 'success');
  };
  const draw = () => {
    const stage = seq.stages[index];
    body.innerHTML = '';
    body.appendChild(el(`<div>
      <p class="text-xs text-ink-faint mb-1">Find the level · ${esc(stage.label)} of ${seq.stages.length}</p>
      <h3 class="font-display text-xl font-600 mb-1 [overflow-wrap:anywhere]">${stage.clusters ? 'Two sounds together' : 'Which sounds does ' + esc(student.name) + ' know?'}</h3>
      <p class="text-sm text-ink-soft mb-4">${stage.clusters
        ? 'Ask them to read stop, mist and jumps. Tick if they blend all of the sounds.'
        : 'Point to each sound and ask what it says. Tap the ones they say straight away.'}</p>
      <div class="grid grid-cols-2 gap-3 mb-5" id="fl-tiles"></div>
      <div class="flex flex-wrap gap-2 justify-between">
        <button id="fl-back" class="${BTN} bg-paper border border-paper-line text-ink" ${index === 0 ? 'disabled' : ''}>Back</button>
        <div class="flex flex-wrap gap-2">
          <button id="fl-done" class="${BTN} bg-paper border border-paper-line text-ink">Done</button>
          <button id="fl-next" class="${BTN} bg-brand text-white">${index === seq.stages.length - 1 ? 'Finish' : 'Next set'}</button>
        </div>
      </div>
    </div>`));
    const tiles = body.querySelector('#fl-tiles');
    const items = stage.clusters ? ['stop mist jumps'] : stage.graphemes;
    for (const g of items) {
      const on = stage.clusters ? clusters : picked.has(g);
      const b = el(`<button aria-pressed="${on}" class="h-20 rounded-2xl border-2 text-3xl font-600 ${stage.clusters ? 'col-span-2 text-2xl' : ''} ${on ? 'bg-brand-light border-brand' : 'bg-paper border-paper-line'}">${esc(g)}</button>`);
      b.onclick = () => {
        if (stage.clusters) clusters = !clusters;
        else if (picked.has(g)) picked.delete(g); else picked.add(g);
        draw();
      };
      tiles.appendChild(b);
    }
    body.querySelector('#fl-back').onclick = () => { index -= 1; draw(); };
    body.querySelector('#fl-done').onclick = finish;
    body.querySelector('#fl-next').onclick = () => {
      if (index === seq.stages.length - 1) finish();
      else { index += 1; draw(); }
    };
    refreshIcons();
  };
  draw();
}
