// inspectImport() refuses a family file whose learners or per-learner maps
// are not in the shape the app reads, with a reason the parent can act on.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The store saves through fetch; these tests never save.
globalThis.fetch = async () => { throw new Error('no network in this test'); };
const store = await import('../src/js/store.js');
const { SCHEMA_VERSION } = await import('../src/js/schema.js');
const { validateDocument } = await import('../src/js/document.js');

// An export from before birth months, interests, settings and versioning:
// the first palette's color, progress and records only.
const olderExport = () => ({
  students: [
    { id: 's_older1', name: 'Sample Twelve', birthYear: 2016, color: '#3f7d5e', createdAt: 1_700_000_000_000, startDate: '2023-11-14' },
    { id: 's_older2', name: 'Sample Thirteen', birthYear: 2019, color: '#b0603a', createdAt: 1_700_000_100_000, startDate: '2023-11-14' },
  ],
  activeStudentId: 's_older1',
  progress: { s_older1: { 'count-to-5': { status: 'mastered', updatedAt: 1_700_000_200_000 } }, s_older2: {} },
  records: { s_older1: [{ id: 'r1', type: 'observation', title: 'Counted', note: '', createdAt: 1_700_000_300_000 }], s_older2: [] },
  tests: {},
  notifications: [],
});

const current = () => ({
  ...olderExport(),
  // At the current format, so each case meets the rules as they are: an older
  // file is migrated (and repaired) first, which its own tests below cover.
  schemaVersion: SCHEMA_VERSION,
  students: [{ id: 's_new', name: 'Sample Fourteen', birthYear: 2018, birthMonth: 4, color: store.PALETTE[2], startDate: '2026-09-01' }],
  activeStudentId: 's_new',
  progress: { s_new: { 'count-to-5': { status: 'learning', updatedAt: 1_700_000_200_000 } } },
  records: { s_new: [
    { id: 'r1', type: 'discussion', title: 'Talked', note: 'n', rating: 4, transcript: 't', analysis: '<p>a</p>', createdAt: 1_700_000_300_000, duration: 61.5 },
    { id: 'r2', type: 'assessment', title: 'Placement', placement: { subject: 'Mathematics', topicIds: ['count-to-5'], previous: {}, at: 1, undoneAt: null } },
  ] },
  tests: { s_new: [{ id: 't1', scope: 'topic', subject: 'Mathematics', score: 9, total: 10, pct: 90, passed: true, createdAt: 1_700_000_400_000 }] },
  challenges: { s_new: [{ id: 'c1', topicId: 'count-to-5', correct: 5, total: 6, answered: 6, seconds: 88, createdAt: 1_700_000_500_000 }] },
  game: { s_new: { xp: 120, badges: { first: 1_700_000_600_000 } } },
  notifications: [
    { id: 'n1', type: 'welcome', title: 'Welcome', body: 'Hi', read: false, createdAt: 1_700_000_000_000 },
    { id: 'n2', type: 'curriculum', title: 'New topics', meta: { sampleNames: ['Rhymes'], addedBySubject: { English: ['rhymes'] } } },
  ],
  suggestions: { s_new: [{ id: 'g1', kind: 'advance', subject: 'Mathematics', domain: 'Counting', status: 'pending' }] },
  plan: { s_new: { moves: { 'count-to-5': '2026-09-02' }, done: { '2026-09-01': true }, extras: { '2026-09-03': [{ id: 'x1', title: 'Extra' }] }, pace: 'mixed' } },
  daily: { s_new: { '2026-09-01': { offers: { literacy: ['rhymes'], numeracy: ['count-to-5'] }, picks: { literacy: 'rhymes' } } } },
  adaptations: { s_new: { 'Mathematics|Counting': { level: 'advanced', since: 1 } } },
  recall: { s_new: { c1: { topicId: 'count-to-5', box: 1, due: 1, reps: 0, lapses: 0 } } },
  practice: { s_new: { p1: { topicId: 'count-to-5', q: 'q', box: 1, due: 1 } } },
  activity: { s_new: { '2026-09-01': true } },
  dismissedAlerts: { welcome: 1_700_000_000_000 },
  interests: { s_new: { chips: ['Bridges', 'Frogs'], text: 'Asks how things work' } },
  requests: { s_new: [
    { id: 'rq1', text: 'how to tell the time', createdAt: 1_700_000_700_000, topicId: 'count-to-5' },
    { id: 'rq2', text: 'volcanoes', createdAt: 1_700_000_600_000, topicId: null },
  ] },
  levelset: { s_new: {
    lane: 'numeracy', observe: ['count-to-5'],
    lanes: { numeracy: { version: 2, lane: 'numeracy', age: 6, sheets: [{ kind: 'section', domain: 'Counting', level: 5, dir: 'up', part: 1, seq: 1, ids: ['count-to-5'], savedAt: 1 }], answers: { 'count-to-5': 'unsure' }, elapsedMs: 0, startedAt: 0, done: true, frontier: { status: 'unsure', ids: [], waitingOn: [], unsure: ['count-to-5'] }, placed: null }, literacy: null },
  } },
  settings: { parentPinHash: 'a'.repeat(64), parentPinSalt: 'b'.repeat(32), calendar: { homeDays: [1, 2, 3, 4], breaks: [{ start: '2026-12-21', end: '2027-01-01', label: 'Winter break' }] } },
});

test('a valid older export and a current one pass', () => {
  const older = store.inspectImport(olderExport());
  assert.equal(older.ok, true, older.error);
  assert.deepEqual(older.learners, [
    { name: 'Sample Twelve', topics: 1, records: 1, tests: 0 },
    { name: 'Sample Thirteen', topics: 0, records: 0, tests: 0 },
  ]);
  assert.equal(store.inspectImport(current()).ok, true);
  // Both catch-up paces, and none (the default), are accepted.
  for (const pace of ['catch-up-first', 'mixed', undefined]) {
    const doc = current();
    if (pace) doc.plan.s_new.pace = pace; else delete doc.plan.s_new.pace;
    assert.equal(store.inspectImport(doc).ok, true, String(pace));
  }
  // Absent and null optional fields are fine.
  const sparse = current();
  Object.assign(sparse.students[0], { birthYear: null, birthMonth: null, startDate: undefined, color: undefined });
  sparse.interests.s_new = null;
  sparse.settings = { calendar: null };
  assert.equal(store.inspectImport(sparse).ok, true);
  // An older file's plain PIN, even a number, is hashed on the way in.
  assert.equal(store.inspectImport({ ...current(), schemaVersion: 1, settings: { parentPin: 1357, calendar: {} } }).ok, true);
});

test('a document with no level-set section, or an empty one, passes', () => {
  const absent = current();
  delete absent.levelset;
  assert.equal(store.inspectImport(absent).ok, true, 'no levelset key');
  assert.equal(store.inspectImport({ ...current(), levelset: {} }).ok, true, 'an empty section');
  assert.equal(store.inspectImport({ ...current(), levelset: { s_new: {} } }).ok, true, 'an empty workbook for a learner');
  assert.equal(store.inspectImport({ ...current(), levelset: { s_new: { lanes: {}, observe: [] } } }).ok, true, 'no lanes started');
  assert.equal(store.inspectImport({ ...current(), levelset: { s_new: null } }).ok, true, 'a learner with nothing saved');
  // A key a newer Harrington adds is not checked as a workbook.
  assert.equal(store.inspectImport({ ...current(), futureWorkbook: { future: true } }).ok, true);
});

const learnerCases = [
  ['an empty name', { name: '   ' }, 'Learner 1 in the file has an empty name.'],
  ['a long name', { name: 'x'.repeat(61) }, 'Learner 1 in the file has a name longer than 60 characters.'],
  ['a birth year before 1990', { birthYear: 1989 }, 'The learner “Sample Fourteen” in the file has a birth year outside 1990 to this year.'],
  ['a future birth year', { birthYear: new Date().getFullYear() + 1 }, 'The learner “Sample Fourteen” in the file has a birth year outside 1990 to this year.'],
  ['a birth year as text', { birthYear: '2018' }, 'The learner “Sample Fourteen” in the file has a birth year outside 1990 to this year.'],
  ['a birth month of 13', { birthMonth: 13 }, 'The learner “Sample Fourteen” in the file has a birth month outside 1 to 12.'],
  ['a birth month of 0', { birthMonth: 0 }, 'The learner “Sample Fourteen” in the file has a birth month outside 1 to 12.'],
  ['a malformed start date', { startDate: 'soon' }, 'The learner “Sample Fourteen” in the file has a start date that is not a yyyy-mm-dd date.'],
  ['an impossible start date', { startDate: '2026-02-30' }, 'The learner “Sample Fourteen” in the file has a start date that is not a yyyy-mm-dd date.'],
  ['markup as a color', { color: 'red;background:url(x)' }, 'The learner “Sample Fourteen” in the file has a color that is not a hex color.'],
  ['a color that is not a string', { color: 7 }, 'The learner “Sample Fourteen” in the file has a color that is not a hex color.'],
  ['no id', { id: undefined }, 'The learner “Sample Fourteen” in the file is missing an id or name.'],
  ['an id with markup', { id: 's"><img src=x>' }, 'The learner “Sample Fourteen” in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
  ['an id of "constructor"', { id: 'constructor' }, 'The learner “Sample Fourteen” in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
  ['an id of "__proto__"', { id: '__proto__' }, 'The learner “Sample Fourteen” in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
  ['an id of 65 characters', { id: 'x'.repeat(65) }, 'The learner “Sample Fourteen” in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
];
for (const [label, patch, error] of learnerCases) {
  test(`refuses a learner with ${label}`, () => {
    const doc = current();
    Object.assign(doc.students[0], patch);
    assert.deepEqual(store.inspectImport(doc), { ok: false, error, learners: [] });
  });
}

test('refuses two learners with the same id', () => {
  const doc = olderExport();
  doc.students[1].id = doc.students[0].id;
  assert.equal(store.inspectImport(doc).error, 'The learner “Sample Thirteen” in the file has the same id as another learner.');
});

const mapCases = [
  ['a record type with markup', (d) => { d.records.s_new[0].type = '<img src=x onerror=alert(1)>'; }, 'A record for Sample Fourteen in the file (“Talked”) has a type other than observation, question, discussion, assessment, recording, note.'],
  ['a record rating of 6', (d) => { d.records.s_new[0].rating = 6; }, 'A record for Sample Fourteen in the file (“Talked”) has a rating outside 1 to 5.'],
  ['a record rating as text', (d) => { d.records.s_new[0].rating = '5'; }, 'A record for Sample Fourteen in the file (“Talked”) has a rating outside 1 to 5.'],
  ['a record title that is not text', (d) => { d.records.s_new[0].title = { html: '<b>' }; }, 'A record for Sample Fourteen in the file (records item 1) has a title that is not text of at most 1,000 characters.'],
  ['a record note over the bound', (d) => { d.records.s_new[0].note = 'x'.repeat(50_001); }, 'A record for Sample Fourteen in the file (“Talked”) has a note that is not text of at most 50,000 characters.'],
  ['a record date as text', (d) => { d.records.s_new[0].createdAt = 'yesterday'; }, 'A record for Sample Fourteen in the file (“Talked”) has a date that is not a number.'],
  ['a record duration as text', (d) => { d.records.s_new[0].duration = '<b>1</b>'; }, 'A record for Sample Fourteen in the file (“Talked”) has a duration that is not a number.'],
  ['a learner\'s records that are not a list', (d) => { d.records.s_new = { r1: {} }; }, 'The file\'s "records" section is not in the expected shape.'],
  ['a test score with markup', (d) => { d.tests.s_new[0].pct = '<img src=x onerror=alert(1)>'; }, 'A test result for Sample Fourteen in the file (tests item 1) has a score outside 0 to 100%.'],
  ['a test score of 101', (d) => { d.tests.s_new[0].pct = 101; }, 'A test result for Sample Fourteen in the file (tests item 1) has a score outside 0 to 100%.'],
  ['a negative test total', (d) => { d.tests.s_new[0].total = -1; }, 'A test result for Sample Fourteen in the file (tests item 1) has a total that is not a number of zero or more.'],
  ['a test score as text', (d) => { d.tests.s_new[0].score = '9'; }, 'A test result for Sample Fourteen in the file (tests item 1) has a score that is not a number of zero or more.'],
  ['a test date as text', (d) => { d.tests.s_new[0].createdAt = 'yesterday'; }, 'A test result for Sample Fourteen in the file (tests item 1) has a date that is not a number.'],
  ['a record that is null', (d) => { d.records.s_new = [null]; }, 'A record for Sample Fourteen in the file (records item 1) is not a record.'],
  ['a record that is a number', (d) => { d.records.s_new = [5]; }, 'A record for Sample Fourteen in the file (records item 1) is not a record.'],
  ['a test result that is null', (d) => { d.tests.s_new = [null]; }, 'A test result for Sample Fourteen in the file (tests item 1) is not a test result.'],
  ['a test result that is a number', (d) => { d.tests.s_new = [5]; }, 'A test result for Sample Fourteen in the file (tests item 1) is not a test result.'],
  ['a challenge result that is null', (d) => { d.challenges.s_new = [null]; }, 'A challenge result for Sample Fourteen in the file (challenges item 1) is not a challenge result.'],
  ['a challenge result that is a number', (d) => { d.challenges.s_new = [5]; }, 'A challenge result for Sample Fourteen in the file (challenges item 1) is not a challenge result.'],
  ['a learner\'s game that is null', (d) => { d.game.s_new = null; }, 'The file\'s "game" section is not in the expected shape.'],
  ['a learner\'s game that is a number', (d) => { d.game.s_new = 5; }, 'The file\'s "game" section is not in the expected shape.'],
  ['a placement without topic ids', (d) => { d.records.s_new[1].placement = { subject: 'Mathematics' }; }, 'A record for Sample Fourteen in the file (“Placement”) has a placement that is not in the expected shape.'],
  ['a placement that is text', (d) => { d.records.s_new[1].placement = 'yes'; }, 'A record for Sample Fourteen in the file (“Placement”) has a placement that is not in the expected shape.'],
  ['suggestions that are a number', (d) => { d.suggestions.s_new = 5; }, 'The file\'s "suggestions" section is not in the expected shape.'],
  ['suggestions that are text', (d) => { d.suggestions.s_new = 'x'; }, 'The file\'s "suggestions" section is not in the expected shape.'],
  ['suggestions that are an object', (d) => { d.suggestions.s_new = {}; }, 'The file\'s "suggestions" section is not in the expected shape.'],
  ['a suggestion that is not an object', (d) => { d.suggestions.s_new = [5]; }, 'The file\'s "suggestions" section is not in the expected shape.'],
  ['a plan that is a number', (d) => { d.plan.s_new = 5; }, 'The file\'s "plan" section is not in the expected shape.'],
  ['a plan that is text', (d) => { d.plan.s_new = 'x'; }, 'The file\'s "plan" section is not in the expected shape.'],
  ['plan moves that are a number', (d) => { d.plan.s_new.moves = 5; }, 'The file\'s "plan" section is not in the expected shape.'],
  ['a catch-up pace that is not one of the two paces', (d) => { d.plan.s_new.pace = 'fast'; }, 'The file\'s "plan" section is not in the expected shape.'],
  ['a catch-up pace that is a number', (d) => { d.plan.s_new.pace = 2; }, 'The file\'s "plan" section is not in the expected shape.'],
  ['plan extras for a day that are not a list', (d) => { d.plan.s_new.extras['2026-09-03'] = { id: 'x1' }; }, 'The file\'s "plan" section is not in the expected shape.'],
  ['daily choices that are a number', (d) => { d.daily.s_new = 5; }, 'The file\'s "daily" section is not in the expected shape.'],
  ['a day\'s choices that are text', (d) => { d.daily.s_new['2026-09-01'] = 'x'; }, 'The file\'s "daily" section is not in the expected shape.'],
  ['daily offers for a lane that are not a list', (d) => { d.daily.s_new['2026-09-01'].offers.literacy = 'rhymes'; }, 'The file\'s "daily" section is not in the expected shape.'],
  ['adaptations that are a list', (d) => { d.adaptations.s_new = []; }, 'The file\'s "adaptations" section is not in the expected shape.'],
  ['recall that is a number', (d) => { d.recall.s_new = 5; }, 'The file\'s "recall" section is not in the expected shape.'],
  ['practice that is text', (d) => { d.practice.s_new = 'x'; }, 'The file\'s "practice" section is not in the expected shape.'],
  ['activity that is a list', (d) => { d.activity.s_new = ['2026-09-01']; }, 'The file\'s "activity" section is not in the expected shape.'],
  ['a recall card that is null', (d) => { d.recall.s_new = { c1: null }; }, 'The file\'s "recall" section is not in the expected shape.'],
  ['a practice item that is null', (d) => { d.practice.s_new = { p1: null }; }, 'The file\'s "practice" section is not in the expected shape.'],
  ['an adaptation that is null', (d) => { d.adaptations.s_new['Mathematics|Counting'] = null; }, 'The file\'s "adaptations" section is not in the expected shape.'],
  ['a plan extra that is null', (d) => { d.plan.s_new.extras['2026-09-03'] = [null]; }, 'The file\'s "plan" section is not in the expected shape.'],
  ['notification details that are text', (d) => { d.notifications[1].meta = 'x'; }, 'Notification 2 in the file has details that are not in the expected shape.'],
  ['notification sample names that are not a list', (d) => { d.notifications[1].meta.sampleNames = 'Rhymes'; }, 'Notification 2 in the file has sample names that are not a list of text.'],
  ['notification sample names that are not text', (d) => { d.notifications[1].meta.sampleNames = [{}]; }, 'Notification 2 in the file has sample names that are not a list of text.'],
  ['notification added topics that are not lists', (d) => { d.notifications[1].meta.addedBySubject = { English: 'rhymes' }; }, 'Notification 2 in the file has added topics that are not lists.'],
  ['dismissed alerts with a text date', (d) => { d.dismissedAlerts = { welcome: 'yesterday' }; }, 'The file\'s dismissed alerts are not in the expected shape.'],
  ['a test pass mark as text', (d) => { d.tests.s_new[0].passed = 'yes'; }, 'A test result for Sample Fourteen in the file (tests item 1) has a pass mark that is not true or false.'],
  ['a challenge count as text', (d) => { d.challenges.s_new[0].correct = '<b>5</b>'; }, 'A challenge result for Sample Fourteen in the file (challenges item 1) has a correct count that is not a whole number.'],
  ['a negative challenge time', (d) => { d.challenges.s_new[0].seconds = -1; }, 'A challenge result for Sample Fourteen in the file (challenges item 1) has a time that is not a number.'],
  ['XP with markup', (d) => { d.game.s_new.xp = '<img src=x onerror=alert(1)>'; }, 'Sample Fourteen\'s XP is not a number of zero or more.'],
  ['XP that is infinite', (d) => { d.game.s_new.xp = Infinity; }, 'Sample Fourteen\'s XP is not a number of zero or more.'],
  ['badges as a list', (d) => { d.game.s_new.badges = ['first']; }, 'Sample Fourteen\'s badges are not in the expected shape.'],
  ['a notification that is not an object', (d) => { d.notifications = ['hi']; }, 'Notification 1 in the file is not a notification.'],
  ['a notification title that is not text', (d) => { d.notifications[0].title = { html: '<b>' }; }, 'Notification 1 in the file has a title that is not text.'],
  ['a notification read mark as text', (d) => { d.notifications[0].read = 'no'; }, 'Notification 1 in the file has a read mark that is not true or false.'],
  ['a progress status outside the known set', (d) => { d.progress.s_new = { t: { status: 'done' } }; }, 'Sample Fourteen\'s progress has a status other than none, learning, practicing, mastered.'],
  ['a progress entry that is not an object', (d) => { d.progress.s_new = { t: 'mastered' }; }, 'Sample Fourteen\'s progress has a status other than none, learning, practicing, mastered.'],
  ['a learner\'s progress that is a list', (d) => { d.progress.s_new = []; }, 'The file\'s "progress" section is not in the expected shape.'],
  ['interests as a list', (d) => { d.interests.s_new = ['Frogs']; }, 'The file\'s interests are not in the expected shape.'],
  ['interest chips that are not text', (d) => { d.interests.s_new = { chips: [{ label: 'Frogs' }] }; }, 'The file\'s interests are not in the expected shape.'],
  ['interest text that is not text', (d) => { d.interests.s_new = { chips: [], text: 7 }; }, 'The file\'s interests are not in the expected shape.'],
  ['a request log that is not a list', (d) => { d.requests.s_new = { rq1: d.requests.s_new[0] }; }, 'The file\'s "requests" section is not in the expected shape.'],
  ['a request log that is null', (d) => { d.requests.s_new = null; }, 'The file\'s "requests" section is not in the expected shape.'],
  ['a request that is not an entry', (d) => { d.requests.s_new.push('fractions'); }, 'A topic request for Sample Fourteen in the file (requests item 3) is not an entry.'],
  ['a request without an id', (d) => { delete d.requests.s_new[0].id; }, 'A topic request for Sample Fourteen in the file (requests item 1) has no id.'],
  ['a request id that is a number', (d) => { d.requests.s_new[0].id = 7; }, 'A topic request for Sample Fourteen in the file (requests item 1) has no id.'],
  ['a request text that is not text', (d) => { d.requests.s_new[1].text = ['volcanoes']; }, 'A topic request for Sample Fourteen in the file (requests item 2) has a text that is not text of at most 200 characters.'],
  ['a request text over 200 characters', (d) => { d.requests.s_new[1].text = 'x'.repeat(201); }, 'A topic request for Sample Fourteen in the file (requests item 2) has a text that is not text of at most 200 characters.'],
  ['a request date that is text', (d) => { d.requests.s_new[0].createdAt = 'today'; }, 'A topic request for Sample Fourteen in the file (requests item 1) has a date that is not a number.'],
  ['a request date that is infinite', (d) => { d.requests.s_new[0].createdAt = Infinity; }, 'A topic request for Sample Fourteen in the file (requests item 1) has a date that is not a number.'],
  ['a request topic that is a number', (d) => { d.requests.s_new[0].topicId = 42; }, 'A topic request for Sample Fourteen in the file (requests item 1) has a topic that is not a topic id.'],
  ['a learner\'s level-set workbook that is a list', (d) => { d.levelset.s_new = []; }, 'The file\'s level-set workbook is not in the expected shape.'],
  ['level-set lanes as a list', (d) => { d.levelset.s_new.lanes = [{}]; }, 'The file\'s level-set workbook is not in the expected shape.'],
  ['a level-set lane session that is text', (d) => { d.levelset.s_new.lanes.numeracy = 'sheet 1'; }, 'The file\'s level-set workbook is not in the expected shape.'],
  ['a level-set observation list that is not a list', (d) => { d.levelset.s_new.observe = 'count-to-5'; }, 'The file\'s level-set workbook is not in the expected shape.'],
  ['a level-set observation entry that is not text', (d) => { d.levelset.s_new.observe = [5]; }, 'The file\'s level-set workbook is not in the expected shape.'],
  ['a level-set tab that is not text', (d) => { d.levelset.s_new.lane = 1; }, 'The file\'s level-set workbook is not in the expected shape.'],
  ['settings as a list', (d) => { d.settings = []; }, 'The file\'s settings are not in the expected shape.'],
  ['a home day of 7', (d) => { d.settings.calendar.homeDays = [1, 7]; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['home days as text', (d) => { d.settings.calendar.homeDays = 'weekdays'; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['a break without an end', (d) => { d.settings.calendar.breaks = [{ start: '2026-12-21' }]; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['a break label that is not text', (d) => { d.settings.calendar.breaks[0].label = ['Winter']; }, 'The file\'s calendar settings are not in the expected shape.'],
  ['a calendar that is a list', (d) => { d.settings.calendar = []; }, 'The file\'s calendar settings are not in the expected shape.'],
];
// A plain PIN only exists before format 2; the server still checks its shape
// on such a save, so the rule is checked on the document as given.
for (const [label, pin] of [['a three-digit PIN', '123'], ['a PIN with letters', '12a4'], ['a PIN object', { pin: '1234' }]]) {
  test(`refuses ${label} in a format 1 document`, () => {
    const doc = { ...current(), schemaVersion: 1, settings: { parentPin: pin } };
    assert.equal(validateDocument(doc), 'The file\'s child-view PIN is not four digits.');
  });
}

for (const [label, mutate, error] of mapCases) {
  test(`refuses ${label}`, () => {
    const doc = current();
    mutate(doc);
    assert.deepEqual(store.inspectImport(doc), { ok: false, error, learners: [] });
  });
}

test('a fractional test score and total pass (AI questions can carry fractional points)', () => {
  const doc = current();
  Object.assign(doc.tests.s_new[0], { score: 2.5, total: 3.5 });
  assert.equal(store.inspectImport(doc).ok, true);
});

test('an active learner who is not in the file becomes the first learner', () => {
  const doc = current();
  doc.activeStudentId = 's_gone';
  assert.equal(store.inspectImport(doc).ok, true);
});

test('the record types and mastery statuses checked match the ones the app writes', async () => {
  const { RECORD_TYPES, MASTERY_STATUSES } = await import('../src/js/document.js');
  const { TYPES } = await import('../src/js/views/records.js');
  // 'note' is the label the record views fall back to for an older record.
  assert.deepEqual([...RECORD_TYPES].sort(), [...Object.keys(TYPES), 'note'].sort());
  assert.deepEqual([...MASTERY_STATUSES].sort(), Object.keys(store.MASTERY).sort());
});

test('a per-learner problem names the learner, cut to 40 characters, or the file when no learner has that id', () => {
  const long = current();
  long.students[0].name = `Sample ${'Fourteen'.repeat(6)}`;
  long.game.s_new.xp = -1;
  assert.equal(store.inspectImport(long).error, `${'Sample FourteenFourteenFourteenFourteenF'.slice(0, 39)}…'s XP is not a number of zero or more.`);
  const orphan = current();
  orphan.records.s_gone = [{ id: 'r9', type: 'markup' }];
  assert.match(store.inspectImport(orphan).error, /^A record in the file \(records item 1\) has a type other than/);
});

test('both learner name fields take the one name limit from document.js', async () => {
  const { readFile } = await import('node:fs/promises');
  const { NAME_MAX } = await import('../src/js/document.js');
  assert.equal(store.NAME_MAX, NAME_MAX);
  for (const file of ['src/js/app.js', 'src/js/views/shell.js']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const nameInputs = source.match(/<input[^>]*name="name"[^>]*>/g) || [];
    assert.equal(nameInputs.length, 1, `${file} has one learner name field`);
    assert.match(nameInputs[0], /maxlength="\$\{store\.NAME_MAX\}"/, file);
  }
});

test('an older export is checked as it will be saved: what the format 3 repair fixes imports', () => {
  const doc = current();
  doc.schemaVersion = 2;
  doc.students[0].name = `Sample ${'Fourteen'.repeat(15)}`;
  doc.students[0].birthYear = 1980;
  doc.records.s_new[0].note = 'x'.repeat(60_015);
  doc.recall.s_new.broken = null;
  const check = store.inspectImport(doc);
  assert.equal(check.ok, true, check.error);
  assert.equal(check.learners[0].name.length, 60, 'the preview shows the name as it will be saved');
  // The same file at the current format is refused, with the reason.
  assert.match(store.inspectImport({ ...doc, schemaVersion: SCHEMA_VERSION }).error, /has a name longer than 60 characters/);
});

test('validateDocument gives field-specific errors for reading setup and saved books', () => {
  const withReading = (patch) => {
    const doc = current();
    const base = {
      sequence: 'school-2026',
      graphemes: ['s', 'a', 't', 'p'],
      clusters: false,
      tricky: ['the'],
      custom: { graphemes: [], tricky: [] },
      prefs: { nameOnCover: true, layout: 'booklet' },
      library: [{
        id: 'lib_1',
        savedAt: 1_700_000_000_000,
        book: {
          title: 'Tap, tap',
          graphemes: ['t', 'a', 'p', 's'],
          focus: ['t', 'a', 'p', 's'],
          tricky: [],
          cover: [{ kind: 'tap', x: 200, y: 130, scale: 1.2 }],
          pages: [{ text: 'Tap.', scene: [{ kind: 'tap', x: 200, y: 130 }] }],
        },
      }],
    };
    doc.reading = { s_new: base };
    patch(doc.reading.s_new);
    return doc;
  };

  assert.equal(validateDocument(withReading(() => {})), null);

  const cases = [
    ['reading setup not an object', (d) => { d.reading.s_new = []; }, 'Sample Fourteen\'s reading setup is not in the expected shape.'],
    ['long reading grapheme', (d) => { d.reading.s_new.graphemes = ['s', 'eighs']; }, 'Sample Fourteen\'s reading graphemes are not a list of sounds of at most 4 characters.'],
    ['long tricky word', (d) => { d.reading.s_new.tricky = ['x'.repeat(21)]; }, 'Sample Fourteen\'s tricky words are not a list of words of at most 20 characters.'],
    ['non-boolean clusters', (d) => { d.reading.s_new.clusters = 'yes'; }, 'Sample Fourteen\'s adjacent-consonants setting is not true or false.'],
    ['non-text sequence', (d) => { d.reading.s_new.sequence = 2; }, 'Sample Fourteen\'s reading sequence is not text.'],
    ['invalid print layout', (d) => { d.reading.s_new.prefs.layout = 'scroll'; }, 'Sample Fourteen\'s reading print layout is not "booklet" or "flat".'],
    ['non-boolean nameOnCover', (d) => { d.reading.s_new.prefs.nameOnCover = 'yes'; }, 'Sample Fourteen\'s cover-name setting is not true or false.'],
    ['reading library not a list', (d) => { d.reading.s_new.library = {}; }, 'Sample Fourteen\'s reading library is not a list of at most 100 books.'],
    ['unknown picture on cover', (d) => { d.reading.s_new.library[0].book.cover = [{ kind: 'dragon' }]; }, 'A saved book in the file\'s reading library for Sample Fourteen (“Tap, tap”) uses an unknown picture (“dragon”) in its cover scene.'],
    ['prototype picture on page', (d) => { d.reading.s_new.library[0].book.pages[0].scene = [{ kind: 'constructor' }]; }, 'A saved book in the file\'s reading library for Sample Fourteen (“Tap, tap”) uses an unknown picture (“constructor”) in its page 1 scene.'],
    ['non-numeric scene coordinate', (d) => { d.reading.s_new.library[0].book.pages[0].scene = [{ kind: 'tap', x: 'left' }]; }, 'A saved book in the file\'s reading library for Sample Fourteen (“Tap, tap”) has a x on item 1 in its page 1 scene that is not a number.'],
    ['malformed page text', (d) => { d.reading.s_new.library[0].book.pages[0].text = 42; }, 'A saved book in the file\'s reading library for Sample Fourteen (“Tap, tap”) has page 1 text that is not text of at most 300 characters.'],
    ['empty pages list', (d) => { d.reading.s_new.library[0].book.pages = []; }, 'A saved book in the file\'s reading library for Sample Fourteen (“Tap, tap”) must have 1 to 16 pages.'],
    ['blank book title', (d) => { d.reading.s_new.library[0].book.title = '   '; }, 'A saved book in the file\'s reading library for Sample Fourteen (library item 1) has a title that is not text of 1 to 300 characters.'],
    ['missing book id', (d) => { d.reading.s_new.library[0].id = ''; }, 'A saved book in the file\'s reading library for Sample Fourteen (“Tap, tap”) has an id that is not text of 1 to 80 characters.'],
    ['invalid book graphemes', (d) => { d.reading.s_new.library[0].book.graphemes = ['toolong']; }, 'A saved book in the file\'s reading library for Sample Fourteen (“Tap, tap”) has graphemes that are not a list of sounds of at most 4 characters.'],
  ];

  for (const [label, mutate, expected] of cases) {
    const doc = withReading(() => {});
    mutate(doc);
    assert.equal(validateDocument(doc), expected, label);
  }
});
