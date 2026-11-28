// Learner-name redaction, shared by the browser (ai.js, before a prompt is
// built) and server.mjs (on every /api/ai message, as a second layer).
// Dependency-free so the server can import it as is.

// Accents are folded on both sides before matching, so "Zoë", "Zoe" and a
// decomposed "Zoë" are the same name.
const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '');
// Space, control characters, hyphen and apostrophes are interchangeable and
// optional inside a name: "Mary-Jane" also matches "Mary Jane" and "MaryJane",
// "O'Neil" matches "O’Neil", and "Ada\u0007Quill" splits into its words.
const NAME_SEP = /[\s\p{C}\-'‘’]+/u;
const WORD_SPLIT = /[^\p{L}\p{N}\-'‘’]+/u;
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The full name, every word-like run (splitting on whitespace, punctuation and
// control characters, including nicknames inside brackets or quotes) and each
// half of a hyphenated part. Parts of one or two letters ("An", "He", "Do")
// match only capitalized or in capitals so they do not swallow function words;
// everything else, including three-letter parts like "leo" or "mia", and the
// full name itself, matches in any case. Longest first, so a full name goes
// before its parts.
function namePatterns(fullNames) {
  const seen = new Map();
  const add = (name, anyCase) => {
    const tokens = fold(name).split(NAME_SEP).filter(Boolean);
    const letters = tokens.join('');
    if (letters.length < 2) return;
    const key = tokens.join(' ').toLowerCase();
    if (seen.has(key)) return;
    const body = toks => toks.map(escapeRegExp).join(`${NAME_SEP.source.slice(0, -1)}*`);
    const short = !anyCase && letters.length <= 2;
    const source = short
      ? [tokens.map(t => t[0].toUpperCase() + t.slice(1).toLowerCase()), tokens.map(t => t.toUpperCase())].map(body).join('|')
      : body(tokens);
    seen.set(key, { re: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, short ? 'gu' : 'giu'), len: letters.length });
  };
  for (const raw of fullNames) {
    const full = String(raw || '').trim();
    if (!full) continue;
    add(full, true);
    for (const part of fold(full).split(WORD_SPLIT)) {
      add(part, false);
      for (const half of part.split('-')) add(half, false);
    }
  }
  return [...seen.values()].sort((a, b) => b.len - a.len).map(p => p.re);
}

// Matches on accent-folded text but replaces in the original, keeping every
// other accent as written. Returns [start, end) ranges in `text`.
function foldedMatches(text, res) {
  let folded = '';
  const origin = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) origin.push(i);
    folded += f;
    i += ch.length;
  }
  const ranges = [];
  const taken = new Uint8Array(folded.length);
  for (const re of res) {
    for (const m of folded.matchAll(re)) {
      const a = m.index, b = a + m[0].length;
      if (taken.subarray(a, b).some(Boolean)) continue;
      taken.fill(1, a, b);
      ranges.push([origin[a], b < folded.length ? origin[b] : text.length]);
    }
  }
  return ranges.sort((x, y) => x[0] - y[0]);
}

// Replaces each learner (given by full name) with "the child", whole words
// only. A possessive keeps its apostrophe ("Sam's" -> "the child's"); a name
// inside a longer word ("Will" in "willing") is left alone. Limitation: names
// in scripts written without spaces (e.g. 李小龍) are not matched when they run
// straight into other letters, because matching relies on word boundaries.
export function redactNames(text, fullNames) {
  const src = String(text ?? '');
  const ranges = foldedMatches(src, namePatterns(fullNames));
  let out = '', at = 0;
  for (const [a, b] of ranges) {
    out += src.slice(at, a);
    // "the Child" for a learner named Child Harold reads "the child", not "the the child".
    out += /(?:^|[^\p{L}\p{N}_])the\s+$/iu.test(out) ? 'child' : 'the child';
    at = b;
  }
  return out + src.slice(at);
}
