import assert from 'node:assert/strict';
import { test } from 'node:test';

// What a tab does when it loses a save (e2e finding F17): it reloads once,
// names what it discarded, re-applies it on request, and never raises a
// conflict over what it writes on its own while rendering (daily offers).

// A tiny stand-in for the server's versioned document.
const server = { doc: { version: 1, students: [{ id: 's1', name: 'Rowan Sample' }] }, puts: [], failNextPut: false };
const reply = (status, body, version) => ({
  ok: status < 300, status,
  headers: new Headers(version ? { ETag: `"v${version}"` } : {}),
  json: async () => body,
});
globalThis.fetch = async (path, options = {}) => {
  if (path === '/api/health') return reply(200, { aiConfigured: false, stateVersion: server.doc.version });
  if (path === '/api/state' && options.method === 'PUT') {
    if (server.failNextPut) { server.failNextPut = false; return reply(500, { error: 'down' }); }
    const sent = Number(/"v(\d+)"/.exec(options.headers['If-Match'])[1]);
    server.puts.push(sent);
    if (sent !== server.doc.version) return reply(412, server.doc);
    server.doc = { ...JSON.parse(options.body), version: sent + 1 };
    return reply(204, null, server.doc.version);
  }
  if (path === '/api/state') return reply(200, server.doc);
  return reply(200, {});
};
// Another tab saving: the server document moves on without us.
const otherTabSaves = (patch) => { server.doc = { ...server.doc, ...patch(server.doc), version: server.doc.version + 1, writeId: 'w_other' }; };

const store = await import('../src/js/store.js');
const events = [];
store.onSaveStatus((e) => events.push(e));
await store.loadAll();

test('diffDocuments lists status changes, added records and bookkeeping', () => {
  const base = { progress: { s1: { a: { status: 'learning' } } }, records: { s1: [{ id: 'r1' }] }, dismissedAlerts: {}, graphView: 'atlas' };
  const local = {
    progress: { s1: { a: { status: 'mastered' }, b: { status: 'learning' } } },
    records: { s1: [{ id: 'r2', type: 'note', title: 'Counted grapes' }, { id: 'r1' }] },
    dismissedAlerts: { 'backup:stale': 1 },
    graphView: 'list',
  };
  const kinds = store.diffDocuments(base, local).map((c) => c.kind).sort();
  // A dismissal and the map view are the parent's changes, but not re-appliable.
  assert.deepEqual(kinds, ['other', 'other', 'record', 'status', 'status']);
  assert.equal(store.diffDocuments(base, base).length, 0);
});

test('describeDiscarded names statuses and records, never bookkeeping', () => {
  const changes = [
    { kind: 'status', topicId: 't1', entry: { status: 'practicing' } },
    { kind: 'status', topicId: 't2', entry: { status: 'none' } },
    { kind: 'record', record: { type: 'note', title: 'Counted grapes' } },
    { kind: 'record', record: { type: 'observation' } },
  ];
  const names = { t1: 'One-to-one counting', t2: 'How Many in Total?' };
  assert.equal(store.describeDiscarded(changes.slice(0, 3), (id) => names[id]),
    'One-to-one counting marked practicing, How Many in Total? marked not started, the note “Counted grapes”');
  // Past three items the rest are counted, so a big placement stays one line.
  assert.equal(store.describeDiscarded(changes, (id) => names[id]),
    'One-to-one counting marked practicing, How Many in Total? marked not started, the note “Counted grapes” and 1 more');
  const many = Array.from({ length: 120 }, (_, i) => ({ kind: 'status', topicId: `t${i}`, entry: { status: 'mastered' } }));
  assert.equal(store.describeDiscarded(many), 't0 marked mastered, t1 marked mastered, t2 marked mastered and 117 more');
  assert.equal(store.describeDiscarded([{ kind: 'offers' }, { kind: 'activity' }]), '');
  assert.equal(store.canReapply(changes), true);
  assert.equal(store.canReapply([...changes, { kind: 'other', key: 'plan' }]), false);
});

test('empty containers created on read are not changes', () => {
  const base = { recall: {}, records: {}, progress: { s1: { a: { status: 'learning' } } } };
  const local = { recall: { s1: {} }, records: { s1: [] }, progress: { s1: { a: { status: 'learning' } } } };
  assert.deepEqual(store.diffDocuments(base, local), []);
});

test('a new day holding only offers is bookkeeping; a pick is not', () => {
  const base = { daily: { s1: { '2026-10-01': { offers: { literacy: ['x'] }, picks: {} } } } };
  const offers = { daily: { s1: { '2026-10-07': { offers: { literacy: ['a', 'b'] }, picks: {} } } } };
  assert.deepEqual(store.diffDocuments(base, offers).map((c) => c.kind), ['offers']);
  // The payload keeps the day as written, empty picks included.
  assert.deepEqual(store.diffDocuments(base, offers)[0].entry, { offers: { literacy: ['a', 'b'] }, picks: {} });
  assert.equal(store.describeDiscarded(store.diffDocuments(base, offers)), '');
  const picked = { daily: { s1: { '2026-10-07': { offers: { literacy: ['a', 'b'] }, picks: { literacy: 'a' } } } } };
  assert.deepEqual(store.diffDocuments(base, picked).map((c) => c.kind), ['other']);
});

test('reading XP and badges writes nothing', () => {
  const before = JSON.stringify(store.get().game);
  store.gameState('s-reader'); store.earnedBadges('s-reader'); store.hasBadge('s-reader', 'first');
  assert.equal(JSON.stringify(store.get().game), before);
});

test('the document fields come from one list, schemaVersion included', () => {
  assert.ok(store.DOCUMENT_KEYS.includes('schemaVersion'));
  for (const key of ['students', 'progress', 'recall', 'daily', 'notifications', 'dismissedAlerts', 'settings', 'graphView']) {
    assert.ok(store.DOCUMENT_KEYS.includes(key), key);
  }
  assert.ok(!store.DOCUMENT_KEYS.includes('curriculumSnapshot'), 'HAR-27 removed the snapshot');
});

test('a losing status change is named once and Try again re-applies it', async () => {
  otherTabSaves((doc) => ({ progress: { s1: { a: { status: 'learning', updatedAt: 1 } } }, activity: { s1: { '2026-10-07': true } }, notifications: doc.notifications }));
  events.length = 0;
  store.setStatus('s1', 'b', 'practicing');
  await store.flushSaves();
  const conflicts = events.filter((e) => e.type === 'conflict');
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].discarded.map((c) => [c.kind, c.topicId, c.entry.status]), [['status', 'b', 'practicing']]);
  assert.equal(store.statusOf('s1', 'b'), 'none', 'the fresh copy is shown');
  assert.equal(store.statusOf('s1', 'a'), 'learning');

  conflicts[0].retry();
  await store.flushSaves();
  assert.equal(server.doc.progress.s1.b.status, 'practicing');
  assert.equal(server.doc.progress.s1.a.status, 'learning', 'the other tab\'s change is kept');
  assert.equal(events.filter((e) => e.type === 'conflict').length, 1);
});

test('a container read before a losing change does not cost the retry', async () => {
  store.recallDueCount('s1'); // creates recall.s1 = {} on read, as the dashboard does
  otherTabSaves((doc) => ({ progress: { ...doc.progress, s1: { ...doc.progress.s1, c: { status: 'learning', updatedAt: 2 } } } }));
  events.length = 0;
  store.setStatus('s1', 'd', 'learning');
  await store.flushSaves();
  const [conflict] = events.filter((e) => e.type === 'conflict');
  assert.ok(conflict.retry, 'Try again is offered');
  assert.deepEqual(conflict.discarded.map((c) => c.kind), ['status']);
  conflict.retry();
  await store.flushSaves();
  assert.equal(server.doc.progress.s1.d.status, 'learning');
});

test('offers written while rendering never raise a conflict', async () => {
  otherTabSaves((doc) => ({ daily: { s1: { '2026-10-07': { offers: { literacy: ['other'] }, picks: {} } } }, progress: doc.progress }));
  events.length = 0;
  store.saveDailyOffers('s1', '2026-10-07', { literacy: ['mine'] });
  store.saveDailyOffers('s1', '2026-10-08', { literacy: ['next'] });
  await store.flushSaves();
  assert.deepEqual(events.filter((e) => e.type === 'conflict'), []);
  // The sibling's offers for the day stay; a day the fresh copy lacks is put back.
  assert.deepEqual(store.dailyFor('s1', '2026-10-07').offers.literacy, ['other']);
  await store.flushSaves();
  assert.deepEqual(server.doc.daily.s1['2026-10-08'], { offers: { literacy: ['next'] }, picks: {} });
  // The day re-applied from the losing tab can still be picked.
  store.pickDaily('s1', '2026-10-08', 'literacy', 'next');
  await store.flushSaves();
  assert.equal(server.doc.daily.s1['2026-10-08'].picks.literacy, 'next');
});

test('a change for a learner removed elsewhere gets no Try again', async () => {
  const sid = store.addStudent('Lark Sample', 2019);
  await store.flushSaves();
  otherTabSaves((doc) => ({ students: doc.students.filter((s) => s.id !== sid) }));
  events.length = 0;
  store.setStatus(sid, 'e', 'learning');
  await store.flushSaves();
  const [conflict] = events.filter((e) => e.type === 'conflict');
  assert.equal(conflict.retry, null);
  assert.equal(store.describeDiscarded(conflict.discarded), 'e marked learning');
});

test('Try again re-applies changes for present learners only', async () => {
  const gone = store.addStudent('Fern Sample', 2019);
  await store.flushSaves();
  otherTabSaves((doc) => ({ students: doc.students.filter((s) => s.id !== gone) }));
  events.length = 0;
  store.setStatus(gone, 'f', 'learning');
  store.setStatus('s1', 'g', 'practicing');
  await store.flushSaves();
  const [conflict] = events.filter((e) => e.type === 'conflict');
  assert.ok(conflict.retry, 'the present learner\'s change can be re-applied');
  conflict.retry();
  await store.flushSaves();
  assert.equal(server.doc.progress.s1.g.status, 'practicing');
  assert.equal(server.doc.progress[gone]?.f, undefined, 'nothing is written for the removed learner');
  assert.ok(!server.doc.students.some((s) => s.id === gone));
});

test('a reload that migrates a plain PIN syncs the migrated copy, so a later loss still offers Try again', async () => {
  // Another device (an older tab) saves a plain PIN; this tab reloads it and
  // hashes it, and the migration's own save fails, so the tab stays on the
  // migrated copy without having saved it.
  otherTabSaves((doc) => ({ settings: { ...doc.settings, parentPin: '2468' } }));
  server.failNextPut = true;
  events.length = 0;
  await store.handlePageVisible();
  // Wait for the migration's save to fail; flushing again would save it.
  while (!events.some((e) => e.type === 'failed')) await new Promise((r) => setTimeout(r, 1));
  assert.equal(store.get().settings.parentPin, undefined, 'the PIN is hashed on reload');
  // The other device saves again, and this tab's next change loses.
  otherTabSaves((doc) => ({ progress: { ...doc.progress, s1: { ...doc.progress.s1, n: { status: 'learning', updatedAt: 3 } } } }));
  events.length = 0;
  store.setStatus('s1', 'm', 'practicing');
  await store.flushSaves();
  const [conflict] = events.filter((e) => e.type === 'conflict');
  // The hashed PIN is not a lost change: it was applied before the copy was synced.
  assert.deepEqual(conflict.discarded.map((c) => c.kind), ['status']);
  assert.ok(conflict.retry, 'Try again is offered');
  assert.doesNotMatch(store.describeDiscarded(conflict.discarded), /other changes/);
  await store.flushSaves();
});

test('pickDaily works on a day stored without picks', () => {
  store.get().daily.s1 = { ...store.get().daily.s1, '2026-10-10': { offers: { literacy: ['x'] } } };
  store.pickDaily('s1', '2026-10-10', 'literacy', 'x');
  assert.equal(store.dailyFor('s1', '2026-10-10').picks.literacy, 'x');
});

test('an offers day put back after a conflict always has picks', async () => {
  // A day without picks (an older document) is offers-only bookkeeping; put
  // back on the fresh copy, it gains an empty picks object.
  store.get().daily.s1['2026-10-11'] = { offers: { literacy: ['y'] } };
  otherTabSaves(() => ({ graphView: 'atlas' }));
  store.setGraphView(store.graphView() === 'list' ? 'atlas' : 'list');
  await store.flushSaves();
  await store.flushSaves();
  assert.deepEqual(server.doc.daily.s1['2026-10-11'], { offers: { literacy: ['y'] }, picks: {} });
});

test('a change that cannot simply be re-applied gets no Try again', async () => {
  otherTabSaves(() => ({ graphView: 'atlas' }));
  events.length = 0;
  store.setGraphView('list');
  await store.flushSaves();
  const [conflict] = events.filter((e) => e.type === 'conflict');
  assert.equal(conflict.retry, null);
  assert.equal(store.describeDiscarded(conflict.discarded), 'other changes');
});

test('a migration the reload makes is never listed as a lost change, then or later', async () => {
  // An older tab saved a schema-1 document with a plain PIN while this tab
  // had a change pending: only that change is named.
  otherTabSaves(() => ({ schemaVersion: 1, settings: { parentPin: '2468' } }));
  events.length = 0;
  store.setStatus('s1', 'e', 'learning');
  await store.flushSaves();
  const [first] = events.filter((e) => e.type === 'conflict');
  assert.deepEqual(first.discarded.map((c) => [c.kind, c.topicId]), [['status', 'e']]);
  await store.flushSaves();
  assert.equal(server.doc.schemaVersion, 3, 'the reload saved the migrated document');
  assert.ok(server.doc.settings.parentPinHash && !('parentPin' in server.doc.settings));

  // The migrated document is the synced copy: the next conflict names only
  // the parent's change, not the PIN or the schema.
  otherTabSaves(() => ({ graphView: store.graphView() }));
  events.length = 0;
  store.setStatus('s1', 'f', 'learning');
  await store.flushSaves();
  const [second] = events.filter((e) => e.type === 'conflict');
  assert.deepEqual(second.discarded.map((c) => [c.kind, c.topicId]), [['status', 'f']]);
});

test('describeDiscarded names common mutations instead of falling back to "other changes" (HAR-42)', () => {
  const base = {
    students: [{ id: 's1', name: 'Rowan Sample' }],
    progress: { s1: { t1: { status: 'learning' } } },
    records: { s1: [{ id: 'r1', type: 'observation', title: 'Counted spoons' }, { id: 'r2', type: 'note', title: 'Old note' }] },
    daily: { s1: { '2026-10-07': { offers: { literacy: ['a', 'b'] }, picks: {} } } },
    plan: { s1: { moves: {}, done: {}, extras: {} } },
    settings: { calendar: { homeDays: [1, 2, 3, 4, 5], breaks: [] } },
  };
  const cases = [
    ['daily pick', { ...base, daily: { s1: { '2026-10-07': { offers: { literacy: ['a', 'b'] }, picks: { literacy: 'a' } } } } }, /today’s picks/],
    ['plan moves', { ...base, plan: { s1: { moves: { t1: '2026-10-08' }, done: {}, extras: {} } } }, /moved calendar topics/],
    ['plan done', { ...base, plan: { s1: { moves: {}, done: { '2026-10-07': 123 }, extras: {} } } }, /completed calendar days/],
    ['plan extras', { ...base, plan: { s1: { moves: {}, done: {}, extras: { '2026-10-07': [{ id: 'x1' }] } } } }, /extra calendar items/],
    ['plan pace', { ...base, plan: { s1: { moves: {}, done: {}, extras: {}, pace: 'mixed' } } }, /catch-up pace/],
    ['interests', { ...base, interests: { s1: { chips: ['Space'], text: '' } } }, /learner interests/],
    ['reading', { ...base, reading: { s1: { graphemes: ['s', 'a'] } } }, /reading sounds and books/],
    ['tests', { ...base, tests: { s1: [{ id: 't_1', pct: 100 }] } }, /test results/],
    ['challenges', { ...base, challenges: { s1: [{ id: 'c_1', correct: 8 }] } }, /challenge quiz results/],
    ['recall', { ...base, recall: { s1: { 't1::0': { box: 1 } } } }, /recall reviews/],
    ['practice', { ...base, practice: { s1: { p1: { box: 1 } } } }, /spaced practice/],
    ['levelset', { ...base, levelset: { s1: { lane: 'numeracy' } } }, /level-set workbook/],
    ['requests', { ...base, requests: { s1: [{ id: 'rq1', text: 'fractions' }] } }, /topic finder requests/],
    ['adaptations', { ...base, adaptations: { s1: { 'Math|Number': { level: 'advanced' } } } }, /difficulty settings/],
    ['suggestions', { ...base, suggestions: { s1: [{ id: 'g1', status: 'pending' }] } }, /adaptive suggestions/],
    ['students', { ...base, students: [{ id: 's1', name: 'Wren Sample' }] }, /learner details/],
    ['calendar settings', { ...base, settings: { calendar: { homeDays: [1, 2, 3, 4], breaks: [] } } }, /calendar settings/],
    ['record edited', { ...base, records: { s1: [{ id: 'r1', type: 'observation', title: 'Counted spoons', note: 'Updated' }, base.records.s1[1]] } }, /edits to the record “Counted spoons”/],
    ['record deleted', { ...base, records: { s1: [base.records.s1[0]] } }, /removing the note “Old note”/],
    ['progress removed', { ...base, progress: { s1: {} } }, /One-to-one counting progress removed/],
  ];
  for (const [label, local, expected] of cases) {
    const desc = store.describeDiscarded(store.diffDocuments(base, local), (id) => (id === 't1' ? 'One-to-one counting' : id));
    assert.match(desc, expected, `${label}: got "${desc}"`);
    assert.doesNotMatch(desc, /other changes/, `${label}: fell back to "other changes"`);
  }
});
