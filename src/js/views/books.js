// Books for one learner (HAR-45), `#learner/<id>/books`: the built-in books
// within their known code (newest sounds first), the ones a few sounds
// further on (muted, with what they need), "Make a new book" from the word
// bank, and the learner's library of saved books. Everything works without
// an AI provider and nothing is sent anywhere; the learner's name only
// reaches the printed cover, when the parent asked for it.
import * as store from '../store.js';
import { el, esc, fmtDate, keepFocus, toast } from '../ui.js';
import { BANK } from '../phonics/bank.js';
import { generateBook } from '../phonics/generator.js';
import { renderScene } from '../phonics/pictures.js';
import { bookFacts, booksFor, defaultFocus, describeMissing, inTeachingOrder, knownCode, readingSummary, stageOf } from '../phonics/reading.js';
import { printBook } from './bookprint.js';

const CARD = 'bg-paper-card border border-paper-line rounded-2xl p-4';
const BTN = 'inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-full text-sm font-medium';
const BTN_SOFT = `${BTN} bg-paper border border-paper-line text-ink`;

// The book being made, per learner, for this visit: { focus, pages, seed }.
const drafts = new Map();

const ownerOf = (student, reading) => (reading.prefs.nameOnCover ? student.name : '');
// "Sounds: ck sh", or for a book about adjacent consonants, that.
const soundsOf = (book) => bookFacts(book).coverLine;

function bookCard(book, { student, reading, actions = ['booklet', 'flat', 'save'], muted = '', date = null, onRemove = null }) {
  const card = el(`<article class="${CARD} ${muted ? 'opacity-60' : ''}" data-book="${esc(book.id || '')}">
    <div class="flex gap-3 items-start">
      <div class="w-24 sm:w-28 shrink-0 rounded-lg border border-paper-line bg-white overflow-hidden">${renderScene(book.cover || [])}</div>
      <div class="min-w-0 flex-1">
        <h3 class="font-600 leading-snug">${esc(book.title)}</h3>
        <p class="text-xs text-ink-soft mt-0.5">${esc(soundsOf(book))}${date ? ` · saved ${esc(fmtDate(date))}` : ''}</p>
        ${muted ? `<p class="needs text-xs text-ink-soft mt-0.5">needs: ${esc(muted)}</p>` : ''}
      </div>
    </div>
    <div class="actions flex flex-wrap gap-2 mt-3 empty:hidden"></div>
  </article>`);
  const bar = card.querySelector('.actions');
  const add = (label, icon, fn) => {
    const b = el(`<button class="${BTN_SOFT}"><i data-lucide="${esc(icon)}" class="w-4 h-4"></i>${esc(label)}</button>`);
    b.onclick = fn;
    bar.appendChild(b);
  };
  const print = (layout) => printBook(book, { layout, ownerName: ownerOf(student, reading) });
  if (actions.includes('booklet')) add('Print booklet', 'printer', () => print('booklet'));
  if (actions.includes('flat')) add('Print flat', 'file-text', () => print('flat'));
  if (actions.includes('print')) add('Print', 'printer', () => print(reading.prefs.layout));
  if (actions.includes('save')) add('Save to library', 'bookmark-plus', () => saveBook(student, book));
  if (onRemove) add('Remove', 'trash-2', onRemove);
  return card;
}

function saveBook(student, book) {
  if (store.saveBookToLibrary(student.id, book)) toast(`“${book.title}” is in the library`, 'success');
  else toast('The library is full; remove a book first', 'error');
}

export function renderBooks(student, { navigate }) {
  const reading = store.readingFor(student.id);
  const code = knownCode(reading);
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  root.appendChild(el(`<div class="mb-5">
    <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1">Parent view · decodable books</p>
    <h1 class="font-display text-2xl sm:text-3xl font-600 [overflow-wrap:anywhere]">Books for ${esc(student.name)}</h1>
    <p id="books-stage" class="text-sm text-ink mt-1">${esc(readingSummary(reading))}
      <button id="to-setup" class="text-brand-dark font-medium underline underline-offset-2 h-11">Change the sounds</button></p>
  </div>`));
  root.querySelector('#to-setup').onclick = () => navigate('learner', { id: student.id });

  // ---- the bank ----
  const { within, beyond } = booksFor(code, BANK);
  const bank = el(`<section aria-labelledby="bank-h" class="mb-8"><h2 id="bank-h" class="font-display text-xl font-600 mb-3">Ready to read</h2>
    <div id="bank-list" class="grid gap-3 md:grid-cols-2"></div></section>`);
  const list = bank.querySelector('#bank-list');
  if (!within.length) {
    list.appendChild(el(`<p class="text-sm text-ink-soft md:col-span-2 [overflow-wrap:anywhere]">No book uses only the sounds ticked so far. Tick the sounds ${esc(student.name)} knows on the reading setup, or start with set 1: s a t p.</p>`));
  }
  for (const book of within) list.appendChild(bookCard(book, { student, reading }));
  if (beyond.length) {
    bank.appendChild(el(`<h3 class="text-sm font-600 text-ink-soft mt-5 mb-2">A little further on</h3>`));
    const further = el(`<div id="beyond-list" class="grid gap-3 md:grid-cols-2"></div>`);
    for (const { book, missing } of beyond) further.appendChild(bookCard(book, { student, reading, actions: [], muted: describeMissing(missing) }));
    bank.appendChild(further);
  }
  root.appendChild(bank);

  // ---- make a new book ----
  root.appendChild(makeSection(student, reading, code));

  // ---- the library ----
  const lib = el(`<section aria-labelledby="lib-h" class="mb-8"><h2 id="lib-h" class="font-display text-xl font-600 mb-3">Library</h2>
    <div id="library-list" class="grid gap-3 md:grid-cols-2"></div></section>`);
  const libList = lib.querySelector('#library-list');
  if (!reading.library.length) libList.appendChild(el(`<p class="text-sm text-ink-soft md:col-span-2">Saved books appear here, to print again.</p>`));
  for (const entry of reading.library) {
    libList.appendChild(bookCard(entry.book, {
      student, reading, actions: ['print'], date: entry.savedAt,
      onRemove: () => { store.removeFromLibrary(student.id, entry.id); toast(`Removed “${entry.book.title}”`); },
    }));
  }
  root.appendChild(lib);
  return root;
}

// The view re-renders on every change; the focus stays on the control used.
const redraw = () => { const restore = keepFocus(); store.redraw(); restore(); };

function makeSection(student, reading, code) {
  const fallback = defaultFocus(reading);
  const draft = drafts.get(student.id) || { focus: fallback.graphemes, clusters: fallback.clusters, pages: 6, seed: 1, made: false };
  // Until the parent picks sounds the focus follows the ticks (the newest
  // set); after that, keep their choice of sounds that are still known.
  if (!draft.chosen) Object.assign(draft, { focus: fallback.graphemes, clusters: fallback.clusters });
  draft.focus = draft.focus.filter(g => code.graphemes.has(g));
  drafts.set(student.id, draft);
  const known = inTeachingOrder([...code.graphemes]);
  const section = el(`<section aria-labelledby="make-h" class="mb-8">
    <h2 id="make-h" class="font-display text-xl font-600 mb-1">Make a new book</h2>
    <p class="text-sm text-ink-soft mb-3 [overflow-wrap:anywhere]">A new story from the sounds ${esc(student.name)} knows. Pick the sounds to practise; Shuffle writes another one. No AI: every word is checked before you see it.</p>
    <div class="${CARD} space-y-3">
      <fieldset><legend class="text-xs text-ink-faint mb-1.5">Sounds to practise</legend><div id="focus" class="flex flex-wrap gap-2"></div></fieldset>
      <fieldset><legend class="text-xs text-ink-faint mb-1.5">Length</legend><div class="flex gap-4">
        <label class="inline-flex items-center gap-2 h-11 cursor-pointer"><input type="radio" name="len" id="len-8" value="6" class="accent-[#3f6b3b]" ${draft.pages === 6 ? 'checked' : ''}>8 pages</label>
        <label class="inline-flex items-center gap-2 h-11 cursor-pointer"><input type="radio" name="len" id="len-12" value="10" class="accent-[#3f6b3b]" ${draft.pages === 10 ? 'checked' : ''}>12 pages</label>
      </div></fieldset>
      <div class="flex flex-wrap gap-2">
        <button id="make" class="${BTN} bg-brand text-white"><i data-lucide="sparkle" class="w-4 h-4"></i>Make a book</button>
        <button id="shuffle" class="${BTN_SOFT}" ${draft.made ? '' : 'disabled'}><i data-lucide="shuffle" class="w-4 h-4"></i>Shuffle</button>
      </div>
      <div id="made"></div>
    </div>
  </section>`);
  const focusBox = section.querySelector('#focus');
  if (!known.length) focusBox.appendChild(el(`<p class="text-xs text-ink-faint">Tick some sounds first.</p>`));
  for (const g of known) {
    const on = draft.focus.includes(g);
    const b = el(`<button id="focus-${esc(g)}" aria-pressed="${on}" class="min-w-[44px] h-11 px-2.5 rounded-xl border text-base font-600 ${on ? 'bg-brand-light border-brand' : 'bg-paper border-paper-line text-ink-soft'}">${esc(g)}</button>`);
    b.onclick = () => {
      draft.focus = on ? draft.focus.filter(x => x !== g) : [...draft.focus, g];
      draft.chosen = true;
      redraw();
    };
    focusBox.appendChild(b);
  }
  section.querySelectorAll('input[name=len]').forEach(r => { r.onchange = () => { draft.pages = Number(r.value); if (draft.made) redraw(); }; });
  section.querySelector('#make').onclick = () => { draft.made = true; redraw(); };
  section.querySelector('#shuffle').onclick = () => { draft.seed += 1; redraw(); };

  if (draft.made) {
    // The story leaves out any name a learner here has (read on this
    // computer, never sent).
    const avoidNames = store.get().students.map(s => s.name);
    const book = generateBook(code, { focus: draft.focus, focusClusters: draft.clusters && !draft.focus.length, pages: draft.pages, seed: draft.seed, avoidNames });
    const out = section.querySelector('#made');
    if (!book) {
      const msg = stageOf(reading) >= 1
        ? 'Every story name these sounds can spell matches a learner here. Tick another set of sounds on the reading setup so the story can use a different name.'
        : 'Not enough sounds to write a story yet. Tick a few more on the reading setup (set 1 is enough to start).';
      out.appendChild(el(`<p class="text-sm text-ink-soft">${esc(msg)}</p>`));
    } else {
      const card = bookCard(book, { student, reading, actions: ['booklet', 'flat', 'save'] });
      card.querySelector('.actions').before(el(`<ol class="made-pages text-sm text-ink mt-2 space-y-0.5 list-decimal pl-5">${book.pages.map(p => `<li>${esc(p.text)}</li>`).join('')}</ol>`));
      out.appendChild(card);
    }
  }
  return section;
}
