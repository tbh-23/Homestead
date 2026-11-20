// Is a word, a sentence or a whole book readable with a child's known code
// (HAR-45)? The one gate every book passes through: the built-in bank (a unit
// test), the generator (before it returns a book) and, later, any drafted
// text. No DOM; importable from Node.
import { allGraphemes, DOUBLES, UNTAUGHT } from './sequence.js';

// Words are split into graphemes the way they are taught: longest grapheme
// first, among every grapheme of the sequence, the common ones it does not
// teach (UNTAUGHT) and the child's own extras, whether or not the child knows
// it yet. So "ship" is sh-i-p, never s-h-i-p, "book" is b-oo-k, never b-o-o-k,
// and a child who knows s and h but not sh cannot "read" it by accident.
const UNIVERSE = [...new Set([...allGraphemes(), ...DOUBLES, ...UNTAUGHT])];

// Words whose letters segment into known sounds but are not said that way
// ("of" is not o-f, "the" is not th-e, "was" is not w-a-s), so they read only
// when ticked as tricky words. ("her" is left out: UNTAUGHT blocks "er" until
// a parent adds custom "er", after which h-er decodes regularly.)
const IRREGULAR = new Set([
  'of', 'the', 'is', 'i', 'to', 'no', 'go', 'into',
  'he', 'she', 'we', 'me', 'be', 'was', 'you',
  'they', 'all', 'are', 'my',
]);

// A vowel, one consonant and a final e (cake, like, home, cute): the e
// changes the vowel, a split digraph. Readable only when the code has that
// split digraph, written a-e, i-e and so on.
function splitDigraph(parts) {
  const n = parts.length;
  if (n < 3 || parts[n - 1] !== 'e') return null;
  const [v, c] = [parts[n - 3], parts[n - 2]];
  if (!/^[aeiou]$/.test(v) || isVowel(c) || c.length > 2 || DOUBLES.includes(c)) return null;
  return `${v}-e`;
}

const isVowel = (part) => part !== 'qu' && /[aeiou]/.test(part);

// The segmentation list for a set of extras, longest first, kept per code
// (and made again if that set has changed size since).
const lists = new WeakMap();
function universeWith(extra) {
  const kept = lists.get(extra);
  if (kept && kept.size === extra.size) return kept.list;
  const list = [...new Set([...UNIVERSE, ...extra])].sort((a, b) => b.length - a.length);
  lists.set(extra, { size: extra.size, list });
  return list;
}

function segment(word, extra) {
  const list = universeWith(extra);
  const parts = [];
  let i = 0;
  while (i < word.length) {
    const g = list.find((x) => word.startsWith(x, i));
    // A letter no grapheme starts with (q on its own) takes one character, and
    // fails below unless the child's code has it.
    const part = g || word[i];
    parts.push(part);
    i += part.length;
  }
  return parts;
}

// A doubled consonant (ss ff ll zz …) is the sound of its letter.
export const soundOf = (part) => (DOUBLES.includes(part) ? part[0] : part);

/**
 * The graphemes of `word` (lower-case ASCII letters) if every one of them is
 * in `graphemes`, else null. Doubled consonants count as the single sound.
 */
export function parse(word, graphemes) {
  const known = graphemes instanceof Set ? graphemes : new Set(graphemes);
  if (!/^[a-z]+$/.test(word)) return null;
  const parts = segment(word, known);
  return parts.every((p) => known.has(soundOf(p))) ? parts : null;
}

// True when the parts hold two consonant sounds side by side (st-o-p,
// m-i-s-t), the "adjacent consonants" stage. A final -s after a consonant
// (taps, sits) does not count: it comes long before blends.
export function hasCluster(parts) {
  const body = parts.length > 1 && parts[parts.length - 1] === 's' && !isVowel(parts[parts.length - 2])
    ? parts.slice(0, -1) : parts;
  for (let i = 1; i < body.length; i++) {
    if (!isVowel(body[i]) && !isVowel(body[i - 1])) return true;
  }
  return false;
}

// Punctuation around a word, stripped before the check. Anything inside a
// word that is not an ASCII letter (a digit, an accented letter, a hyphen or
// an apostrophe) makes it fail instead.
const EDGE = /^[.,!?;:"'()‘’“”–—…-]+|[.,!?;:"'()‘’“”–—…-]+$/g;

// The words of a text, punctuation stripped from their ends.
export function wordsOf(text) {
  return String(text).split(/\s+/).map((raw) => raw.replace(EDGE, '')).filter(Boolean);
}

// One word against the code: { ok, word (lower case), tricky, parts }.
export function checkWord(raw, code) {
  if (!/^[A-Za-z]+$/.test(raw)) return { ok: false, word: raw.toLowerCase(), tricky: false, parts: null };
  // A capitalised name reads like any other word: P-a-t, Pat.
  const word = raw.toLowerCase();
  if (code.tricky.has(word)) return { ok: true, word, tricky: true, parts: null };
  if (IRREGULAR.has(word)) return { ok: false, word, tricky: false, parts: null };
  const parts = parse(word, code.graphemes);
  const split = parts && splitDigraph(parts);
  const ok = !!parts && (!split || code.graphemes.has(split)) && (code.clusters || !hasCluster(parts));
  return { ok, word, tricky: false, parts };
}

/** The words of `text` the code cannot read, each once, in order. */
export function checkText(text, code) {
  const failing = [];
  for (const w of wordsOf(text)) {
    const r = checkWord(w, code);
    if (!r.ok && !failing.includes(r.word)) failing.push(r.word);
  }
  return failing;
}

/**
 * A whole book (its title and every page's text) against the code:
 * { ok, failing, words, tricky, graphemes, clusters }, where `words` are the
 * words to sound out (sorted, no tricky words), `tricky` the tricky words it
 * uses, `graphemes` every grapheme its words use (doubles as their letter)
 * and `clusters` whether any word has adjacent consonants.
 */
export function checkBook(book, code) {
  const texts = [book.title, ...(book.pages || []).map((p) => p.text)];
  const failing = [];
  const words = new Set();
  const tricky = new Set();
  const graphemes = new Set();
  let clusters = false;
  for (const text of texts) {
    for (const w of wordsOf(text)) {
      const r = checkWord(w, code);
      if (!r.ok) { if (!failing.includes(r.word)) failing.push(r.word); continue; }
      if (r.tricky) { tricky.add(r.word); continue; }
      words.add(r.word);
      for (const p of r.parts) graphemes.add(soundOf(p));
      if (hasCluster(r.parts)) clusters = true;
    }
  }
  return { ok: failing.length === 0, failing, words: [...words].sort(), tricky: [...tricky], graphemes: [...graphemes], clusters };
}
