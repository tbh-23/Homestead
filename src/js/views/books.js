// Books for one learner (HAR-45, HAR-70), `#learner/<id>/books`: the featured
// A4 Fluency Workbook & Practise Sheets card, the built-in books within their
// known code (newest sounds first), the ones a few sounds further on (muted,
// with what they need), "Make a new book" from the word bank, and the learner's
// library of saved books. Everything works without an AI provider and nothing
// is sent anywhere; the learner's name only reaches a printed cover when the
// parent asked for it.
import * as store from '../store.js';
import { el, esc, fmtDate, keepFocus, toast } from '../ui.js';
import { BANK } from '../phonics/bank.js';
import { generateBook } from '../phonics/generator.js';
import { renderScene } from '../phonics/pictures.js';
import { bookFacts, booksFor, defaultFocus, describeMissing, inTeachingOrder, knownCode, readingSummary, stageOf } from '../phonics/reading.js';
import { practiseSheetData, workbookPlan } from '../phonics/workbook.js';
import { printBook, printPractiseSheet, printStorySheet, printWorkbook } from './bookprint.js';

const CARD = 'bg-paper-card border border-paper-line rounded-2xl p-4';
const BTN = 'inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-full text-sm font-medium';
const BTN_SOFT = `${BTN} bg-paper border border-paper-line text-ink`;
const BTN_TINT = `${BTN} bg-brand-light border border-brand/30 text-brand-dark`;

// The book being made, per learner, for this visit: { focus, pages, seed }.
const drafts = new Map();
// Print workbook UI toggles per learner, for this visit.
const printOpts = new Map();

const optsFor = (studentId) => {
  if (!printOpts.has(studentId)) printOpts.set(studentId, { soundButtons: true, drawBox: true });
  return printOpts.get(studentId);
};

const ownerOf = (student, reading) => (reading.prefs.nameOnCover ? student.name : '');
// "Sounds: ck sh", or for a book about adjacent consonants, that.
const soundsOf = (book) => bookFacts(book).coverLine;

function bookCard(book, { student, reading, opts, actions = ['story-sheet', 'booklet', 'flat', 'save'], muted = '', date = null, onRemove = null }) {
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
  const add = (label, icon, fn, cls = BTN_SOFT) => {
    const b = el(`<button class="${cls}"><i data-lucide="${esc(icon)}" class="w-4 h-4"></i>${esc(label)}</button>`);
    b.onclick = fn;
    bar.appendChild(b);
  };
  const print = (layout) => printBook(book, {
    layout,
    ownerName: ownerOf(student, reading),
    soundButtons: opts.soundButtons,
    drawBox: opts.drawBox,
  });
  if (actions.includes('story-sheet')) add('Print A4 story sheet', 'file-text', () => printStorySheet(book, { drawBox: opts.drawBox }), BTN_TINT);
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

function workbookSection(student, reading, opts) {
  const stage = stageOf(reading);
  const plan = workbookPlan(reading, { bank: BANK });
  const sheetStage = Math.max(1, stage);
  const sheet = practiseSheetData(reading, { stageNumber: sheetStage, bank: BANK });
  const canPrintWorkbook = plan.items.length > 0;
  const pageTotal = canPrintWorkbook ? plan.items.length + 1 : 0;

  const section = el(`<section id="workbook-section" aria-labelledby="workbook-h" class="mb-8">
    <div class="${CARD} p-5">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div class="min-w-0 max-w-xl">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-600 uppercase tracking-wide bg-brand-light text-brand-dark mb-2">
            <i data-lucide="book-open" class="w-3.5 h-3.5"></i>A4 printable workbook &amp; sheets
          </span>
          <h2 id="workbook-h" class="font-display text-xl sm:text-2xl font-600 leading-snug">A4 Fluency Workbook &amp; Practise Sheets</h2>
          <p class="text-sm text-ink-soft mt-1.5 leading-relaxed">Print PhOrMeS-style practise sheets (Focus &amp; Previous Sounds boxes, Decodable Words grids, Sound it. Blend it. guide) paired with single-page decodable stories and Draw a picture boxes.</p>
          ${!canPrintWorkbook ? `<p class="text-xs text-ink-soft mt-2">Tick at least set 1 (s a t p) on the reading setup to build a full fluency workbook.</p>` : ''}
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button id="print-workbook" class="${BTN} bg-brand text-white disabled:opacity-50" ${canPrintWorkbook ? '' : 'disabled'}>
            <i data-lucide="book-open" class="w-4 h-4"></i>Print A4 Workbook${pageTotal ? ` (${pageTotal}p)` : ''}
          </button>
          <button id="print-practise-sheet" class="${BTN_SOFT}">
            <i data-lucide="file-text" class="w-4 h-4"></i>Print Practise Sheet (Set ${sheetStage})
          </button>
        </div>
      </div>
      <div class="mt-4 pt-3.5 border-t border-paper-line flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-5">
          <label class="inline-flex items-center gap-2.5 h-11 cursor-pointer text-sm font-medium text-ink">
            <input id="opt-sound-buttons" type="checkbox" class="w-4 h-4 accent-[#3f6b3b]" ${opts.soundButtons ? 'checked' : ''}>
            <span>Sound-button underlines</span>
          </label>
          <label class="inline-flex items-center gap-2.5 h-11 cursor-pointer text-sm font-medium text-ink">
            <input id="opt-draw-box" type="checkbox" class="w-4 h-4 accent-[#3f6b3b]" ${opts.drawBox ? 'checked' : ''}>
            <span>Draw a picture box</span>
          </label>
        </div>
        <p class="text-xs text-ink-faint">Standard A4 portrait · pure B&amp;W line art · ink-friendly</p>
      </div>
    </div>
  </section>`);

  section.querySelector('#opt-sound-buttons').onchange = (e) => { opts.soundButtons = e.target.checked; redraw(); };
  section.querySelector('#opt-draw-box').onchange = (e) => { opts.drawBox = e.target.checked; redraw(); };
  section.querySelector('#print-workbook').onclick = () => {
    if (!canPrintWorkbook) return;
    printWorkbook(plan, {
      ownerName: ownerOf(student, reading),
      soundButtons: opts.soundButtons,
      drawBox: opts.drawBox,
    });
  };
  section.querySelector('#print-practise-sheet').onclick = () => {
    printPractiseSheet(sheet, { soundButtons: opts.soundButtons });
  };
  return section;
}

export function renderBooks(student, { navigate }) {
  const reading = store.readingFor(student.id);
  const code = knownCode(reading);
  const opts = optsFor(student.id);
  const root = el(`<div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  root.appendChild(el(`<div class="mb-5">
    <p class="text-xs font-600 uppercase tracking-wide text-ink-faint mb-1">Parent view · decodable books</p>
    <h1 class="font-display text-2xl sm:text-3xl font-600 [overflow-wrap:anywhere]">Books for ${esc(student.name)}</h1>
    <p id="books-stage" class="text-sm text-ink mt-1">${esc(readingSummary(reading))}
      <button id="to-setup" class="text-brand-dark font-medium underline underline-offset-2 h-11">Change the sounds</button></p>
  </div>`));
  root.querySelector('#to-setup').onclick = () => navigate('learner', { id: student.id });

  // ---- A4 fluency workbook & practise sheets ----
  root.appendChild(workbookSection(student, reading, opts));

  // ---- the bank ----
  const { within, beyond } = booksFor(code, BANK);
  const bank = el(`<section aria-labelledby="bank-h" class="mb-8"><h2 id="bank-h" class="font-display text-xl font-600 mb-3">Ready to read</h2>
    <div id="bank-list" class="grid gap-3 md:grid-cols-2"></div></section>`);
  const list = bank.querySelector('#bank-list');
  if (!within.length) {
    list.appendChild(el(`<p class="text-sm text-ink-soft md:col-span-2 [overflow-wrap:anywhere]">No book uses only the sounds ticked so far. Tick the sounds ${esc(student.name)} knows on the reading setup, or start with set 1: s a t p.</p>`));
  }
  for (const book of within) list.appendChild(bookCard(book, { student, reading, opts }));
  if (beyond.length) {
    bank.appendChild(el(`<h3 class="text-sm font-600 text-ink-soft mt-5 mb-2">A little further on</h3>`));
    const further = el(`<div id="beyond-list" class="grid gap-3 md:grid-cols-2"></div>`);
    for (const { book, missing } of beyond) further.appendChild(bookCard(book, { student, reading, opts, actions: [], muted: describeMissing(missing) }));
    bank.appendChild(further);
  }
  root.appendChild(bank);

  // ---- make a new book ----
  root.appendChild(makeSection(student, reading, code, opts));

  // ---- the library ----
  const lib = el(`<section aria-labelledby="lib-h" class="mb-8"><h2 id="lib-h" class="font-display text-xl font-600 mb-3">Library</h2>
    <div id="library-list" class="grid gap-3 md:grid-cols-2"></div></section>`);
  const libList = lib.querySelector('#library-list');
  if (!reading.library.length) libList.appendChild(el(`<p class="text-sm text-ink-soft md:col-span-2">Saved books appear here, to print again.</p>`));
  for (const entry of reading.library) {
    libList.appendChild(bookCard(entry.book, {
      student, reading, opts, actions: ['print', 'story-sheet'], date: entry.savedAt,
      onRemove: () => { store.removeFromLibrary(student.id, entry.id); toast(`Removed “${entry.book.title}”`); },
    }));
  }
  root.appendChild(lib);
  return root;
}

// The view re-renders on every change; the focus stays on the control used.
const redraw = () => { const restore = keepFocus(); store.redraw(); restore(); };

function makeSection(student, reading, code, opts) {
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
      const card = bookCard(book, { student, reading, opts, actions: ['story-sheet', 'booklet', 'flat', 'save'] });
      card.querySelector('.actions').before(el(`<ol class="made-pages text-sm text-ink mt-2 space-y-0.5 list-decimal pl-5">${book.pages.map(p => `<li>${esc(p.text)}</li>`).join('')}</ol>`));
      out.appendChild(card);
    }
  }
  return section;
}
