// "Make a new book" without AI (HAR-45): sentence frames filled from a small
// word bank, every word filtered by the child's known code, words with the
// focus sounds favoured. Deterministic for a seed, so Shuffle is just another
// seed and a saved book can be made again. A book is only ever returned after
// it passes checkBook, the same gate the bank passes.
//
// The AI hook. A later drafter (a local model, say) would propose
// { title, pages: [{ text, scene }] } and hand it to acceptDraft(draft, code)
// below, which runs the same checks and returns null for anything that
// fails, so a drafted book can never ask for a sound the child does not
// know. That drafter must be given the known code and picture kinds only,
// never the learner's name or the parent's notes (HAR-19). Not built here.
import { checkBook, checkText, checkWord, hasCluster, soundOf } from './decodability.js';
import { GROUND_Y, isPictureKind } from './pictures.js';

// ---- the word bank -----------------------------------------------------------
// Story names: made up, never the learner's (generateBook leaves out any that
// match a learner's first name). hair/cap give each a look. Every stage from
// set 1 (Pat, Tass) to set 11 (Dee, Bea, Lee, Jean) has at least two names to
// practise with.
export const NAMES = [
  { name: 'Pat', cap: true }, { name: 'Tass', hair: 'long' },
  { name: 'Tim' }, { name: 'Sam', hair: 'long' }, { name: 'Pam', hair: 'long' }, { name: 'Pip' }, { name: 'Mim', hair: 'long' },
  { name: 'Tom', cap: true }, { name: 'Dot', hair: 'long' }, { name: 'Dom' },
  { name: 'Ben', cap: true }, { name: 'Dan' }, { name: 'Viv', hair: 'long' }, { name: 'Bob', cap: true }, { name: 'Val', hair: 'long' },
  { name: 'Meg', hair: 'long' }, { name: 'Ted', cap: true }, { name: 'Liz', hair: 'long' }, { name: 'Quin' }, { name: 'Roz', hair: 'long' }, { name: 'Ron', cap: true }, { name: 'Zed' },
  { name: 'Kim', hair: 'long' }, { name: 'Gus' }, { name: 'Jen', hair: 'long' }, { name: 'Ken', cap: true },
  { name: 'Jack', cap: true }, { name: 'Max', cap: true }, { name: 'Josh', cap: true }, { name: 'Wes' }, { name: 'Tash', hair: 'long' }, { name: 'Rex' },
  { name: 'Beth', hair: 'long' }, { name: 'Chip' }, { name: 'Whit', cap: true }, { name: 'Seth' },
  { name: 'Fred', cap: true }, { name: 'Fran', hair: 'long' }, { name: 'Stan', cap: true },
  { name: 'Jay' }, { name: 'Gail', hair: 'long' }, { name: 'Kay', hair: 'long' },
  { name: 'Dee', hair: 'long' }, { name: 'Bea', hair: 'long' }, { name: 'Lee' }, { name: 'Jean', hair: 'long' },
];

// Nouns, each drawn by its own dedicated picture. Flags state the exact
// actions and adjectives each noun supports so frames never pair mismatched
// verbs and objects ("shuts a ship" or "fixes a cap").
export const NOUNS = [
  { word: 'cat', pic: 'cat', animal: true, small: true, pet: true, hug: true, feed: true },
  { word: 'dog', pic: 'dog', animal: true, pet: true, hug: true, feed: true, wash: true },
  { word: 'pig', pic: 'pig', animal: true, pet: true, feed: true, wash: true },
  { word: 'hen', pic: 'hen', animal: true, small: true, pet: true, feed: true },
  { word: 'duck', pic: 'duck', animal: true, small: true, feed: true },
  { word: 'frog', pic: 'frog', animal: true, small: true },
  { word: 'chick', pic: 'chick', animal: true, small: true, feed: true },
  { word: 'rat', pic: 'rat', animal: true, small: true },
  { word: 'yak', pic: 'yak', animal: true, pet: true, feed: true },
  { word: 'fox', pic: 'fox', animal: true },
  { word: 'crab', pic: 'crab', animal: true, small: true },
  { word: 'sheep', pic: 'sheep', animal: true, pet: true, hug: true, feed: true },
  { word: 'seal', pic: 'seal', animal: true, feed: true },
  { word: 'fish', pic: 'fish', animal: true, floats: true, hold: true, small: true },
  { word: 'bee', pic: 'bee', animal: true, floats: true, sky: true },
  { word: 'moth', pic: 'moth', animal: true, floats: true, sky: true },
  { word: 'tap', pic: 'tap', floats: true, fix: true, tapSound: true },
  { word: 'cap', pic: 'cap', hold: true, wear: true, small: true, hang: true, colour: true },
  { word: 'hat', pic: 'hat', hold: true, small: true, hang: true, colour: true },
  { word: 'map', pic: 'map', hold: true, floats: true, hang: true },
  { word: 'quiz', pic: 'quiz', hold: true, floats: true, small: true },
  { word: 'leaf', pic: 'leaf', hold: true, floats: true, small: true },
  { word: 'sock', pic: 'sock', hold: true, floats: true, small: true, hang: true, wash: true, colour: true },
  { word: 'ring', pic: 'ring', hold: true, small: true },
  { word: 'net', pic: 'net', hold: true, hang: true, fix: true },
  { word: 'kit', pic: 'kit', hold: true, pack: true, shut: true, fix: true, colour: true },
  { word: 'keg', pic: 'keg', hold: true, fill: true, seat: true, tip: true },
  { word: 'drum', pic: 'drum', hold: true, beat: true, tapSound: true, colour: true },
  { word: 'tray', pic: 'tray', hold: true, wash: true, colour: true },
  { word: 'mat', pic: 'mat', seat: true, minor: true, wash: true, colour: true },
  { word: 'rug', pic: 'rug', seat: true, minor: true, wash: true, colour: true },
  { word: 'seat', pic: 'seat', seat: true, fix: true, paint: true, colour: true },
  { word: 'rock', pic: 'rock', seat: true },
  { word: 'log', pic: 'log', seat: true },
  { word: 'cup', pic: 'cup', hold: true, fill: true, tapSound: true, hot: true, small: true, wash: true, tip: true, colour: true },
  { word: 'jug', pic: 'jug', hold: true, fill: true, wash: true, tip: true, colour: true },
  { word: 'pot', pic: 'pot', hold: true, fill: true, tapSound: true, hot: true, wash: true, tip: true },
  { word: 'pan', pic: 'pan', hold: true, fill: true, tapSound: true, hot: true, wash: true },
  { word: 'dish', pic: 'dish', hold: true, fill: true, hot: true, wash: true, colour: true },
  { word: 'pail', pic: 'pail', hold: true, fill: true, holds: true, wash: true, paint: true, tip: true, colour: true },
  { word: 'bag', pic: 'bag', hold: true, pack: true, holds: true, shut: true, zip: true, hang: true, colour: true },
  { word: 'box', pic: 'box', hold: true, pack: true, seat: true, shut: true, paint: true, fix: true, tapSound: true, colour: true },
  { word: 'bath', pic: 'bath', fill: true, tub: true, holds: true },
  { word: 'bed', pic: 'bed', seat: true, fix: true },
  { word: 'bus', pic: 'bus', ride: true, boardOn: true, wash: true, fix: true, paint: true, colour: true },
  { word: 'van', pic: 'van', ride: true, boardIn: true, shut: true, wash: true, fix: true, paint: true, colour: true },
  { word: 'jeep', pic: 'jeep', ride: true, boardIn: true, wash: true, fix: true, paint: true, colour: true },
  { word: 'train', pic: 'train', ride: true, boardOn: true, fix: true, paint: true, colour: true },
  { word: 'ship', pic: 'ship', ride: true, boardOn: true, sail: true, fix: true, paint: true, colour: true },
  { word: 'bell', pic: 'bell', hold: true, rings: true, hang: true, tapSound: true },
  { word: 'web', pic: 'web', floats: true },
  { word: 'sun', pic: 'sun', floats: true, sky: true, hot: true, one: true },
  { word: 'rain', pic: 'rain', floats: true, sky: true, mass: true },
  { word: 'tree', pic: 'tree' },
];

// What animals do on their own: "The duck quacks."
const ANIMAL_ACTS = {
  duck: ['quacks'], dog: ['yaps', 'digs'], hen: ['pecks'], bee: ['buzzes'], chick: ['pecks', 'cheeps'],
  frog: ['hops', 'jumps'], cat: ['naps'], pig: ['digs'], sheep: ['eats', 'sleeps'], moth: ['flaps'], fish: ['swims'],
  rat: ['ran', 'naps'], yak: ['naps'], fox: ['runs', 'naps'], crab: ['nips'], seal: ['claps', 'leaps'],
};
const ANIMAL_POSE = { cat: { naps: 'nap' }, dog: { digs: 'sit' } };

// Verbs, third person. Intransitive ones have a pose (and the plural, for two
// people); transitive ones say which nouns they take.
const INTRANSITIVE = [
  { word: 'sat', pose: 'sit', arms: 'down', two: 'sat' },
  { word: 'sits', pose: 'sit', arms: 'down', two: 'sit' },
  { word: 'taps', arms: 'out', two: 'tap' },
  { word: 'naps', pose: 'sit', arms: 'down', two: 'nap' },
  { word: 'nods', arms: 'down', two: 'nod' },
  { word: 'ran', arms: 'out', two: 'ran' },
  { word: 'grins', arms: 'down', two: 'grin' },
  { word: 'waits', arms: 'down', two: 'wait' },
  { word: 'yells', arms: 'wave', two: 'yell' },
  { word: 'sings', arms: 'wave', two: 'sing' },
  { word: 'sang', arms: 'wave', two: 'sang' },
  { word: 'hums', arms: 'down', two: 'hum' },
  { word: 'runs', arms: 'out', two: 'run' },
  { word: 'jogs', arms: 'out', two: 'jog' },
  { word: 'wins', arms: 'wave', two: 'win' },
  { word: 'chats', arms: 'out', two: 'chat' },
  { word: 'wishes', arms: 'down', two: 'wish' },
  { word: 'peeks', arms: 'down', two: 'peek' },
  { word: 'leaps', arms: 'both', two: 'leap' },
  { word: 'claps', arms: 'both', two: 'clap' },
  { word: 'jumps', arms: 'both', two: 'jump' },
  { word: 'plays', arms: 'both', two: 'play' },
];
const TRANSITIVE = [
  { word: 'has', arms: 'out', takes: (n) => n.hold },
  { word: 'got', arms: 'out', takes: (n) => n.hold && !n.animal },
  { word: 'gets', arms: 'out', takes: (n) => n.hold },
  { word: 'needs', arms: 'out', takes: (n) => n.hold && !n.animal },
  { word: 'checks', arms: 'out', takes: (n) => (n.hold && !n.animal) || n.ride || n.word === 'tap' || n.word === 'web' },
  { word: 'grabs', arms: 'out', takes: (n) => n.hold && !n.animal },
  { word: 'drops', arms: 'out', takes: (n) => n.hold && !n.animal },
  { word: 'tips', arms: 'out', takes: (n) => n.tip },
  { word: 'fills', arms: 'out', takes: (n) => n.fill },
  { word: 'heats', arms: 'out', takes: (n) => n.hot && n.fill },
  { word: 'packs', arms: 'out', takes: (n) => n.pack },
  { word: 'shuts', arms: 'out', takes: (n) => n.shut },
  { word: 'paints', arms: 'out', takes: (n) => n.paint },
  { word: 'fixes', arms: 'out', takes: (n) => n.fix },
  { word: 'taps', arms: 'out', takes: (n) => n.tapSound },
  { word: 'beats', arms: 'out', takes: (n) => n.beat },
  { word: 'rings', arms: 'out', takes: (n) => n.rings },
  { word: 'hangs', arms: 'out', takes: (n) => n.hang },
  { word: 'zips', arms: 'out', takes: (n) => n.zip },
  { word: 'washes', arms: 'out', takes: (n) => n.wash },
  { word: 'sails', arms: 'wave', takes: (n) => n.sail },
  { word: 'pats', pose: 'sit', arms: 'pat', takes: (n) => n.pet },
  { word: 'hugs', pose: 'sit', arms: 'pat', takes: (n) => n.hug },
  { word: 'fed', arms: 'pat', takes: (n) => n.feed },
  { word: 'feeds', arms: 'pat', takes: (n) => n.feed },
  { word: 'sees', arms: 'down', takes: () => true },
  { word: 'fits', arms: 'wave', takes: (n) => n.wear, wears: true },
];
const FAT = ['cat', 'pig', 'hen', 'dog', 'duck', 'frog', 'sheep', 'chick', 'rat', 'yak', 'seal'];
const ADJECTIVES = [
  { word: 'big', fits: (n) => !n.mass, scale: 1.35 },
  { word: 'red', fits: (n) => n.colour || ['hen', 'fox', 'crab', 'leaf', 'bed'].includes(n.word) },
  { word: 'hot', fits: (n) => n.hot },
  { word: 'wet', fits: (n) => (n.animal && !n.sky && !['fish', 'seal', 'crab'].includes(n.word)) || ['mat', 'rug', 'sock', 'cap', 'hat', 'leaf', 'net', 'log', 'rock'].includes(n.word) },
  { word: 'fat', fits: (n) => FAT.includes(n.word), pose: 'fat' },
  { word: 'quick', fits: (n) => (n.animal && n.word !== 'sheep') || n.ride },
  { word: 'thin', fits: (n) => ['cat', 'dog', 'pig', 'rat', 'fox', 'map', 'mat', 'rug', 'leaf', 'dish', 'tray'].includes(n.word) },
  { word: 'long', fits: (n) => ['bus', 'train', 'ship', 'mat', 'rug', 'sock', 'bath', 'bed', 'log', 'net'].includes(n.word) },
  { word: 'deep', fits: (n) => ['bath', 'pail', 'pot', 'cup', 'jug', 'box', 'bag', 'net'].includes(n.word) },
  { word: 'neat', fits: (n) => n.pack || ['bed', 'seat', 'mat', 'rug', 'tray', 'quiz', 'web'].includes(n.word) },
  { word: 'soft', fits: (n) => ['hat', 'cap', 'sock', 'mat', 'rug', 'bed', 'sheep', 'chick', 'cat', 'dog'].includes(n.word) },
];

// ---- a seeded random stream (mulberry32) -------------------------------------
export function rng(seed) {
  // Neighbouring seeds (1, 2, 3 …) start far apart.
  let a = Math.imul((Number(seed) >>> 0) || 1, 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- scenes ----------------------------------------------------------------
const PERSON_SCALE = 1.05;
const SCALE = {
  bus: 0.95, van: 1, ship: 0.95, train: 0.95, jeep: 1, bed: 0.9, tree: 0.9,
  mat: 1, rug: 1, sun: 0.9, bath: 0.85, rock: 0.85, sheep: 0.95, yak: 0.95,
  fox: 0.95, seal: 1, chick: 1.1, rat: 1.1, crab: 1.05, cloud: 1, rain: 1, web: 0.95,
};
const scaleOf = (n) => SCALE[n.pic] || 1;
const look = (who) => ({ ...(who.cap ? { cap: true } : {}), ...(who.hair ? { hair: who.hair } : {}) });
// How tall a thing is at scale 1 (for a floating one, its height about its
// centre), so something in a pail, bag or bath shows its top half above the rim.
const HEIGHT = {
  cat: 108, dog: 112, pig: 120, hen: 124, duck: 97, frog: 78, chick: 67,
  rat: 58, crab: 76, seal: 85, sheep: 102, fish: 60, cap: 55, hat: 82,
  cup: 64, sock: 100, leaf: 70, ring: 86, quiz: 116, map: 122, kit: 82, bell: 93,
};
// How high the top of a seat or a base is, at scale 1.
const TOP = {
  bag: 72, pail: 72, bath: 60, mat: 16, rug: 16, tray: 18, bed: 52, box: 64,
  keg: 76, drum: 62, rock: 58, seat: 62, log: 40, bus: 104, van: 94, jeep: 62, train: 82, ship: 82,
};

function thing(n, x, { scale = scaleOf(n), pose } = {}) {
  const item = { kind: n.pic, x, y: n.sky ? 80 : n.floats ? 150 : GROUND_Y, scale };
  if (pose) item.pose = pose;
  if (n.pic === 'tap') item.y = 110;
  return item;
}

function personItem(who, x, { pose = 'stand', arms = 'down', scale = PERSON_SCALE, cap: wears = false, seat } = {}) {
  const item = { kind: 'person', x, y: GROUND_Y, scale, pose, arms, ...look(who) };
  if (wears) item.cap = true;
  if (seat === false) item.seat = false;
  return item;
}

// A held thing sits at the hand of a person whose right arm is out.
function held(n, x, s) {
  const scale = 0.55 * scaleOf(n);
  const hand = [x + 72 * s, GROUND_Y - 114 * s];
  if (n.floats) return { kind: n.pic, x: hand[0] + 34, y: hand[1] + 6, scale };
  return { kind: n.pic, x: hand[0] + 28, y: hand[1] + 40, scale };
}

// ---- frames ----------------------------------------------------------------
const ON_FLAT_BASES = new Set(['mat', 'rug', 'seat', 'bed', 'box', 'keg']);
const ON_OUTDOOR_BASES = new Set(['mat', 'rug', 'bed', 'rock', 'log']);
const IN_CONTENTS = {
  bath: new Set(['dog', 'pig', 'duck', 'frog', 'cat', 'crab', 'seal']),
  pail: new Set(['frog', 'crab', 'fish', 'cup', 'sock', 'ring', 'leaf']),
  bag: new Set(['cap', 'hat', 'cup', 'sock', 'ring', 'leaf', 'quiz', 'map', 'kit']),
};

function canSitOn(top, base) {
  if (top === base) return false;
  if (top.animal && top.small && !top.sky && !top.floats) return true;
  if (top.word === 'dog' || top.word === 'fox') return ON_OUTDOOR_BASES.has(base.word);
  if (top.hold && !top.animal && !top.floats && top.word !== 'net' && top.word !== 'tray') return ON_FLAT_BASES.has(base.word);
  return false;
}

// Every sentence the frames can make for a protagonist, as
// { text, scene, about: [nouns] }.
function candidates(who, other, nouns) {
  const out = [];
  const add = (text, scene, about = []) => out.push({ text, scene, about });
  const N = who.name;
  add(`${N} sings a song.`, [personItem(who, 200, { arms: 'wave', scale: 1.1 })]);
  add(`${N} sings a long song.`, [personItem(who, 200, { arms: 'wave', scale: 1.1 })]);
  add(`${N} wins. Yes!`, [personItem(who, 200, { arms: 'both', scale: 1.1 })]);
  add(`Did ${N} quit? No!`, [personItem(who, 200, { arms: 'both', scale: 1.1 })]);
  add(`${N} zips off!`, [personItem(who, 200, { arms: 'out', scale: 1.1 })]);
  add(`${N} whizzes along!`, [personItem(who, 200, { arms: 'out', scale: 1.1 })]);
  add(`${N} has a kip.`, [personItem(who, 200, { pose: 'sit', scale: 1.1 })]);
  for (const v of INTRANSITIVE) {
    add(`${N} ${v.word}.`, [personItem(who, 200, { pose: v.pose, arms: v.arms, scale: 1.1 })]);
    if (other && v.two) add(`${N} and ${other.name} ${v.two}.`, [personItem(who, 120, { pose: v.pose, arms: v.arms }), personItem(other, 285, { pose: v.pose, arms: v.arms, scale: 1 })]);
  }
  if (other) {
    add(`${N} sits with ${other.name}.`, [personItem(who, 125, { pose: 'sit' }), personItem(other, 280, { pose: 'sit', scale: 1 })]);
    add(`${N} chats with ${other.name}.`, [personItem(who, 120, { arms: 'out' }), personItem(other, 285, { arms: 'wave', scale: 1 })]);
    add(`${N} plays with ${other.name}.`, [personItem(who, 120, { arms: 'both' }), personItem(other, 285, { arms: 'wave', scale: 1 })]);
  }
  for (const n of nouns) {
    for (const v of TRANSITIVE) {
      if (!v.takes(n)) continue;
      let scene;
      if (v.wears) scene = [personItem(who, 200, { arms: v.arms, cap: true, scale: 1.1 })];
      else if (v.arms === 'out' && n.hold) scene = [personItem(who, 120, { arms: 'out' }), held(n, 120, PERSON_SCALE)];
      else if (v.arms === 'pat') scene = [personItem(who, 115, { pose: v.pose || 'stand', arms: 'pat' }), thing(n, 285, { scale: 0.9 * scaleOf(n) })];
      else if (n.sky) scene = [personItem(who, 130, { arms: v.arms }), thing(n, 290, { scale: 0.85 * scaleOf(n) })];
      else scene = [personItem(who, 110, { arms: v.arms }), thing(n, 280, { scale: 0.85 * scaleOf(n) })];
      if (!n.mass && !n.one) add(`${N} ${v.word} a ${n.word}.`, scene, [n]);
      add(`${N} ${v.word} the ${n.word}!`, scene, [n]);
    }
    if (n.seat) {
      const s = n.word === 'bed' ? 1.1 : n.word === 'seat' ? 1 : 1.3;
      add(`${N} sits on the ${n.word}.`, [thing(n, 200, { scale: s * scaleOf(n) }), { ...personItem(who, n.word === 'bed' ? 230 : 200, { pose: 'sit', scale: 0.95, seat: false }), y: GROUND_Y - TOP[n.word] * s * scaleOf(n) }], [n]);
    }
    if (n.tub) {
      const s = 1.05;
      add(`${N} sits in the ${n.word}.`, [{ ...personItem(who, 190, { pose: 'sit', scale: 0.9, seat: false }), y: GROUND_Y - 20 }, thing(n, 200, { scale: s })], [n]);
      add(`${N} gets in the ${n.word}.`, [thing(n, 230, { scale: 0.9 }), personItem(who, 90, { arms: 'out', scale: 1 })], [n]);
    }
    if (n.boardOn) add(`${N} gets on the ${n.word}.`, [thing(n, 215, { scale: 1.1 * scaleOf(n) }), personItem(who, 360, { arms: 'wave', scale: 0.8 })], [n]);
    if (n.boardIn) add(`${N} gets in the ${n.word}.`, [thing(n, 215, { scale: 1.1 * scaleOf(n) }), personItem(who, 360, { arms: 'wave', scale: 0.8 })], [n]);
    if (n.ride && !n.sail) add(`The ${n.word} stops.`, [thing(n, 200, { scale: 1.15 * scaleOf(n) }), personItem(who, 355, { arms: 'wave', scale: 0.8 })], [n]);
    if (n.sail) add(`The ${n.word} sails.`, [thing(n, 200, { scale: 1.2 * scaleOf(n) })], [n]);
    if (n.ride) {
      add(`The ${n.word} zips off!`, [thing(n, 225, { scale: 1.1 * scaleOf(n) })], [n]);
      add(`The ${n.word} whizzes off!`, [thing(n, 225, { scale: 1.1 * scaleOf(n) })], [n]);
    }
    if (n.one) add(`It is the ${n.word}.`, [thing(n, 200, { scale: 1.3 * scaleOf(n) })], [n]);
    else if (!n.mass) {
      add(`It is a ${n.word}.`, [thing(n, 200, { scale: 1.3 * scaleOf(n) })], [n]);
      add(`A ${n.word}!`, [thing(n, 200, { scale: 1.3 * scaleOf(n) })], [n]);
    }
    for (const act of ANIMAL_ACTS[n.word] || []) {
      const pose = ANIMAL_POSE[n.word]?.[act];
      add(`The ${n.word} ${act}.`, [thing(n, 210, { scale: 1.25 * scaleOf(n), pose })], [n]);
    }
    if (n.hold && !n.animal) add(`Which ${n.word}? This ${n.word}!`, [thing(n, 115, { scale: 0.8 * scaleOf(n) }), thing(n, 290, { scale: 1.1 * scaleOf(n) })], [n]);
    if (n.rings) {
      add('Ding, dong!', [thing(n, 200, { scale: 1.4 })], [n]);
      add('The bell rang!', [thing(n, 200, { scale: 1.4 })], [n]);
      add(`When the bell rings, ${N} runs.`, [thing(n, 120, { scale: 1 }), personItem(who, 280, { arms: 'out' })], [n]);
    }
    if (n.word === 'quiz') {
      add(`${N} did the quiz.`, [personItem(who, 120, { arms: 'out' }), held(n, 120, PERSON_SCALE)], [n]);
      add(`${N} got ten on the quiz!`, [personItem(who, 120, { arms: 'wave' }), thing(n, 285, { scale: 1 })], [n]);
    }
    if (n.word === 'jeep') add('Beep, beep! It is a jeep.', [thing(n, 200, { scale: 1.2 })], [n]);
    if (n.hot && n.fill) {
      add(`Yum, yum! ${N} has the ${n.word}.`, [personItem(who, 120, { arms: 'out' }), held(n, 120, PERSON_SCALE)], [n]);
      add(`${N} mixes in the ${n.word}.`, [personItem(who, 120, { arms: 'out' }), held(n, 120, PERSON_SCALE)], [n]);
    }
    if (n.word === 'duck') add('Quack, quack!', [thing(n, 160, { scale: 1.2 }), thing(n, 290, { scale: 0.8 })], [n]);
    if (n.word === 'chick') add('Cheep, cheep!', [thing(n, 160, { scale: 1.2 }), thing(n, 280, { scale: 0.9 })], [n]);
    if (n.word === 'dog') add('The dog wags its tail.', [thing(n, 200, { scale: 1.3 })], [n]);
    if (n.word === 'cat' || n.word === 'dog' || n.word === 'sheep') {
      add(`${N} sits with the ${n.word}.`, [personItem(who, 120, { pose: 'sit' }), thing(n, 280, { scale: 0.85 * scaleOf(n) })], [n]);
      add(`${N} runs with the ${n.word}.`, [personItem(who, 120, { arms: 'out' }), thing(n, 285, { scale: 0.85 * scaleOf(n) })], [n]);
      add(`${N} plays with the ${n.word}.`, [personItem(who, 120, { arms: 'both' }), thing(n, 285, { scale: 0.85 * scaleOf(n) })], [n]);
    }
    if (n.mass) {
      add('Rain, rain!', [thing(n, 200, { scale: 1.3 })], [n]);
      add(`${N} gets wet.`, [{ ...thing(n, 200, { scale: 0.85 }), y: 40 }, personItem(who, 200, { arms: 'both', scale: 0.85 })], [n]);
      add('It rains.', [{ ...thing(n, 140, { scale: 0.9 }), y: 70 }, { ...thing(n, 280, { scale: 0.8 }), y: 90 }], [n]);
      add(`${N} plays in the rain.`, [{ ...thing(n, 120, { scale: 0.8 }), y: 50 }, { ...thing(n, 290, { scale: 0.7 }), y: 60 }, personItem(who, 200, { arms: 'both', scale: 0.85 })], [n]);
      add(`${N} waits in the rain.`, [{ ...thing(n, 200, { scale: 0.85 }), y: 40 }, personItem(who, 200, { scale: 0.85 })], [n]);
    }
    if (n.pic === 'sun') {
      add('It is a hot day.', [thing(n, 200, { scale: 1.3 })], [n]);
      add(`${N} sits in the sun.`, [{ ...thing(n, 320, { scale: 0.8 }), y: 70 }, personItem(who, 160, { pose: 'sit' })], [n]);
      add(`${N} plays in the sun.`, [{ ...thing(n, 320, { scale: 0.8 }), y: 70 }, personItem(who, 160, { arms: 'both' })], [n]);
    }
    for (const adj of ADJECTIVES) {
      if (!adj.fits(n)) continue;
      const scale = (adj.scale || 1.2) * scaleOf(n);
      add(`The ${n.word} is ${adj.word}.`, [thing(n, 200, { scale, pose: adj.pose })], [n]);
      if ((n.hold || n.animal || n.ride) && !n.sky) add(`${N} has a ${adj.word} ${n.word}.`, [personItem(who, 110), thing(n, 285, { scale: 0.9 * (adj.scale || 1) * scaleOf(n), pose: adj.pose })], [n]);
    }
    if (n.pic === 'tap') {
      add('Tap, tap!', [{ ...thing(n, 200, { scale: 1.3 }), drips: 2 }], [n]);
      add('Tap, tap, tap.', [{ ...thing(n, 200, { scale: 1.3 }), y: 100, drips: 3 }], [n]);
      add('A tap.', [thing(n, 200, { scale: 1.4 })], [n]);
      add(`${N} sat at a tap.`, [personItem(who, 120, { pose: 'sit' }), { ...thing(n, 290, { scale: 1 }), drips: 1 }], [n]);
      add(`Tap, tap! ${N} sat.`, [{ ...thing(n, 300, { scale: 1 }), y: 100, drips: 3 }, personItem(who, 120, { pose: 'sit' })], [n]);
      add(`${N} taps. Tap, tap!`, [personItem(who, 110, { arms: 'out' }), { ...thing(n, 290, { scale: 1 }), y: 100, drips: 2 }], [n]);
      add(`A tap! ${N} sat.`, [personItem(who, 200, { pose: 'sit', scale: 1.1 }), { ...thing(n, 320, { scale: 0.7 }), y: 90 }], [n]);
    }
  }
  // Something on something: small animals or household items on fitting bases.
  for (const base of nouns.filter((n) => n.seat || n.ride)) {
    for (const top of nouns.filter((n) => canSitOn(n, base))) {
      const h = TOP[base.word] || 20;
      const s = base.ride ? 1.1 : 1.2;
      add(`A ${top.word} is on the ${base.word}.`, [thing(base, 200, { scale: s * scaleOf(base) }), { ...thing(top, 200, { scale: 0.75 * scaleOf(top) }), y: GROUND_Y - h * s * scaleOf(base) }], [top, base]);
    }
  }
  // Something in something: fitting objects in a bag or pail, bathable animals in the bath.
  for (const base of nouns.filter((n) => n.holds)) {
    const allowed = IN_CONTENTS[base.word];
    for (const top of nouns.filter((n) => allowed && allowed.has(n.word))) {
      const s = base.tub ? 1.05 : 1.3;
      const st = (base.tub ? 0.8 : 0.9) * scaleOf(top);
      const h = (HEIGHT[top.pic] || 80) * st;
      const rim = GROUND_Y - TOP[base.word] * s;
      // Half of it below the rim: a standing thing's feet, a floating thing's centre.
      const inside = { ...thing(top, 200, { scale: st }), y: top.floats ? rim - h * 0.15 : rim + h * 0.4 };
      add(`A ${top.word} is in the ${base.word}.`, [inside, thing(base, 200, { scale: s * scaleOf(base) })], [top, base]);
    }
  }
  return out;
}

// ---- the generator ---------------------------------------------------------
// Words of a sentence that use the focus graphemes, counted (a word with
// adjacent consonants counts when they are the focus).
function focusScore(text, code, focus, focusClusters) {
  let score = 0;
  for (const w of text.split(/\s+/)) {
    const r = checkWord(w.replace(/[^A-Za-z]/g, ''), code);
    if (!r.parts) continue;
    score += r.parts.filter((p) => focus.includes(soundOf(p))).length;
    if (focusClusters && hasCluster(r.parts)) score += 1;
  }
  return score;
}

function pick(list, rand, weight = () => 1) {
  const ws = list.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

const readable = (text, code) => checkText(text, code).length === 0;

// What a picture shows, ignoring where: two pages with the same key look the
// same to a child ("Pat has a cup." and "Pat gets a cup.").
const sceneKey = (scene) => scene.map((it) => [it.kind, it.pose || '', it.arms || ''].join(':')).join('|');

/**
 * Accept a drafted book only if it passes checkBook against the code and
 * every scene uses pictures the library has. Returns the book (with the
 * graphemes, tricky words and word list the check found) or null.
 */
export function acceptDraft(draft, code) {
  if (!draft || typeof draft.title !== 'string' || !Array.isArray(draft.pages) || !draft.pages.length) return null;
  const scenes = [draft.cover || [], ...draft.pages.map((p) => p.scene || [])];
  if (!scenes.every((s) => Array.isArray(s) && s.every((item) => isPictureKind(item?.kind)))) return null;
  const result = checkBook(draft, code);
  if (!result.ok) return null;
  return { ...draft, graphemes: result.graphemes, tricky: result.tricky, clusters: result.clusters, words: result.words };
}

/**
 * A new book for `code` ({ graphemes, tricky, clusters } as sequence.js
 * makeCode gives). `focus`: graphemes to favour; `focusClusters`: favour
 * adjacent consonants; `pages`: 6 or 10 story pages; `seed`: any integer;
 * `avoidNames`: first names the story must not use (the family's learners,
 * read on this computer only). Returns null when the code is too small to
 * write anything (no name or no sentence it can read).
 */
export function generateBook(code, { focus = [], focusClusters = false, pages = 6, seed = 1, avoidNames = [] } = {}) {
  const rand = rng(seed);
  const avoid = new Set([...avoidNames].map((n) => String(n).trim().split(/\s+/)[0].toLowerCase()).filter(Boolean));
  const names = NAMES.filter((n) => !avoid.has(n.name.toLowerCase()) && readable(n.name, code));
  if (!names.length) return null;
  const nouns = NOUNS.filter((n) => readable(n.word, code));
  const scores = new Map();
  const score = (text) => {
    if (!scores.has(text)) scores.set(text, focusScore(text, code, focus, focusClusters));
    return scores.get(text);
  };
  const who = pick(names, rand, (n) => 1 + 10 * score(n.name));
  const others = names.filter((n) => n !== who);
  const other = others.length ? pick(others, rand, (n) => 1 + 2 * score(n.name)) : null;
  const all = candidates(who, other, nouns).filter((c) => readable(c.text, code));
  for (const c of all) c.key = sceneKey(c.scene);
  if (!all.length) return null;
  // The main thing of the story: a noun the sentences can use, focus first.
  // A mat is too plain to carry a story; it stays a side thing.
  const usable = nouns.filter((n) => all.some((c) => c.about.includes(n)));
  const byNoun = new Map(usable.map((n) => [n, all.filter((c) => c.about.includes(n))]));
  const focusOf = (n) => byNoun.get(n).reduce((m, c) => m + score(c.text), 0) / Math.max(1, byNoun.get(n).length);
  const leads = usable.filter((n) => !n.minor);
  // A thing with too few sentences to fill half the book cannot carry it.
  const enough = leads.filter((n) => byNoun.get(n).length >= Math.ceil(pages / 2) + 2);
  const main = leads.length ? pick(enough.length ? enough : leads, rand, (n) => (1 + 6 * score(n.word) + 4 * focusOf(n)) ** 2) : usable.length ? pick(usable, rand) : null;
  // Two more things at most, so the story stays about a few things.
  const side = [];
  for (let i = 0; i < 2; i++) {
    const rest = usable.filter((n) => n !== main && !side.includes(n));
    if (rest.length) side.push(pick(rest, rand, (n) => 1 + 3 * score(n.word) + focusOf(n)));
  }
  const cast = new Set([main, ...side]);
  const inStory = all.filter((c) => c.about.every((n) => cast.has(n)));
  const weight = (c) => (1 + 4 * score(c.text)) * (main && c.about.includes(main) ? 3 : 1) * (c.about.length ? 1 : 0.6);

  // The limits that keep a story on its title and varied: a side thing on at
  // most a third of the pages, as many pages about no thing, the same picture
  // on at most two pages, and no sentence twice. Each limit is let go, last
  // first, only when a small code leaves nothing else to say.
  const third = Math.max(2, Math.ceil(pages / 3));
  const chosen = [];
  const pagesAbout = (n) => chosen.filter((c) => c.about.includes(n)).length;
  const sceneCount = (c) => chosen.filter((x) => x.key === c.key).length;
  const rules = [
    (c) => !chosen.some((x) => x.text === c.text),
    (c) => sceneCount(c) < 2,
    (c) => c.about.every((n) => n === main || pagesAbout(n) < third) && (c.about.length || chosen.filter((x) => !x.about.length).length < third),
  ];
  const choose = (list) => {
    for (let k = rules.length; k >= 0; k--) {
      const pool = list.filter((c) => rules.slice(0, k).every((rule) => rule(c)));
      if (pool.length) return pick(pool, rand, weight);
    }
    return null;
  };
  // Page 1 introduces the main thing when it can.
  const intro = all.filter((c) => main && c.about[0] === main && /^(\w+ has a|It is a) /.test(c.text));
  if (intro.length) chosen.push(pick(intro, rand, weight));
  // Half the pages, at least, are about the main thing: every other page
  // while it has fewer, as long as there is something new to say about it.
  const half = Math.ceil(pages / 2);
  const aboutMain = inStory.filter((c) => c.about.includes(main));
  while (chosen.length < pages) {
    const ok = (list) => list.filter((c) => rules.every((rule) => rule(c)));
    const owed = main && pagesAbout(main) < half && (chosen.length % 2 === 1 || pages - chosen.length <= half - pagesAbout(main));
    // Sentences about the story's things first, then any other.
    const list = owed && ok(aboutMain).length ? aboutMain : ok(inStory).length ? inStory : all;
    chosen.push(choose(list) || choose(all));
  }
  // A book about adjacent consonants has at least one such word.
  if (focusClusters && !chosen.some((c) => score(c.text) > 0)) {
    const cl = all.filter((c) => score(c.text) > 0 && !chosen.some((x) => x.text === c.text));
    if (cl.length) chosen[chosen.length - 1] = pick(cl, rand, weight);
  }

  // The title names the thing the pages are most about.
  const counts = new Map();
  for (const c of chosen) for (const n of c.about) counts.set(n, (counts.get(n) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (b[0] === main) - (a[0] === main))[0]?.[0] || main;
  const lead = top && (top.mass || top.one) ? null : top;
  const titles = [
    lead && `${who.name} and the ${lead.word}`,
    lead && `The ${lead.word}`,
    lead && `${who.name} has a ${lead.word}`,
    lead && `A ${lead.word}`,
    top && (top.mass || top.one) && `${who.name} and the ${top.word}`,
    top && (top.mass || top.one) && `The ${top.word}`,
    `${who.name}`,
  ].filter(Boolean).filter((t) => readable(t, code));
  const title = titles.length > 1 && rand() < 0.3 ? titles[1] : titles[0];
  const cover = top
    ? [personItem(who, 120), top.sky ? { ...thing(top, 290, { scale: 0.8 }), y: 90 } : thing(top, 285, { scale: top.ride ? 0.8 : 0.9 * scaleOf(top) })]
    : [personItem(who, 200, { arms: 'wave', scale: 1.1 })];
  const book = acceptDraft({
    id: `made-${seed}`,
    title,
    focus: [...focus],
    seed,
    cover,
    pages: chosen.map((c) => ({ text: c.text, scene: c.scene })),
  }, code);
  return book;
}
