// A learner's reading setup (HAR-45), as stored in the family document under
// `reading[learnerId]`, and what follows from it: the known code, the books
// within it and just beyond it, and the facts a printed book lists. Pure
// functions; store.js keeps the data and document.js checks its shape.
//
// Stored shape (every field optional; normalizeReading fills the gaps):
//   { sequence: 'school-2026',
//     graphemes: ['s', 'a', …],        the sounds the child reads
//     clusters: false,                  adjacent consonants (stop, mist)
//     tricky: null | ['the', …],        null: the default words for the stage
//     custom: { graphemes: [], tricky: [] },  the parent's own additions
//     prefs: { nameOnCover: true, layout: 'booklet' | 'flat' },
//     library: [{ id, savedAt, book }] }
import { checkBook, checkWord, wordsOf } from './decodability.js';
import { NAMES } from './generator.js';
import { BANK } from './bank.js';
import { allGraphemes, DEFAULT_SEQUENCE, defaultTricky, deriveStage, makeCode, sequenceById, stageOfGrapheme, stageSummary, SEQUENCES } from './sequence.js';

export const LAYOUTS = ['booklet', 'flat'];
export const LIBRARY_MAX = 100;
export const GRAPHEME_MAX = 4; // a custom grapheme: up to four letters (igh, tch, eigh)
export const WORD_MAX = 20;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const words = (list, max, test) => {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== 'string') continue;
    const w = raw.trim().toLowerCase();
    if (w && w.length <= max && test(w) && !out.includes(w)) out.push(w);
  }
  return out;
};
const letters = (w) => /^[a-z]+$/.test(w);
// Tricky words keep their case for display ("I"); compared in lower case.
const trickyList = (list) => {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== 'string') continue;
    const w = raw.trim();
    if (w && w.length <= WORD_MAX && /^[A-Za-z]+$/.test(w) && !out.some((x) => x.toLowerCase() === w.toLowerCase())) out.push(w);
  }
  return out;
};

/** The stored value, or nothing, as a complete reading setup. */
export function normalizeReading(value) {
  const v = isObj(value) ? value : {};
  const prefs = isObj(v.prefs) ? v.prefs : {};
  const custom = isObj(v.custom) ? v.custom : {};
  return {
    sequence: SEQUENCES[v.sequence] ? v.sequence : DEFAULT_SEQUENCE,
    graphemes: words(v.graphemes, GRAPHEME_MAX, letters),
    clusters: v.clusters === true,
    tricky: Array.isArray(v.tricky) ? trickyList(v.tricky) : null,
    custom: { graphemes: words(custom.graphemes, GRAPHEME_MAX, letters), tricky: trickyList(custom.tricky) },
    prefs: { nameOnCover: prefs.nameOnCover !== false, layout: LAYOUTS.includes(prefs.layout) ? prefs.layout : 'booklet' },
    library: (Array.isArray(v.library) ? v.library : []).filter((e) => isObj(e) && isObj(e.book) && typeof e.id === 'string').slice(0, LIBRARY_MAX),
  };
}

// The stage the graphemes alone reach (the tricky words do not move it).
export function stageOf(reading) {
  const r = normalizeReading(reading);
  return deriveStage(makeCode({ graphemes: r.graphemes, clusters: r.clusters }), sequenceById(r.sequence));
}

// The line the parent sees: "Reading at set 3. Next sounds: h b n v".
export function readingSummary(reading) {
  const r = normalizeReading(reading);
  return stageSummary(makeCode({ graphemes: r.graphemes, clusters: r.clusters }), sequenceById(r.sequence));
}

// The tricky words the child reads: the parent's list, or the default
// progression up to the stage while the parent has not changed it.
export function trickyOf(reading) {
  const r = normalizeReading(reading);
  return r.tricky ?? defaultTricky(stageOf(r), sequenceById(r.sequence));
}

/** The known code: { graphemes, tricky, clusters } as sequence.js makeCode. */
export function knownCode(reading) {
  const r = normalizeReading(reading);
  return makeCode({ graphemes: r.graphemes, tricky: trickyOf(r), clusters: r.clusters });
}

// The stage a book belongs to: the stage of its newest grapheme (the
// clusters stage when it needs adjacent consonants and nothing later).
export function bookStage(book, seq = sequenceById(DEFAULT_SEQUENCE)) {
  let n = 0;
  for (const g of book.graphemes || []) n = Math.max(n, stageOfGrapheme(g, seq));
  if (book.clusters) n = Math.max(n, seq.stages.findIndex((s) => s.clusters) + 1);
  return n;
}

// What a book needs that the code does not have. A tricky word is covered
// when it is ticked, or when the child's sounds already decode it ("her" once
// custom "er" is added; irregular words like "the" stay tricky until ticked).
export function missingFor(book, code) {
  const sounds = makeCode({ graphemes: code.graphemes, clusters: code.clusters });
  const covered = (w) => code.tricky.has(w.toLowerCase()) || checkWord(w, sounds).ok;
  return {
    graphemes: inTeachingOrder((book.graphemes || []).filter((g) => !code.graphemes.has(g))),
    tricky: (book.tricky || []).filter((w) => !covered(w)),
    clusters: !!book.clusters && !code.clusters,
  };
}
const nothingMissing = (m) => !m.graphemes.length && !m.tricky.length && !m.clusters;

/**
 * The bank for a code: `within` (every sound and tricky word known), newest
 * sounds first; `beyond`, books a few sounds away (at most four graphemes,
 * three tricky words), each with what it needs.
 */
export function booksFor(code, bank = BANK) {
  const within = [];
  const beyond = [];
  for (const book of bank) {
    const missing = missingFor(book, code);
    if (nothingMissing(missing)) within.push(book);
    else if (missing.graphemes.length <= 4 && missing.tricky.length <= 3) beyond.push({ book, missing });
  }
  const order = (a, b) => bookStage(b) - bookStage(a);
  within.sort(order);
  beyond.sort((a, b) => bookStage(a.book) - bookStage(b.book));
  return { within, beyond };
}

// "ck sh", "adjacent consonants", "tricky: was you", joined for a muted card.
export function describeMissing(m) {
  const parts = [];
  if (m.graphemes.length) parts.push(m.graphemes.join(' '));
  if (m.clusters) parts.push('adjacent consonants');
  if (m.tricky.length) parts.push(`tricky: ${m.tricky.join(' ')}`);
  return parts.join('; ');
}

// The graphemes in teaching order (the parent's own after the sequence's).
export function inTeachingOrder(graphemes) {
  const order = allGraphemes();
  const rank = (g) => { const i = order.indexOf(g); return i === -1 ? order.length : i; };
  return [...graphemes].sort((a, b) => rank(a) - rank(b));
}

/**
 * What a printed book lists: its sounds in teaching order, tricky words, the
 * words to sound out, and the sounds to show on the cover: the focus sounds
 * the book's words actually use (a generated book asked to practise w may
 * not have managed a w word), or all of its sounds when it uses none.
 */
export function bookFacts(book) {
  const code = makeCode({ graphemes: book.graphemes || [], tricky: book.tricky || [], clusters: !!book.clusters });
  const result = checkBook(book, code);
  const sounds = inTeachingOrder(result.graphemes);
  const used = inTeachingOrder((book.focus || []).filter((g) => sounds.includes(g)));
  const focus = used.length ? used : sounds;
  // Names keep their capital on the back page ("Pip sat", so "Pip", not
  // "pip"): a word never written in lower case that is a story name or is
  // capitalised mid-sentence.
  const names = namesIn(book);
  const shown = result.words.map((w) => (names.has(w) ? w[0].toUpperCase() + w.slice(1) : w));
  // The cover line: a book about adjacent consonants (no focus sounds) says so.
  const coverLine = !(book.focus || []).length && result.clusters ? 'Two consonants together' : `Sounds: ${focus.join(' ')}`;
  return { ok: result.ok, sounds, focus, coverLine, tricky: result.tricky, words: shown, clusters: result.clusters };
}

const STORY_NAMES = new Set(NAMES.map((n) => n.name.toLowerCase()));
function namesIn(book) {
  const lower = new Set();
  const capital = new Set();
  for (const text of [book.title, ...(book.pages || []).map((p) => p.text)]) {
    const raw = String(text || '').split(/\s+/).filter(Boolean);
    raw.forEach((token, i) => {
      const [w] = wordsOf(token);
      if (!w) return;
      if (w[0] === w[0].toLowerCase()) { lower.add(w); return; }
      const start = i === 0 || /[.!?]["'”’)]*$/.test(raw[i - 1]);
      if (!start || STORY_NAMES.has(w.toLowerCase())) capital.add(w.toLowerCase());
    });
  }
  return new Set([...capital].filter((w) => !lower.has(w)));
}

// The sets of the sequence with what the code knows of each, for the
// checklist: [{ number, stage, known: [g], all: bool }].
export function stageChecklist(reading) {
  const r = normalizeReading(reading);
  const seq = sequenceById(r.sequence);
  const known = new Set(r.graphemes);
  return seq.stages.map((stage, i) => ({
    number: i + 1,
    stage,
    tricky: seq.tricky[stage.key] || [],
    all: stage.clusters ? r.clusters : stage.graphemes.every((g) => known.has(g)),
  }));
}

// The focus to offer by default for a new book: the newest stage the child
// knows (its graphemes; adjacent consonants for the clusters stage).
export function defaultFocus(reading) {
  const r = normalizeReading(reading);
  const seq = sequenceById(r.sequence);
  const n = stageOf(r);
  const stage = seq.stages[n - 1];
  if (!stage) return { graphemes: [], clusters: false };
  return { graphemes: [...stage.graphemes], clusters: !!stage.clusters };
}
