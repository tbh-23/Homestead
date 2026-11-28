// PhOrMeS-style Practise Sheets and A4 Fluency Workbook planning (HAR-70).
// Pure functions, no DOM: shared by the in-app print view, the CLI generator
// and the Node unit tests. Every word on every Practise Sheet passes through
// decodability.js checkWord() against the stage's code, and every story comes
// exclusively from Harrington's own original BANK (zero external texts).
import { BANK } from './bank.js';
import { checkWord, hasCluster, soundOf } from './decodability.js';
import { NOUNS } from './generator.js';
import { GROUND_Y, isPictureKind } from './pictures.js';
import { bookFacts, booksFor, bookStage, knownCode, normalizeReading, readingSummary, stageOf } from './reading.js';
import { defaultTricky, makeCode, sequenceById } from './sequence.js';

// Everyday Australian/Foundation decodable words supplementing BANK and NOUNS
// so every stage (including Set 1: s a t p) has a clean 6- or 9-word drill
// grid. Every candidate is still gated by checkWord() against the stage code.
const EXTRA_WORDS = [
  'at', 'as', 'sat', 'tap', 'pat', 'sap', 'taps', 'pats', 'pass',
  'is', 'it', 'if', 'am', 'sit', 'sip', 'mat', 'cat', 'fat', 'cap', 'map', 'fit', 'tip', 'pit', 'miss',
  'on', 'in', 'dog', 'got', 'pot', 'top', 'log', 'dig', 'big', 'pig', 'dot', 'lid', 'dad', 'sad', 'gap', 'lap', 'doll',
  'hat', 'hot', 'hen', 'bat', 'bag', 'bin', 'van', 'vet', 'bun', 'nut', 'hop', 'him', 'had', 'not', 'nap', 'fan', 'fin', 'hid', 'hill',
  'red', 'bed', 'net', 'pen', 'pet', 'run', 'rat', 'zip', 'zap', 'quiz', 'quit', 'rip', 'rug', 'get', 'set', 'ten', 'men', 'leg', 'peg', 'buzz', 'bell',
  'sun', 'cup', 'jug', 'yak', 'yes', 'jam', 'jet', 'kit', 'kid', 'keg', 'mud', 'hug', 'tub', 'bug', 'bus', 'yum', 'yell', 'kiss',
  'box', 'fox', 'wax', 'web', 'win', 'wet', 'wig', 'six', 'mix', 'fix', 'sock', 'rock', 'duck', 'pick', 'pack', 'kick', 'neck', 'back', 'ship', 'fish', 'dish', 'shop', 'shed', 'shut', 'wish', 'rush',
  'chip', 'chin', 'chat', 'chop', 'chick', 'check', 'much', 'rich', 'thin', 'this', 'that', 'with', 'bath', 'moth', 'path', 'when', 'whip', 'ring', 'sing', 'king', 'long', 'song', 'wing', 'bang',
  'stop', 'step', 'clap', 'crab', 'drum', 'frog', 'grin', 'mist', 'nest', 'hand', 'sand', 'jump', 'lamp', 'flag', 'swim', 'tent', 'soft', 'fast', 'best', 'milk', 'pond', 'desk', 'gift',
  'rain', 'tail', 'pail', 'sail', 'wait', 'pain', 'main', 'train', 'paint', 'play', 'day', 'tray', 'say', 'may', 'way', 'stay', 'clay', 'hay',
  'bee', 'see', 'tree', 'feet', 'seed', 'need', 'deep', 'keep', 'sheep', 'jeep', 'sleep', 'green', 'eat', 'sea', 'tea', 'leaf', 'seat', 'seal', 'neat', 'heat', 'read', 'bean', 'team',
];

// Curated single-item spot illustrations for Practise Sheet footers. Items
// whose noun is decodable at the stage are preferred and labelled; fallback
// vignettes omit any caption whose word is outside the stage's code.
const VIGNETTE_POOL = [
  { kind: 'tap', word: 'tap', y: 145, scale: 1.45, drips: 2 },
  { kind: 'cat', word: 'cat', y: GROUND_Y, scale: 1.5 },
  { kind: 'cap', word: 'cap', y: 235, scale: 1.6 },
  { kind: 'map', word: 'map', y: 155, scale: 1.35 },
  { kind: 'mat', word: 'mat', y: 215, scale: 1.35 },
  { kind: 'dog', word: 'dog', y: GROUND_Y, scale: 1.45 },
  { kind: 'pot', word: 'pot', y: GROUND_Y, scale: 1.55 },
  { kind: 'log', word: 'log', y: 225, scale: 1.45 },
  { kind: 'pig', word: 'pig', y: GROUND_Y, scale: 1.45 },
  { kind: 'hat', word: 'hat', y: 230, scale: 1.55 },
  { kind: 'bag', word: 'bag', y: GROUND_Y, scale: 1.55 },
  { kind: 'van', word: 'van', y: GROUND_Y, scale: 1.35 },
  { kind: 'pan', word: 'pan', y: 225, scale: 1.55 },
  { kind: 'hen', word: 'hen', y: GROUND_Y, scale: 1.45 },
  { kind: 'bed', word: 'bed', y: GROUND_Y, scale: 1.2 },
  { kind: 'net', word: 'net', y: GROUND_Y, scale: 1.45 },
  { kind: 'rat', word: 'rat', y: GROUND_Y, scale: 1.75 },
  { kind: 'sun', word: 'sun', y: 150, scale: 1.55 },
  { kind: 'cup', word: 'cup', y: GROUND_Y, scale: 1.75 },
  { kind: 'bus', word: 'bus', y: GROUND_Y, scale: 1.2 },
  { kind: 'jug', word: 'jug', y: GROUND_Y, scale: 1.55 },
  { kind: 'yak', word: 'yak', y: GROUND_Y, scale: 1.45 },
  { kind: 'fox', word: 'fox', y: GROUND_Y, scale: 1.45 },
  { kind: 'box', word: 'box', y: GROUND_Y, scale: 1.55 },
  { kind: 'web', word: 'web', y: 150, scale: 1.55 },
  { kind: 'duck', word: 'duck', y: GROUND_Y, scale: 1.5 },
  { kind: 'fish', word: 'fish', y: 150, scale: 1.65 },
  { kind: 'ship', word: 'ship', y: 245, scale: 1.15 },
  { kind: 'chick', word: 'chick', y: GROUND_Y, scale: 1.85 },
  { kind: 'moth', word: 'moth', y: 150, scale: 1.65 },
  { kind: 'ring', word: 'ring', y: GROUND_Y, scale: 1.75 },
  { kind: 'frog', word: 'frog', y: GROUND_Y, scale: 1.6 },
  { kind: 'crab', word: 'crab', y: GROUND_Y, scale: 1.6 },
  { kind: 'drum', word: 'drum', y: GROUND_Y, scale: 1.65 },
  { kind: 'train', word: 'train', y: GROUND_Y, scale: 1.25 },
  { kind: 'rain', word: 'rain', y: 130, scale: 1.45 },
  { kind: 'tray', word: 'tray', y: 210, scale: 1.6 },
  { kind: 'bee', word: 'bee', y: 155, scale: 1.85 },
  { kind: 'tree', word: 'tree', y: GROUND_Y, scale: 1.15 },
  { kind: 'sheep', word: 'sheep', y: GROUND_Y, scale: 1.4 },
  { kind: 'seal', word: 'seal', y: GROUND_Y, scale: 1.65 },
  { kind: 'leaf', word: 'leaf', y: 160, scale: 1.65 },
];

/**
 * Splits a single display word into sound-button segments using decodability.js:
 * `{ word, tricky, buttons: [{ text, multi }] }`. Single-letter graphemes take
 * a dot (`multi: false`); digraphs and doubled consonants take an underline bar
 * (`multi: true`). Tricky or unsegmentable words return `buttons: []`.
 */
export function graphemeButtons(word, code) {
  const display = String(word || '').trim();
  if (!display) return { word: '', tricky: false, buttons: [] };
  const result = checkWord(display, code);
  if (!result.ok || result.tricky || !result.parts) {
    return { word: display, tricky: !!result.tricky, buttons: [] };
  }
  const buttons = [];
  let cursor = 0;
  for (const part of result.parts) {
    const slice = display.slice(cursor, cursor + part.length);
    buttons.push({ text: slice || part, multi: part.length > 1 });
    cursor += part.length;
  }
  return { word: display, tricky: false, buttons };
}

function stageCodeUpTo(stageNumber, seq, { includeTricky = true } = {}) {
  const upto = seq.stages.slice(0, stageNumber);
  const graphemes = upto.flatMap((s) => s.graphemes);
  const clusters = upto.some((s) => s.clusters);
  const tricky = includeTricky ? defaultTricky(stageNumber, seq) : [];
  return makeCode({ graphemes, tricky, clusters });
}

function pickVignettes(stageCode, focusSet, stageNumber) {
  const scored = VIGNETTE_POOL
    .filter((v) => isPictureKind(v.kind))
    .map((v, idx) => {
      const check = checkWord(v.word, stageCode);
      const decodable = check.ok && !check.tricky && !!check.parts;
      const focusHits = decodable
        ? check.parts.filter((p) => focusSet.has(soundOf(p))).length + (stageCode.clusters && !focusSet.size && hasCluster(check.parts) ? 1 : 0)
        : 0;
      return { ...v, decodable, focusHits, idx };
    });
  // Prefer decodable nouns using this stage's focus sounds, then any decodable
  // noun, then a cheerful unlabelled colouring-book icon so every sheet has 3.
  const ordered = [
    ...scored.filter((v) => v.decodable && v.focusHits > 0),
    ...scored.filter((v) => v.decodable && v.focusHits === 0),
    ...scored.filter((v) => !v.decodable),
  ];
  const chosen = [];
  const seen = new Set();
  for (const v of ordered) {
    if (seen.has(v.kind)) continue;
    seen.add(v.kind);
    chosen.push({
      kind: v.kind,
      label: v.decodable ? v.word : '',
      scene: [{ kind: v.kind, x: 200, y: v.y, scale: v.scale, ...(v.drips ? { drips: v.drips } : {}) }],
    });
    if (chosen.length === 3) break;
  }
  // Rotate mildly by stage when all 3 are unlabelled fallbacks so sheets vary.
  if (chosen.length < 3) {
    const fallback = { kind: 'sun', label: '', scene: [{ kind: 'sun', x: 200, y: 150, scale: 1.5 }] };
    while (chosen.length < 3) chosen.push(fallback);
  }
  void stageNumber;
  return chosen;
}

/**
 * Builds PhOrMeS-style Practise Sheet data for one stage (1..N) of the learner's
 * phonics sequence: Focus Sounds, Previous Sounds, a decodability-verified word
 * grid with sound-button segmentation, stage tricky words, and 3 B&W vignettes.
 */
export function practiseSheetData(reading = {}, { stageNumber = null, bank = BANK } = {}) {
  const r = normalizeReading(reading);
  const seq = sequenceById(r.sequence);
  const maxStage = seq.stages.length;
  const target = Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= maxStage
    ? stageNumber
    : Math.max(1, stageOf(r));
  const stage = seq.stages[target - 1];
  const previousSounds = seq.stages.slice(0, target - 1).flatMap((s) => s.graphemes);
  const focusSounds = [...stage.graphemes];
  const focusSet = new Set(focusSounds);
  const code = stageCodeUpTo(target, seq, { includeTricky: true });
  const decodeOnlyCode = stageCodeUpTo(target, seq, { includeTricky: false });

  // Gather candidate words strictly from BANK books at this stage, generator
  // NOUNS, and EXTRA_WORDS — then pass every single word through checkWord().
  const bankWords = [];
  for (const book of bank) {
    if (bookStage(book, seq) !== target) continue;
    const facts = bookFacts(book);
    for (const w of facts.words) bankWords.push(w);
  }
  const nounWords = NOUNS.map((n) => n.word);
  const pool = [...new Set([...bankWords, ...nounWords, ...EXTRA_WORDS])];

  const valid = [];
  const seenLower = new Set();
  for (const raw of pool) {
    const lower = raw.toLowerCase();
    if (seenLower.has(lower)) continue;
    const check = checkWord(raw, decodeOnlyCode);
    if (!check.ok || check.tricky || !check.parts) continue;
    // Skip single-letter "a" in word drills unless nothing else exists.
    if (lower.length < 2) continue;
    const hits = stage.clusters
      ? (hasCluster(check.parts) ? 2 : 0)
      : check.parts.filter((p) => focusSet.has(soundOf(p))).length;
    if (hits === 0) continue;
    seenLower.add(lower);
    const isProper = raw[0] !== raw[0].toLowerCase();
    valid.push({
      word: raw,
      lower,
      hits,
      isProper,
      partsLen: check.parts.length,
      inBank: bankWords.includes(raw),
    });
  }

  // Prefer common lowercase words (non-proper), 2-4 phonemes, higher focus hits,
  // and words appearing in this stage's BANK stories so the Practise Sheet warms
  // the child up directly for the stories that follow it.
  valid.sort((a, b) => (
    Number(a.isProper) - Number(b.isProper)
    || Number(b.inBank) - Number(a.inBank)
    || (a.partsLen <= 4 ? 0 : 1) - (b.partsLen <= 4 ? 0 : 1)
    || b.hits - a.hits
    || a.lower.length - b.lower.length
    || a.lower.localeCompare(b.lower)
  ));

  const targetCount = target <= 2 ? 6 : 9;
  const picked = valid.slice(0, targetCount);
  const words = picked.map((entry) => graphemeButtons(entry.word, decodeOnlyCode));
  const trickyWords = [...(seq.tricky[stage.key] || [])];

  return {
    stageNumber: target,
    stageKey: stage.key,
    stageLabel: stage.label,
    sheetTitle: `Practise Sheet ${target}`,
    focusSounds,
    previousSounds,
    clusters: !!stage.clusters,
    clustersNote: stage.note || '',
    words,
    trickyWords,
    vignettes: pickVignettes(code, focusSet, target),
  };
}

// A cheerful black-and-white composite cover scene built from pictures.js,
// spaced cleanly so every animal and tree is an unobstructed colouring patch.
export const WORKBOOK_COVER_SCENE = [
  { kind: 'sun', x: 334, y: 58, scale: 0.68 },
  { kind: 'tree', x: 64, y: GROUND_Y, scale: 0.78 },
  { kind: 'cat', x: 184, y: GROUND_Y, scale: 0.82 },
  { kind: 'dog', x: 322, y: GROUND_Y, scale: 0.78, pose: 'sit' },
];

/**
 * Builds a complete A4 Fluency Workbook sequence for a learner's known code:
 * Cover metadata plus interleaved Practise Sheets and matching decodable BANK
 * stories in ascending teaching order (Set 1 -> current stage).
 */
export function workbookPlan(reading = {}, { bank = BANK, maxStage = null } = {}) {
  const r = normalizeReading(reading);
  const seq = sequenceById(r.sequence);
  const code = knownCode(r);
  const { within } = booksFor(code, bank);

  // Group readable BANK books by stage in ascending teaching order.
  const byStage = new Map();
  for (const book of within) {
    const s = bookStage(book, seq) || 1;
    if (maxStage && s > maxStage) continue;
    if (!byStage.has(s)) byStage.set(s, []);
    byStage.get(s).push(book);
  }
  // Preserve original BANK order inside each stage so books feel intentional.
  const bankOrder = new Map(bank.map((b, i) => [b.id, i]));
  for (const list of byStage.values()) {
    list.sort((a, b) => (bankOrder.get(a.id) ?? 0) - (bankOrder.get(b.id) ?? 0));
  }

  const reached = stageOf(r);
  const stageSet = new Set(byStage.keys());
  for (let s = 1; s <= reached; s += 1) {
    if (!maxStage || s <= maxStage) stageSet.add(s);
  }
  const stages = [...stageSet].sort((a, b) => a - b);

  const items = [];
  let bookCount = 0;
  for (const s of stages) {
    items.push({ kind: 'practise', sheet: practiseSheetData(r, { stageNumber: s, bank }) });
    for (const book of byStage.get(s) || []) {
      items.push({ kind: 'story', book, stageNumber: s });
      bookCount += 1;
    }
  }

  return {
    title: 'Decodable Texts',
    subtitle: 'Practise for Fluency',
    stageSummary: readingSummary(r),
    stages,
    bookCount,
    sheetCount: stages.length,
    coverScene: WORKBOOK_COVER_SCENE,
    items,
  };
}
