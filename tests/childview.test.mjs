import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

// store.persist() saves through fetch after a debounce; keep it off the network.
const saved = [];
globalThis.fetch = async (path, options = {}) => {
  if (options.body) saved.push(JSON.parse(options.body));
  return { ok: true, status: 200, headers: new Headers({ ETag: `"v${saved.length}"` }), json: async () => ({}) };
};

const store = await import('../src/js/store.js');
const game = await import('../src/js/game.js');
const { canYouPrompt } = await import('../src/js/phrasing.js');

test('the child view never launches a mastery test', async () => {
  const kidmode = await source('src/js/views/kidmode.js');
  assert.doesNotMatch(kidmode, /openMasteryTest/);
  assert.doesNotMatch(kidmode, /masterytest\.js/);
  assert.match(kidmode, /import \{ openChildTopic \} from '\.\/childtopic\.js'/);
  assert.match(kidmode, /store\.setChildViewOpen\(true\)/);
  assert.match(kidmode, /store\.setChildViewOpen\(false\)/);
  // No celebrations in the child view, including the badge collection.
  assert.doesNotMatch(kidmode, /confetti/);
  // The parent shell (sidebar, export/import) is inert behind the overlay.
  assert.match(kidmode, /setShellInert\(true\)/);
  assert.match(kidmode, /setShellInert\(false\)/);
  assert.match(kidmode, /app\.inert = on/);
  assert.match(kidmode, /overlay\.focus\(\)/);
  assert.match(kidmode, /target\.focus\(\)/);
  // Modals and toasts mount outside #app, so they stay usable while it is inert.
  const html = await source('src/index.html');
  assert.match(html, /<div id="app"[^>]*><\/div>\s*<div id="modal-root"><\/div>/);
});

test('tests, challenges and recall have a score-free child result', async () => {
  for (const path of ['src/js/views/masterytest.js', 'src/js/views/challenge.js', 'src/js/views/recall.js']) {
    const code = await source(path);
    assert.match(code, /store\.isChildViewOpen\(\)/, `${path} has no child-safe branch`);
    assert.match(code, /All done, well tried!/, `${path} has no child-safe result`);
  }
});

test('celebrations are silent while the child view is open', () => {
  assert.equal(store.isChildViewOpen(), false);
  assert.equal(game.celebrationsAllowed(), true);

  store.setChildViewOpen(true);
  try {
    assert.equal(game.celebrationsAllowed(), false);
    // There is no DOM here, so any popup, chip or confetti would throw.
    assert.doesNotThrow(() => game.celebrate({ xp: 25, leveledUp: true, level: 2, badges: [game.BADGES[0]] }));
  } finally {
    store.setChildViewOpen(false);
  }
  assert.equal(game.celebrationsAllowed(), true);
  // Outside the child view celebrate() reaches for the DOM.
  assert.throws(() => game.celebrate({ xp: 25 }), ReferenceError);
});

test('award() still records XP in the child view', () => {
  const id = 's_child_test';
  const before = store.gameState(id).xp;
  store.setChildViewOpen(true);
  try {
    const res = game.award(id, null, 40);
    assert.equal(res.xp, 40);
  } finally {
    store.setChildViewOpen(false);
  }
  assert.equal(store.gameState(id).xp, before + 40);
});

test('the parent PIN is four digits and only its salted hash is persisted', async () => {
  assert.equal(store.hasParentPin(), false);
  assert.equal(store.setParentPin('12a4'), false);
  assert.equal(store.setParentPin('123'), false);
  assert.equal(store.hasParentPin(), false);
  assert.equal(store.setParentPin('0420'), true);
  assert.equal(store.hasParentPin(), true);
  assert.equal(store.checkParentPin('0420'), true);
  assert.equal(store.checkParentPin('0421'), false);
  assert.equal(store.clearParentPin(), true);
  assert.equal(store.hasParentPin(), false);
  assert.equal(store.clearParentPin(), false);
  assert.equal(store.setParentPin('0420'), true);
  await store.flushSaves();
  const settings = saved.at(-1)?.settings;
  assert.match(settings?.parentPinHash, /^[0-9a-f]{64}$/);
  assert.match(settings?.parentPinSalt, /^[0-9a-f]{32}$/);
  assert.equal('parentPin' in settings, false);
  assert.doesNotMatch(JSON.stringify(saved.at(-1)), /"0420"/);
  // A hand-edited plain PIN in the data file still works until it migrates.
  store.get().settings = { parentPin: 1234 };
  assert.equal(store.checkParentPin('1234'), true);
});

test('taxonomy evidence reads as "Can you…?" prompts', () => {
  assert.equal(canYouPrompt('Explain how plants grow.'), 'Can you explain how plants grow?');
  assert.equal(canYouPrompt('Identifies 270° as three right angles'), 'Can you identify 270° as three right angles?');
  assert.equal(canYouPrompt('Describes the water cycle'), 'Can you describe the water cycle?');
  assert.equal(canYouPrompt('Uses a ruler to measure'), 'Can you use a ruler to measure?');
  assert.equal(canYouPrompt('Distinguishes living and non-living things'), 'Can you distinguish living and non-living things?');
  assert.equal(canYouPrompt('Organizes data in a table'), 'Can you organize data in a table?');
  assert.equal(canYouPrompt('Given a shape, name it'), 'Given a shape, can you name it?');
  assert.equal(canYouPrompt('After counting a set, answer how many'), 'After counting a set, can you answer how many?');
  assert.equal(canYouPrompt('A rope is 2.5 m long; how much is left after cutting 0.75 m?'), 'A rope is 2.5 m long; how much is left after cutting 0.75 m?');
  assert.equal(canYouPrompt('Heft two objects and say which is heavier'), 'Can you show: Heft two objects and say which is heavier?');
  assert.equal(canYouPrompt('Correctly adds two-digit numbers'), 'Can you correctly add two-digit numbers?');
  assert.equal(canYouPrompt('Solve: 3 + 4'), 'Can you solve: 3 + 4?');
  // Citations in the taxonomy are not prompts for a child.
  assert.equal(canYouPrompt('comprehension monitoring research'), '');
  assert.equal(canYouPrompt('Metacognitive Monitoring in Reading Comprehension (MDPI 2024)'), '');
  assert.equal(canYouPrompt('Wineburg sourcing heuristic'), '');
  assert.equal(canYouPrompt('Historical Thinking in the Elementary Years (ERIC)'), '');
  assert.equal(canYouPrompt('  '), '');
});
