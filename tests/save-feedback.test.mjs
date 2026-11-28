// What the page says when a change is not saved, driven through the shared
// fake DOM: the read-only guards (the shell's automatic flag, the recorder's
// upload guard, pickImportFile's refusal) and a save the document rules
// refuse (HAR-39), whose action must not confirm it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installFakeDom } from './support/fake-dom.mjs';

const { document, flushFrame, pendingFrames } = installFakeDom();
for (const id of ['app', 'modal-root', 'toast-root']) {
  const root = document.createElement('div');
  root.id = id;
  document.body.appendChild(root);
}

const NOW = Date.parse('2026-10-07T10:30:00Z');
const STUDENT = { id: 's_feedback', name: 'Rowan Example', birthYear: 2020, color: '#a4473a', startDate: '2026-09-07' };
const TOPICS = [{ id: 't_count', name: 'One-to-one counting', subject: 'Mathematics', domain: 'Counting & Cardinality', ageRangeStart: 5, ageRangeEnd: 6, description: 'Counting.', centrality: 1 }];
const familyDoc = (schemaVersion) => ({
  version: 1,
  schemaVersion,
  students: [STUDENT],
  activeStudentId: STUDENT.id,
  plan: { [STUDENT.id]: { moves: {}, done: {}, extras: { '2026-10-07': [{ id: 'x_gone', kind: 'lesson', topicId: 't_gone', title: 'Gone' }] } } },
});
let served = null;
const writes = [];
const json = (status, body, headers = {}) => ({ ok: status < 400, status, headers: new Headers(headers), json: async () => body, blob: async () => new Blob([]) });
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  const method = options.method || 'GET';
  if (path === '/api/health') return json(200, { ok: true, aiConfigured: false });
  if (path === '/api/state' && method === 'GET') return json(200, structuredClone(served), { ETag: '"v1"' });
  if (method !== 'GET') { writes.push(`${method} ${path}`); return json(204, null, { ETag: '"v2"' }); }
  if (path.startsWith('/api/taxonomy/')) {
    const file = path.slice('/api/taxonomy/'.length);
    if (file === 'topics.json') return json(200, { topics: TOPICS });
    if (file === 'dependencies.json') return json(200, { dependencies: [] });
    if (file === 'clusters.json') return json(200, { clusters: [] });
    return json(200, { taxonomyVersion: 'v1-test', generatedAt: '2026-09-01' });
  }
  return json(404, { error: 'Not found' });
};
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => { const timer = realSetTimeout(...args); timer.unref?.(); return timer; };
globalThis.confirm = () => true;

// The recorder's browser APIs: a microphone, a recorder that stops at once,
// object URLs and a FormData that reads nothing (the fake DOM has no forms).
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } });
class FakeRecorder {
  constructor() { this.state = 'inactive'; }
  static isTypeSupported() { return false; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
}
globalThis.MediaRecorder = FakeRecorder;
window.MediaRecorder = FakeRecorder;
globalThis.FormData = class { get() { return null; } };

const store = await import('../src/js/store.js');
const { SCHEMA_VERSION } = await import('../src/js/schema.js');
const { loadTaxonomy } = await import('../src/js/data.js');
const { renderShell } = await import('../src/js/views/shell.js');
const { openRecorder } = await import('../src/js/recorder.js');
const { el, toast } = await import('../src/js/ui.js');

const settle = async () => {
  for (let i = 0; i < 6; i += 1) {
    for (let frames = 0; pendingFrames() && frames < 10; frames += 1) flushFrame();
    await new Promise((resolve) => setImmediate(resolve));
  }
};
const toasts = () => document.getElementById('toast-root').children.map((t) => t.textContent.trim());
const reset = () => {
  document.getElementById('toast-root').replaceChildren();
  document.getElementById('modal-root').replaceChildren();
  writes.length = 0;
};

served = familyDoc(SCHEMA_VERSION + 1);
await store.connect();
await store.loadAll();
await loadTaxonomy();
const shell = renderShell({ route: { name: 'dashboard', params: {} }, navigate: () => {}, content: el('<div></div>') });
document.getElementById('app').appendChild(shell);

test('read-only: a write the app makes while rendering raises no "Not saved" toast; the parent\'s does', async () => {
  reset();
  store.saveDailyOffers(STUDENT.id, '2026-10-07', { literacy: [], numeracy: [] });
  await settle();
  assert.deepEqual(toasts().filter((t) => t.startsWith('Not saved')), [], 'remembering the day\'s offers is automatic');
  assert.ok(document.querySelector('.read-only-banner'), 'the banner still says why');
  store.setStatus(STUDENT.id, 't_count', 'learning');
  await settle();
  assert.equal(toasts().filter((t) => t.startsWith('Not saved')).length, 1);
  assert.deepEqual(writes, []);
});

test('read-only: Import refuses before opening a file picker, even if its handler is reached', async () => {
  reset();
  const button = shell.querySelector('#import');
  assert.equal(button.disabled, true);
  const created = [];
  const createElement = document.createElement.bind(document);
  document.createElement = (tag) => { created.push(tag); return createElement(tag); };
  try { button.onclick(); } finally { document.createElement = createElement; }
  await settle();
  assert.ok(!created.includes('input'), 'no file input was made');
  assert.equal(toasts().length, 1);
  assert.match(toasts()[0], /saved by a newer version of Harrington/);
});

test('read-only: the recorder does not upload a recording it could not keep', async () => {
  reset();
  openRecorder(STUDENT.id, TOPICS[0]);
  const modal = document.getElementById('modal-root');
  modal.querySelector('#start').click();
  await settle();
  modal.querySelector('#stop').click();
  await settle();
  const form = modal.querySelector('#f');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.deepEqual(writes, [], 'no audio upload and no save');
  assert.match(toasts().join('\n'), /^Not saved\. This family data was saved by a newer version/m);
  assert.equal(store.recordsFor(STUDENT.id).length, 0);
});

test('a change the document rules refuse says so, and its action does not confirm it (HAR-39)', async () => {
  served = familyDoc(SCHEMA_VERSION);
  await store.loadAll();
  reset();
  assert.equal(store.isReadOnly(), false);
  // A state the server would refuse (as if an older bug had written it).
  store.get().students[0].birthYear = 1800;
  store.addRecord(STUDENT.id, { type: 'observation', title: 'Counted the stairs', note: '' });
  toast('Record saved', 'success');
  await settle();
  assert.ok(!toasts().includes('Record saved'), 'the confirmation is held back');
  assert.match(toasts().join('\n'), /Harrington refused these changes: The learner “Rowan Example” in the file has a birth year outside 1990/);
  await new Promise((resolve) => realSetTimeout(resolve, 450));
  assert.deepEqual(writes, [], 'nothing was sent');
  // Once the document is valid again, the pending change saves.
  store.get().students[0].birthYear = 2020;
  store.setStatus(STUDENT.id, 't_count', 'learning');
  await store.flushSaves();
  assert.deepEqual(writes, ['PUT /api/state']);
});

test('the refusal toast names the current problem once the parent fixes the first', async () => {
  reset();
  store.get().students[0].birthYear = 1800;
  store.setStatus(STUDENT.id, 't_count', 'practicing');
  await settle();
  const refusals = () => toasts().filter((t) => t.startsWith('Harrington refused'));
  assert.equal(refusals().length, 1);
  assert.match(refusals()[0], /birth year/);
  // The birth year is fixed, but the name is now too long.
  store.get().students[0].birthYear = 2020;
  store.get().students[0].name = 'x'.repeat(61);
  store.setStatus(STUDENT.id, 't_count', 'mastered');
  await settle();
  assert.equal(refusals().length, 1, 'one toast, not two');
  assert.match(refusals()[0], /name longer than 60 characters/);
  assert.doesNotMatch(refusals()[0], /birth year/);
  // Fixed too: the next change saves and the toast goes.
  store.get().students[0].name = STUDENT.name;
  store.setStatus(STUDENT.id, 't_count', 'learning');
  await store.flushSaves();
  await settle();
  assert.equal(refusals().length, 0);
});

test('an async server refusal clears a visible confirmation toast so it never sits beside the refusal (HAR-42)', async () => {
  served = familyDoc(SCHEMA_VERSION);
  await store.loadAll();
  reset();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === '/api/state' && options.method === 'PUT') {
      return json(422, { error: 'Server refused this test change.' });
    }
    return realFetch(url, options);
  };
  try {
    store.addRecord(STUDENT.id, { type: 'observation', title: 'Counted acorns', note: '' });
    toast('Record saved', 'success');
    await settle();
    assert.ok(toasts().includes('Record saved'), 'confirmation shows before the debounced save fails');
    await store.flushSaves();
    await settle();
    assert.ok(!toasts().includes('Record saved'), 'confirmation toast is removed when refusal toast appears');
    assert.match(toasts().join('\n'), /Harrington refused these changes: Server refused this test change\./);
  } finally {
    globalThis.fetch = realFetch;
    // Reset cleanly back to saved state for any subsequent assertions.
    served = familyDoc(SCHEMA_VERSION);
    await store.loadAll();
  }
});
