// App state + persistence through the family-owned Harrington server.
import * as backend from './backend.js';
import { AI_CAPABILITIES, capabilityOffMessage } from './ai-capabilities.js';
import { SCHEMA_VERSION, isNewerSchema, isUnwritableSchema, migrateDocument, schemaVersionOf } from './schema.js';
import { BOOKKEEPING_FIELDS, DOCUMENT_KEYS, dropBrokenEntries, LEARNER_KEYS, REQUEST_TEXT_MAX, RETIRED_FIELDS, MIN_BIRTH_YEAR, NAME_MAX, isObject, realDateKey, stripUnknownPictures, validDateKey, validMonth, validYear, validateDocument } from './document.js';
import { formatCount } from './format.js';
import { setHosting, SIGN_IN_MESSAGE } from './hosting.js';
import { getData, isCurrentTopic } from './data.js';
import { pruneDismissed } from './alert-dismissals.js';
import { normalizeSession } from './levelset.js';
import { LIBRARY_MAX, normalizeReading } from './phonics/reading.js';
import { PIN_PATTERN, hasPin, migratePinSettings, pinSettings, verifyPin } from './pin.js';
import { CURRICULUM_ID, learnerYear, normalizeYear } from './curriculum.js';

export { MIN_BIRTH_YEAR, NAME_MAX };

export const MASTERY = {
  none:       { label: 'Not started', rank: 0, color: '#d2c6ad' },
  learning:   { label: 'Learning',    rank: 1, color: '#8a6412' },
  practicing: { label: 'Practicing',  rank: 2, color: '#2f6285' },
  mastered:   { label: 'Mastered',    rank: 3, color: '#3f6b3b' },
};

const listeners = new Set();
let state = {
  user: { username: 'Family' },
  students: [],       // {id, name, birthYear, birthMonth?, avatar, color, curriculum?: { id, year }}
  activeStudentId: null,
  progress: {},       // studentId -> { topicId -> { status, updatedAt } }
  records: {},        // studentId -> [ {id, topicId, type, title, note, rating, questions, createdAt,
                      //   coverage?: [{topicId, topicName}], source?: {kind: 'daily-pick'|'invitation', key}} ]
  tests: {},          // studentId -> [ {id, scope, subject, topicId?, sectionId?, mode, score, total, pct, passed, createdAt} ]
                      //   mode: 'digital' | 'printable' | 'observed' (evidence checklist, no AI)
  plan: {},           // studentId -> { moves:{topicId:dateKey}, done:{dateKey:true}, extras:{dateKey:[items]}, pace? }
  challenges: {},     // studentId -> [ {id, topicId, subject, domain, correct, total, seconds, createdAt} ]
  adaptations: {},    // studentId -> { 'Subject|Domain': { level:'advanced', since } }
  suggestions: {},    // studentId -> [ {id, kind, subject, domain, reason, status, createdAt} ]
  notifications: [],  // legacy log from before the bell was computed (alerts.js); kept, read only to skip the welcome
  dismissedAlerts: {}, // family-wide: { alertKey: dismissedAt } (see alerts.js)
  recall: {},         // studentId -> { cardId -> { topicId, box, due, reps, lapses, last } }
  practice: {},       // studentId -> { itemId -> { topicId, subject, q, type, options, answer, box, due, reps, lapses, last } }
  activity: {},       // studentId -> { 'yyyy-mm-dd': true }  (days with recall/lesson/mastery activity)
  game: {},           // studentId -> { xp, badges: {badgeId: ts} }
  daily: {},          // studentId -> { 'yyyy-mm-dd': { offers: {literacy:[topicId], numeracy:[topicId]}, picks: {literacy, numeracy} } }
  interests: {},      // studentId -> { chips: [label], text: '' }  (what the learner is into, parent-entered)
  requests: {},       // studentId -> [ {id, text, createdAt, topicId|null} ]  (topic finder log, newest first)
  levelset: {},       // studentId -> { lanes: { literacy|numeracy: session }, observe: [topicId] }  (level-set workbook)
  reading: {},        // studentId -> { graphemes, clusters, tricky, custom, prefs, library }  (decodable books, phonics/reading.js)
  graphView: 'atlas', // 'atlas' (visual map) | 'list' (card drill-down)
  settings: {},       // family-wide: { parentPinHash, parentPinSalt, calendar: { homeDays:[0-6], breaks:[{start, end, label}] } }
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => fn(state)); }
export function get() { return state; }
// Re-renders the current view without saving: for state a view keeps for
// itself, such as the book being made (views/books.js).
export function redraw() { emit(); }

// ---- Server connection ----
// From /api/health; kept out of the persisted state.
let aiConfigured = false;
let aiCapabilities = []; // the capabilities the server switched on
let backupAgeDays;        // days since the newest backup, null for none
function applyHealth(health) {
  aiConfigured = health?.aiConfigured === true;
  // A server from before HARRINGTON_AI_CAPABILITIES reports no list: all on.
  aiCapabilities = !aiConfigured ? []
    : Array.isArray(health?.aiCapabilities) ? health.aiCapabilities : [...AI_CAPABILITIES];
}
export async function connect() {
  const health = await backend.health();
  setHosting(health);
  if (health?.authEnabled === true && health.signedIn !== true) throw new Error(SIGN_IN_MESSAGE);
  applyHealth(health);
  backupAgeDays = health?.backupAgeDays;
  state.user = { username: 'Family' };
  return state.user;
}
// Whether `capability` (see ai-capabilities.js) can generate now. An array
// asks for any of them; with none, any capability at all.
export function aiAvailable(capability) {
  if (!aiConfigured) return false;
  if (capability == null) return aiCapabilities.length > 0;
  return [].concat(capability).some(c => aiCapabilities.includes(c));
}
// A provider is set up but the family has not switched `capability` on yet.
export function aiSwitchedOff(capability) {
  return aiConfigured && !aiAvailable(capability);
}
export function backupAge() { return backupAgeDays; }
// Rejects when /api/health itself fails, so callers can tell an outage from a missing provider.
export async function refreshHealth(capability) {
  const before = `${aiConfigured}|${aiCapabilities}`;
  applyHealth(await backend.health());
  if (`${aiConfigured}|${aiCapabilities}` !== before) emit();
  return aiAvailable(capability);
}

// ---- Persistence ----
// The server stores one versioned document. Every save sends If-Match with the
// last version we saw; a 412 means another tab or device saved first, so we
// replace local state with the server's copy (no field-level merging).
let stateVersion = 0;
// A change is pending until the server has it: `dirty` while it is only in
// this tab, then `sending` holds the snapshot whose PUT is in flight, as
// { json, version, writeId, keepalive, fits } (fits: small enough for a
// beacon or a keepalive request). Both are off once the PUT resolves
// (synced), and on again if it fails. See syncStatus(). Whenever either
// changes, syncUnloadGuard() follows.
let dirty = false;
let sending = null;
let saving = false;
let saveTimer = null;
let saveQueue = Promise.resolve();
const saveListeners = new Set();
// Ids of our recent writes, so we can recognise our own save on the server.
const ownWrites = [];
// writeId of an unload beacon whose outcome we have not seen yet.
let unconfirmedBeacon = null;
// Recordings of removed learners, deleted once the removal is saved.
let pendingAudioDeletes = [];


// Save status for the UI: { type: 'saved' | 'conflict' | 'too-large' | 'rejected' | 'read-only' | 'failed', error?, automatic? }
export function onSaveStatus(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }
function saveStatus(event) { saveListeners.forEach(fn => { try { fn(event); } catch (e) { console.warn(e); } }); }

// Where this tab's changes are: 'dirty' (edited here, not yet sent),
// 'sending' (a PUT is in flight and nothing was edited since) or 'synced'.
export function syncStatus() {
  return dirty ? 'dirty' : sending ? 'sending' : 'synced';
}

function objectOr(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

// Top-level fields this version does not know (from a newer Harrington, say),
// kept as they are through load and save so nothing is dropped.
let unknownFields = {};
// Set when the loaded document is from a newer data format or has an
// unreadable one: nothing is saved until Harrington is updated (see
// isReadOnly), so this version can never write it back in an older shape.
let readOnly = false;
export function isReadOnly() { return readOnly; }
// Why it is read-only, for the banner and the "Not saved" toasts: a newer
// format asks for an update; a schemaVersion that is not a whole number
// (a hand edit, a damaged file) cannot be fixed by updating.
export function readOnlyMessage() { return readOnlyNewer ? READ_ONLY_MESSAGE : UNREADABLE_FORMAT_MESSAGE; }
let readOnlyNewer = true;

// The saved-key list lives in document.js (shared with import validation).
export { DOCUMENT_KEYS };

// The document's active learner if it is one of its learners, else the
// first learner: a dangling id would show "No student" and every save would be
// refused (document.js).
function activeOf(doc) {
  const students = Array.isArray(doc?.students) ? doc.students : [];
  return students.some(s => s?.id === doc.activeStudentId) ? doc.activeStudentId : students[0]?.id ?? null;
}

// How each field is normalized as the state holds it; learner maps default
// to objects. `fields` holds the fields normalized so far (students first).
const FIELD_NORMALIZERS = {
  students: v => (Array.isArray(v) ? v : []),
  activeStudentId: (v, fields) => activeOf({ students: fields.students, activeStudentId: v }),
  notifications: v => (Array.isArray(v) ? v : []),
  graphView: v => (v === 'list' ? 'list' : 'atlas'),
  settings: v => objectOr(v, {}),
  schemaVersion: v => v,
  // The topic finder's log: well-formed entries of known learners only.
  requests: (v, fields) => cleanRequestLogs(v, fields.students),
};

// The family fields of a stored document (or of the state), normalized.
function documentFields(data) {
  const doc = objectOr(data, {});
  const fields = {};
  for (const key of DOCUMENT_KEYS) {
    const normalize = FIELD_NORMALIZERS[key] || (v => objectOr(v, {}));
    fields[key] = normalize(doc[key], fields);
  }
  return fields;
}

// Applies a document from the server or an import. Returns true when a
// migration changed it, so the caller can save the migrated document once.
function applyDocument(data) {
  const raw = objectOr(data, {});
  readOnly = isUnwritableSchema(raw);
  readOnlyNewer = !readOnly || isNewerSchema(raw);
  // A non-object entry in a learner's lists would throw while rendering
  // (HAR-38). The schema 3 repair drops them for good on the migrating load;
  // one in a current document (a hand edit) is dropped in memory here, and
  // the next save carries the cleaned document.
  // Loaded from the server: its first save in a newer format keeps the stored
  // file, so the migration's notice can name that copy (schema.js).
  const { doc } = dropBrokenEntries(migrateDocument(raw, { context: { keepsCopy: true } }));
  unknownFields = Object.fromEntries(Object.entries(doc)
    .filter(([key]) => !DOCUMENT_KEYS.includes(key) && !BOOKKEEPING_FIELDS.includes(key) && !RETIRED_FIELDS.includes(key)));
  const fields = documentFields(doc);
  // Schema step 1 -> 2 hashes a plain PIN (schema.js, pin.js). A current
  // document that still carries one (a hand edit, an older tab) is hashed here
  // as well, so no save writes it back. A read-only (newer) document is never
  // touched.
  const settings = readOnly ? fields.settings : migratePinSettings(fields.settings);
  Object.assign(state, fields, { settings });
  stateVersion = versionOf(doc);
  // After the migration: the migrated document is the synced snapshot, and
  // the migration save then marks what it sent (saveWith). So a conflict
  // never reports the migration as a lost change.
  markSynced();
  return !readOnly && (schemaVersionOf(doc) !== schemaVersionOf(raw) || settings !== fields.settings);
}

// Loading never writes, with one exception: a document a migration changed
// (a schema step, or a plain PIN hashed) is saved once, right away, as a
// normal versioned save. applyDocument has already marked the migrated
// document as synced, and the save marks what it sent, so a conflict never
// lists the migration as a lost change. If the migration is all this tab has to save and another tab saved first (two tabs
// open during the upgrade), the conflict reload is not worth a toast: the
// reloaded document is migrated again.
let migrationOnly = false;
function saveIfMigrated(migrated) {
  if (!migrated) return Promise.resolve(true);
  const pending = dirty;
  dirty = true;
  syncUnloadGuard();
  migrationOnly = !pending;
  return flushSaves();
}

export async function loadAll() {
  let migrated;
  try {
    migrated = applyDocument(await backend.loadState());
  } catch (e) {
    console.warn('load failed', e);
    throw e;
  }
  await saveIfMigrated(migrated);
}

// Saves are always in the format this code writes (see schema.js), with every
// field in documentFields and any unknown top-level field carried over.
function snapshotData() {
  return { ...unknownFields, ...documentFields(state), schemaVersion: SCHEMA_VERSION };
}

// Two documents as a conflict compares them: the saved fields only, since
// unknown fields are never a parent's change.
function comparable(data) {
  return JSON.parse(JSON.stringify(documentFields(data)));
}

// The document as last agreed with the server (loaded, or accepted by a
// save), as JSON. On a conflict it is compared with this tab's state to tell
// what the reload discards.
let syncedJson = null;
function markSynced(data = snapshotData()) { syncedJson = typeof data === 'string' ? data : JSON.stringify(data); }

// Drops empty objects and arrays, recursively, so a container created
// lazily on read (recallOf makes recall[id] = {}) is not a change.
function pruneEmpty(value) {
  if (Array.isArray(value)) return value.map(pruneEmpty);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const p = pruneEmpty(v);
    if (p && typeof p === 'object' && (Array.isArray(p) ? p.length === 0 : Object.keys(p).length === 0)) continue;
    out[k] = p;
  }
  return out;
}

// What changed between two family documents (`base`, the last synced copy,
// and `local`, this tab's state), as a list of changes:
//   { kind: 'status', studentId, topicId, entry }  a topic's progress entry set
//   { kind: 'record', studentId, record }          a record added
//   { kind: 'activity', studentId, day }           a day marked active
//   { kind: 'offers', studentId, day, entry }      a day's daily offers chosen
//   { kind: 'other', key }                         anything else (not re-applied)
// Empty containers are ignored. Pure, so it can be tested without a server.
export function diffDocuments(base, local) {
  const b = objectOr(base, {});
  const l = objectOr(local, {});
  const changes = [];
  // Pruned only for comparing: the payloads keep their values as they are
  // (a day's offers keep their empty `picks`, which pickDaily writes into).
  const same = (x, y) => JSON.stringify(pruneEmpty(x)) === JSON.stringify(pruneEmpty(y));
  for (const key of new Set([...Object.keys(b), ...Object.keys(l)])) {
    if (same(b[key], l[key])) continue;
    if (key === 'progress') {
      for (const studentId of new Set([...Object.keys(objectOr(b.progress, {})), ...Object.keys(objectOr(l.progress, {}))])) {
        const before = objectOr(objectOr(b.progress, {})[studentId], {});
        const now = objectOr(objectOr(l.progress, {})[studentId], {});
        for (const [topicId, entry] of Object.entries(now)) {
          if (!same(before[topicId], entry)) changes.push({ kind: 'status', studentId, topicId, entry });
        }
        if (Object.keys(before).some(id => !(id in now))) changes.push({ kind: 'other', key });
      }
    } else if (key === 'records') {
      for (const studentId of new Set([...Object.keys(objectOr(b.records, {})), ...Object.keys(objectOr(l.records, {}))])) {
        const before = new Map((objectOr(b.records, {})[studentId] || []).map(r => [r.id, r]));
        const now = new Set();
        for (const record of objectOr(l.records, {})[studentId] || []) {
          now.add(record.id);
          if (!before.has(record.id)) changes.push({ kind: 'record', studentId, record });
          else if (!same(before.get(record.id), record)) changes.push({ kind: 'other', key });
        }
        if ([...before.keys()].some(id => !now.has(id))) changes.push({ kind: 'other', key });
      }
    } else if (key === 'activity') {
      for (const [studentId, days] of Object.entries(objectOr(l.activity, {}))) {
        const before = objectOr(objectOr(b.activity, {})[studentId], {});
        for (const day of Object.keys(objectOr(days, {}))) if (!before[day]) changes.push({ kind: 'activity', studentId, day });
      }
    } else if (key === 'daily') {
      // A new day holding only offers is written while rendering; old days are
      // pruned at the same time. A pick is the parent's change.
      for (const [studentId, days] of Object.entries(objectOr(l.daily, {}))) {
        const before = objectOr(objectOr(b.daily, {})[studentId], {});
        for (const [day, entry] of Object.entries(objectOr(days, {}))) {
          if (same(before[day], entry)) continue;
          const offersOnly = !before[day] && Object.keys(objectOr(entry?.picks, {})).length === 0;
          changes.push(offersOnly ? { kind: 'offers', studentId, day, entry } : { kind: 'other', key });
        }
      }
    } else {
      changes.push({ kind: 'other', key });
    }
  }
  return changes;
}

// ---- Bookkeeping: writes a tab makes on its own while rendering ----
// Never reported as lost; put back silently, only where the fresh document
// lacks them, so two tabs opened together never conflict.
const BOOKKEEPING = new Set(['activity', 'offers']);
function isBookkeeping(c) {
  return BOOKKEEPING.has(c.kind);
}
// Returns true when it changed the state.
function reapplyBookkeeping(c) {
  if (c.kind === 'activity') {
    const days = state.activity[c.studentId] = state.activity[c.studentId] || {};
    if (days[c.day]) return false;
    days[c.day] = true;
  } else if (c.kind === 'offers') {
    const days = state.daily[c.studentId] = state.daily[c.studentId] || {};
    if (days[c.day]) return false;
    days[c.day] = { picks: {}, ...c.entry };
  } else {
    return false;
  }
  return true;
}

// One line naming what a conflict discarded, for the toast: up to three
// items, then "and N more". `nameOf(topicId)` gives a topic's name. Returns
// '' when nothing a parent did was lost.
export function describeDiscarded(changes, nameOf = id => id) {
  const parts = [];
  for (const c of changes || []) {
    if (isBookkeeping(c)) continue;
    if (c.kind === 'status') {
      const status = c.entry?.status || 'none';
      parts.push(`${nameOf(c.topicId) || 'a topic'} marked ${status === 'none' ? 'not started' : status}`);
    } else if (c.kind === 'record') {
      const what = c.record?.type === 'note' ? 'the note' : 'the record';
      parts.push(c.record?.title ? `${what} “${c.record.title}”` : what);
    } else if (c.kind === 'other') {
      parts.push('other changes');
    }
  }
  const unique = [...new Set(parts)];
  if (unique.length <= 3) return unique.join(', ');
  return `${unique.slice(0, 3).join(', ')} and ${formatCount(unique.length - 3)} more`;
}

// True when every change can be put back on a fresh document as it is.
export function canReapply(changes) {
  return (changes || []).every(c => c.kind !== 'other');
}

// A change for a learner no longer in the family cannot be put back.
function forPresentLearner(c) {
  return !c.studentId || state.students.some(s => s.id === c.studentId);
}

// Puts changes back on the current (fresh) document. Returns true when
// anything changed.
function reapply(changes) {
  let changed = false;
  for (const c of changes) {
    if (!forPresentLearner(c)) continue;
    if (c.kind === 'status') {
      const p = state.progress[c.studentId] = state.progress[c.studentId] || {};
      p[c.topicId] = { ...c.entry };
      changed = true;
    } else if (c.kind === 'record') {
      const list = state.records[c.studentId] = state.records[c.studentId] || [];
      if (!list.some(r => r.id === c.record.id)) { list.unshift(c.record); changed = true; }
    } else if (reapplyBookkeeping(c)) {
      changed = true;
    }
  }
  return changed;
}

function newWriteId() {
  const id = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  ownWrites.push(id);
  if (ownWrites.length > 16) ownWrites.shift();
  return id;
}

function versionOf(doc) {
  return Number.isSafeInteger(doc?.version) ? doc.version : 0;
}

// Another tab or device saved first: take its document. Bookkeeping (see
// above) is put back silently. If the parent's changes were lost, one
// 'conflict' event names them, with `retry` when they can simply be applied
// again on the fresh document.
function reloadFromServer(doc) {
  clearTimeout(saveTimer);
  saveTimer = null;
  dirty = false;
  syncUnloadGuard();
  // A pending beacon carried the version we are discarding, so it cannot land.
  unconfirmedBeacon = null;
  let changes = [];
  try { changes = diffDocuments(comparable(JSON.parse(syncedJson || 'null')), comparable(snapshotData())); }
  catch (e) { console.warn('could not compare with the saved copy', e); }
  const quiet = migrationOnly;
  migrationOnly = false;
  const migrated = applyDocument(doc);
  const present = new Set(state.students.map(s => s.id));
  pendingAudioDeletes = pendingAudioDeletes.filter(item => !present.has(item.studentId));
  const discarded = changes.filter(c => !isBookkeeping(c));
  // Bookkeeping is an automatic write: refused without a toast if the fresh
  // document is read-only.
  if (reapply(changes.filter(c => isBookkeeping(c) && c.kind !== 'activity'))) persist({ automatic: true });
  saveIfMigrated(migrated);
  emit();
  if (quiet) return; // only our PIN migration was lost: the reload migrated again
  if (!discarded.length && changes.length) return; // only bookkeeping lost: nothing to tell
  const retry = discarded.some(forPresentLearner) && canReapply(discarded)
    ? () => { if (reapply(changes)) { persist(); emit(); } }
    : null;
  saveStatus({ type: 'conflict', discarded, retry });
}

// Deletes recordings of learners whose removal the server has accepted.
function deleteRemovedAudio() {
  const present = new Set(state.students.map(s => s.id));
  const ready = pendingAudioDeletes.filter(item => !present.has(item.studentId));
  pendingAudioDeletes = pendingAudioDeletes.filter(item => present.has(item.studentId));
  for (const item of ready) backend.deleteAudio(item.path).catch(() => {});
}

// True when the server document is a write of ours that landed since we
// last looked. The writeId alone is not enough: a backup restored over the
// server can carry an old write of this tab, and then the version has moved
// backwards. That document is not ours any more, it is what the parent chose
// to go back to (HAR-44).
function isOwnNewerWrite(doc) {
  return versionOf(doc) > stateVersion && ownWrites.includes(doc.writeId);
}

// Compares the server document with what we know. Returns true when local
// state stays (the server holds our own write or nothing new), false after
// reloading because another tab or device saved.
function reconcile(doc) {
  const beaconId = unconfirmedBeacon;
  unconfirmedBeacon = null;
  const version = versionOf(doc);
  if (isOwnNewerWrite(doc)) {
    stateVersion = version;
    markSynced(documentFields(doc));
    deleteRemovedAudio();
    // Our beacon did not land, a later save of ours did; send its changes again.
    if (beaconId && doc.writeId !== beaconId) persist();
    return true;
  }
  if (version === stateVersion) {
    // Nothing landed, our beacon included; send its changes again.
    if (beaconId) persist();
    return true;
  }
  reloadFromServer(doc);
  return false;
}

// The document to act on after a 412: the body, or a fresh read if the body
// was not a usable document.
async function conflictDocument(error) {
  const body = error.body;
  if (body && typeof body === 'object' && Number.isSafeInteger(body.version)) return body;
  return backend.loadState();
}

// Runs one save. `makeData()` builds the body just before sending (null means
// nothing to send). A 412 caused by our own earlier write, such as an unload
// beacon, adopts that version and tries again; any other 412 reloads, a
// restored backup carrying an old write of ours included (isOwnNewerWrite).
// One PUT. A keepalive request shares the browser's unload budget with
// beacons (backend.js): while a beacon is still uploading, Chromium refuses
// the request before it is sent ("Failed to fetch"). A keepalive request
// that got no answer is therefore sent again at once as a plain request; if
// the first did reach the server, the second gets a 412 naming its own
// writeId and saveWith counts it as landed.
async function sendState(body, keepalive) {
  try {
    return await backend.saveState(body, stateVersion, { keepalive });
  } catch (e) {
    if (!keepalive || e.status !== undefined) throw e;
    sending = { ...sending, keepalive: false };
    return backend.saveState(body, stateVersion);
  }
}

async function saveWith(makeData) {
  if (readOnly) { dirty = false; syncUnloadGuard(); saveStatus({ type: 'read-only' }); return false; }
  saving = true;
  // Kept across attempts: after a 412 caused by our own earlier write, the
  // body is sent again even if makeData() has nothing new. (Its containers
  // are the state's own, so the retry carries edits made since.)
  let data = null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (unconfirmedBeacon && !reconcile(await backend.loadState())) return false;
      data = makeData() ?? data;
      if (data === null) return true;
      const writeId = newWriteId();
      try {
        // Frozen before sending: edits made while the save is in flight are not on the server yet.
        const sent = JSON.stringify(data);
        const body = backend.stateBody(data, writeId);
        const fits = backend.fitsUnload(body);
        const keepalive = fits && backend.supportsKeepalive();
        // Pending until the server answers: if the page is hidden meanwhile,
        // handlePageHidden sends this same snapshot as a beacon, and
        // handleBeforeUnload warns when neither can outlive the page (HAR-43).
        sending = { json: sent, version: stateVersion, writeId, keepalive, fits };
        syncUnloadGuard();
        let next;
        try { next = await sendState(body, keepalive); } finally { sending = null; syncUnloadGuard(); }
        // The beacon copy of this body, if one went out, cannot land now.
        if (unconfirmedBeacon === writeId) unconfirmedBeacon = null;
        stateVersion = Math.max(stateVersion, next);
        markSynced(sent);
        if (!dirty) migrationOnly = false;
        deleteRemovedAudio();
        saveStatus({ type: 'saved' });
        return true;
      } catch (e) {
        if (e.status !== 412) throw e;
        const doc = await conflictDocument(e);
        if (!isOwnNewerWrite(doc)) { reloadFromServer(doc); return false; }
        if (doc.writeId === unconfirmedBeacon) unconfirmedBeacon = null;
        stateVersion = versionOf(doc);
        markSynced(documentFields(doc));
        deleteRemovedAudio();
        if (doc.writeId === writeId) {
          // This very body landed, as the beacon copy sent on unload.
          if (!dirty) migrationOnly = false;
          saveStatus({ type: 'saved' });
          return true;
        }
      }
    }
    throw new Error('Family data kept changing while saving');
  } catch (e) {
    dirty = true;
    syncUnloadGuard();
    console.warn('save failed', e);
    // 422 and 409: the server refused the document itself (document.js and
    // the data format rules), so retrying the same data will not help.
    const type = e.status === 413 ? 'too-large' : e.status === 422 || e.status === 409 ? 'rejected' : 'failed';
    saveStatus({ type, error: e });
    return false;
  } finally {
    saving = false;
  }
}

function saveNow() {
  if (!dirty) return Promise.resolve(true);
  return saveWith(() => {
    if (!dirty) return null;
    dirty = false;
    return snapshotData();
  });
}

// Saves any pending change right away. Resolves once every queued save is done.
export function flushSaves() {
  clearTimeout(saveTimer);
  saveTimer = null;
  saveQueue = saveQueue.catch(() => {}).then(saveNow);
  return saveQueue;
}

// automatic: a write the app makes while rendering (today's daily choices, a
// recall card it starts tracking, a calendar extra whose topic is gone), not
// one the parent asked for. While
// read-only the shell keeps its banner but does not toast for those.
function persist({ automatic = false } = {}) {
  if (readOnly) { saveStatus({ type: 'read-only', automatic }); return; }
  migrationOnly = false;
  dirty = true;
  syncUnloadGuard();
  clearTimeout(saveTimer);
  saveTimer = null;
  // Checked now with the server's own rules (document.js): a change that
  // leaves the document unsaveable is refused in the same task as the action,
  // so the shell can hold back its confirmation ("Record saved") and show the
  // reason. Nothing is sent; the change stays pending, and the next change
  // that makes the document valid again saves it.
  const problem = validateDocument(snapshotData());
  if (problem) { saveStatus({ type: 'rejected', error: new Error(problem), automatic }); return; }
  saveTimer = setTimeout(flushSaves, 400);
}

// The page is being hidden or closed: a debounced save would be lost, so send
// it now as a beacon. Beacons cannot carry If-Match, so the version rides in
// the body. We cannot see the result, so the version is not advanced; the
// beacon's writeId is checked against the server when the tab returns or
// before the next save. A save still in flight uses the same version, so
// exactly one of the two wins, and the other is recognised and sent again
// as long as the tab is still open (reconcile, saveWith). A tab that closes
// with both on the wire cannot do that, which is why handleBeforeUnload
// warns when a change is pending on top of a save in flight.
// With nothing edited since, a save still in flight is at risk too: its PUT
// is aborted with the page unless it was sent with keepalive. So the same
// snapshot goes out again as a beacon, with the same writeId: whichever of
// the two lands, the other gets a 412 naming it and stands down (saveWith).
export function handlePageHidden() {
  if (readOnly) return;
  if (!dirty) {
    if (sending && !sending.keepalive && sending.fits && backend.beaconState(JSON.parse(sending.json), sending.version, sending.writeId)) {
      unconfirmedBeacon = sending.writeId;
    }
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = null;
  const writeId = newWriteId();
  if (backend.beaconState(snapshotData(), stateVersion, writeId)) {
    dirty = false;
    syncUnloadGuard();
    unconfirmedBeacon = writeId;
  } else {
    console.warn('The browser refused to send family data on unload (beacons are limited to about 64 KB); saving normally instead.');
    flushSaves();
  }
}

export const UNLOAD_WARNING = 'Harrington is still saving your changes. Leave anyway?';

// The page is about to be closed or reloaded. The browser is asked to confirm
// (with its own leave-page text; desktop browsers only) when a change would
// not survive the page: a save in flight whose body is too large for a
// beacon or a keepalive request (about 64 KB), a pending change that large,
// or a pending change on top of a save in flight (if the save lands first,
// the beacon of the newer change is refused with nobody left to send it
// again). A pending change at risk is saved right away, so staying finishes
// it. Returns true when it warned.
export function handleBeforeUnload(event) {
  if (readOnly) return false;
  let atRisk = Boolean(sending && !sending.fits);
  if (dirty && (sending || !backend.fitsUnload(JSON.stringify(snapshotData())))) {
    flushSaves();
    atRisk = true;
  }
  if (!atRisk) return false;
  event.preventDefault();
  event.returnValue = UNLOAD_WARNING; // what older browsers look at
  return true;
}

// The beforeunload listener is on only while a change is pending or a save
// is in flight: a page listening for beforeunload is kept out of the
// back/forward cache (Firefox), so at rest there is none.
let unloadGuardOn = false;
function syncUnloadGuard() {
  if (typeof window === 'undefined') return;
  const wanted = dirty || sending !== null;
  if (wanted === unloadGuardOn) return;
  unloadGuardOn = wanted;
  if (wanted) window.addEventListener('beforeunload', handleBeforeUnload);
  else window.removeEventListener('beforeunload', handleBeforeUnload);
}

// Coming back to a tab: confirm an unload beacon, or load a changed copy
// (another device saved, or a backup was restored and the version went back)
// rather than discovering the conflict on the next edit.
async function syncOnVisible() {
  if (saving) return;
  if (!unconfirmedBeacon) {
    if (dirty) return;
    const { stateVersion: serverVersion } = await backend.health();
    if (!Number.isSafeInteger(serverVersion) || serverVersion === stateVersion || dirty) return;
  }
  reconcile(await backend.loadState());
}

export function handlePageVisible() {
  saveQueue = saveQueue.catch(() => {}).then(() => syncOnVisible().catch(() => {}));
  return saveQueue;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', handlePageHidden);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handlePageHidden();
    else handlePageVisible();
  });
}

// ---- Export / import ----
function countOf(value) {
  if (Array.isArray(value)) return value.length;
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

// The full stored document plus when it was exported and against which
// taxonomy. If changes could not be saved (for example the data is too large),
// the export is this tab's copy, flagged with unsavedChanges.
export async function exportDocument() {
  await flushSaves();
  let taxonomyVersion = null;
  try { taxonomyVersion = getData().meta.version; } catch { /* taxonomy not loaded */ }
  const meta = { exportedAt: new Date().toISOString(), taxonomyVersion };
  const doc = dirty
    ? { ...snapshotData(), version: stateVersion, ...meta, unsavedChanges: true }
    : { ...migrateDocument(await backend.loadState()), ...meta };
  // Never a plain PIN in the file, even one another device just saved (a
  // newer data format is exported as it is).
  if (!isUnwritableSchema(doc)) doc.settings = migratePinSettings(doc.settings);
  return doc;
}

// Checks an export (or a raw family-state.json) before import with the same
// rules the server applies to every save (document.js). Returns
// { ok, error?, learners: [{ name, topics, records, tests }], colorsAdjusted }
// for the preview.
// An imported file's dangling active learner is moved to its first learner.
function withValidActive(doc) {
  if (!Array.isArray(doc.students) || doc.activeStudentId == null) return doc;
  const active = activeOf(doc);
  return active === doc.activeStudentId ? doc : { ...doc, activeStudentId: active };
}

export function inspectImport(doc) {
  const fail = (error) => ({ ok: false, error, learners: [] });
  if (!isObject(doc)) return fail('The file is not a Harrington family export.');
  doc = withValidActive(doc);
  if (schemaVersionOf(doc) === null) return fail('The file\'s data format version is not a number.');
  if (isNewerSchema(doc)) {
    return fail(`The file comes from a newer version of Harrington (data format ${doc.schemaVersion}; this one reads up to ${SCHEMA_VERSION}). Update Harrington, then import it.`);
  }
  // An older export is checked as it will be saved: migrated, so what the
  // format 3 repair fixes on the server (a long name, say) imports the same.
  if (schemaVersionOf(doc) < SCHEMA_VERSION) doc = migrateDocument(doc);
  const { doc: stripped, dropped: picturesDropped } = stripUnknownPictures(doc);
  const problem = validateDocument(stripped);
  if (problem) return fail(problem);
  const learners = stripped.students.map(s => ({
    name: s.name,
    topics: countOf(stripped.progress?.[s.id]),
    records: countOf(stripped.records?.[s.id]),
    tests: countOf(stripped.tests?.[s.id]),
  }));
  // Learner colors that import will move to the nearest palette color.
  const colorsAdjusted = stripped.students.filter(s => paletteColor(s.color) !== s.color).length;
  return { ok: true, learners, colorsAdjusted, picturesDropped };
}

// Replaces the family document on the server with `doc`, guarded by the
// current version. Resolves false if another device saved first (state is
// then reloaded from the server) or the save failed.
export function importDocument(doc) {
  if (readOnly) return Promise.reject(new Error(readOnlyMessage()));
  const check = inspectImport(doc);
  if (!check.ok) return Promise.reject(new Error(check.error));
  const { doc: stripped } = stripUnknownPictures(migrateDocument(withValidActive(doc)));
  const { version: _v, updatedAt: _u, writeId: _w, exportedAt: _e, taxonomyVersion: _t, unsavedChanges: _c, ...data } = stripped;
  data.students = data.students.map(s => ({ ...s, color: paletteColor(s.color) }));
  // The topic finder's log: known learners only, newest first, capped.
  if (data.requests) data.requests = cleanRequestLogs(data.requests, data.students);
  // Step 1 -> 2 hashed an older export's plain PIN; this catches a hand edit.
  if (data.settings !== undefined) data.settings = migratePinSettings(objectOr(data.settings, {}));
  clearTimeout(saveTimer);
  saveTimer = null;
  dirty = false;
  syncUnloadGuard();
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const ok = await saveWith(() => data);
    if (ok) {
      applyDocument({ ...data, version: stateVersion });
      emit();
    }
    return ok;
  });
  return saveQueue;
}

export const READ_ONLY_MESSAGE = 'This family data was saved by a newer version of Harrington. Update Harrington to make changes; nothing is saved until then.';
export const UNREADABLE_FORMAT_MESSAGE = 'This family data has a data format number Harrington cannot read, so nothing is saved. Export a copy, then restore a backup or fix "schemaVersion" in the file.';

// ---- Students ----
export const PALETTE = ['#3f6b3b', '#a4473a', '#2f6285', '#5b4a86', '#8a6412', '#9a4a6e'];
// Colors end up in style attributes, so only palette colors are kept: a hex
// color outside the palette (an older palette, a hand edit) becomes the
// nearest palette color, and anything else the first one. inspectImport has
// already refused a color that is not a hex color.
const rgb = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
function paletteColor(color) {
  if (PALETTE.includes(color)) return color;
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return PALETTE[0];
  const [r, g, b] = rgb(color.toLowerCase());
  const distance = p => { const [pr, pg, pb] = rgb(p); return (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; };
  return PALETTE.reduce((best, p) => (distance(p) < distance(best) ? p : best));
}
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// A learner's curriculum setting as saved: { id: 'acara-v9', year } for a
// valid Australian Curriculum year, else null (no setting).
function curriculumSetting(value) {
  const year = value && value.id === CURRICULUM_ID ? normalizeYear(value.year) : null;
  return year ? { id: CURRICULUM_ID, year } : null;
}
export function addStudent(name, birthYear, birthMonth = null, { curriculum = null } = {}) {
  const id = 's_' + Math.random().toString(36).slice(2, 9);
  const color = PALETTE[state.students.length % PALETTE.length];
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const student = { id, name, birthYear, color, createdAt: Date.now(), startDate };
  if (validMonth(birthMonth)) student.birthMonth = birthMonth;
  const setting = curriculumSetting(curriculum);
  if (setting) student.curriculum = setting;
  state.students.push(student);
  state.progress[id] = state.progress[id] || {};
  state.records[id] = state.records[id] || [];
  state.activeStudentId = id;
  persist(); emit();
  return id;
}
// Only these fields can change, and each is checked so a bad value never
// reaches the saved document: an empty name, a year outside MIN_BIRTH_YEAR to
// this year, a month outside 1-12, a color outside the palette or a malformed
// start date is ignored. birthMonth null clears the month; curriculum null
// clears the Australian Curriculum year (back to the age-based order).
export function updateStudent(id, patch) {
  const s = state.students.find(s => s.id === id);
  if (!s) return false;
  const { name, birthYear, birthMonth, color, startDate, curriculum } = patch;
  const ageBefore = studentAge(s);
  const yearBefore = learnerYear(s);
  if (typeof name === 'string' && name.trim()) s.name = name.trim();
  if (validYear(birthYear)) s.birthYear = birthYear;
  if (birthMonth === null) delete s.birthMonth;
  else if (validMonth(birthMonth)) s.birthMonth = birthMonth;
  if (PALETTE.includes(color)) s.color = color;
  if (validDateKey(startDate)) s.startDate = startDate;
  if (curriculum === null) delete s.curriculum;
  else if (curriculumSetting(curriculum)) s.curriculum = curriculumSetting(curriculum);
  // Today's choices were filtered by the old age or year; rebuild them on next render.
  if (studentAge(s) !== ageBefore || learnerYear(s) !== yearBefore) forgetTodaysChoices(id);
  persist(); emit();
  return true;
}
export function removeStudent(id) {
  // Recordings are deleted only once the server accepts the removal, so a
  // conflict that brings the learner back does not lose their audio.
  for (const rec of state.records[id] || []) {
    if (rec && rec.audioPath) pendingAudioDeletes.push({ studentId: id, path: rec.audioPath });
  }
  state.students = state.students.filter(s => s.id !== id);
  for (const key of LEARNER_KEYS) delete state[key][id];
  if (state.activeStudentId === id) state.activeStudentId = state.students[0]?.id || null;
  emit();
  persist();
  flushSaves();
}
export function setActiveStudent(id) { state.activeStudentId = id; persist(); emit(); }
export function activeStudent() { return state.students.find(s => s.id === state.activeStudentId) || null; }

// Whole years completed. With a birth month the birthday counts from the
// first of that month; without one, the age is the calendar-year difference.
export function studentAge(s, now = new Date()) {
  if (!s || !s.birthYear) return null;
  const years = now.getFullYear() - s.birthYear;
  if (!validMonth(s.birthMonth)) return years;
  return now.getMonth() + 1 < s.birthMonth ? Math.max(0, years - 1) : years;
}

// ---- Progress / mastery ----
export function progressFor(studentId) { return state.progress[studentId] || {}; }
export function statusOf(studentId, topicId) {
  return (state.progress[studentId] && state.progress[studentId][topicId]?.status) || 'none';
}
// Setting the status a topic already has (a passed retake or refresher on a
// mastered topic) keeps its entry, so its source (e.g. placement) and the
// date it reached that status survive; the calendar plans around both.
export function setStatus(studentId, topicId, status) {
  const p = state.progress[studentId] = state.progress[studentId] || {};
  if (p[topicId]?.status !== status) p[topicId] = { status, updatedAt: Date.now() };
  markActivity(studentId);
  persist(); emit();
}
// Set many topics at once with a single persist + emit (one re-render).
// Marks activity inline rather than via markActivity(), which would persist and emit a second time.
// `meta` adds fields to each entry, e.g. { source: 'placement' }; a
// `meta.updatedAt` sets the timestamp so callers can record it beforehand,
// and `meta.activity: false` keeps an admin change from counting as a learning day.
export function setStatusBulk(studentId, topicIds, status, meta = {}) {
  if (!topicIds || !topicIds.length) return;
  const { activity = true, ...fields } = meta;
  const p = state.progress[studentId] = state.progress[studentId] || {};
  const now = fields.updatedAt || Date.now();
  // As in setStatus, a topic already at `status` keeps its entry (source and
  // date) unless the caller labels the change, as placement does.
  topicIds.forEach(id => {
    if (!fields.source && p[id]?.status === status) return;
    p[id] = { ...fields, status, updatedAt: now };
  });
  if (activity) activityOf(studentId)[dateKeyLocal(now)] = true;
  persist(); emit();
}

// ---- Placement (bulk-mark earlier topics mastered, with undo) ----
// A placement is a parent admin action, not learning: it does not mark the
// day active. It changes which topics are open, so today's daily choices
// (offers and picks) are dropped and rebuilt on the next render. A learner
// whose age changes (updateStudent) drops them the same way.
function forgetTodaysChoices(studentId) {
  const days = state.daily[studentId];
  if (days) delete days[dateKeyLocal(Date.now())];
}
// Writes one assessment record carrying the changed ids and their previous
// entries, then marks them mastered with a single persist + emit.
// `levelset` ({ lane, sheet }) marks a placement made by the level-set workbook.
export function applyPlacement(studentId, { topicIds, title, subject, domain = null, maxAge, levelset = null }) {
  if (!topicIds || !topicIds.length) return null;
  const p = state.progress[studentId] || {};
  const previous = {};
  topicIds.forEach(id => { previous[id] = p[id] ? { ...p[id] } : null; });
  // The record is complete before the single persist + emit below.
  const at = Date.now();
  const rec = {
    id: 'r_' + Math.random().toString(36).slice(2, 9), createdAt: at,
    type: 'assessment', title, note: '',
    placement: { subject, domain, maxAge, topicIds: [...topicIds], previous, at, undoneAt: null, ...(levelset ? { levelset } : {}) },
  };
  state.records[studentId] = state.records[studentId] || [];
  state.records[studentId].unshift(rec);
  forgetTodaysChoices(studentId);
  setStatusBulk(studentId, topicIds, 'mastered', { source: 'placement', updatedAt: at, activity: false });
  return rec;
}
// Revert exactly the ids a placement changed. Topics changed again since the
// placement are left alone. Returns { reverted, kept } or null.
export function undoPlacement(studentId, recordId) {
  const rec = (state.records[studentId] || []).find(r => r.id === recordId);
  if (!rec || !rec.placement || rec.placement.undoneAt) return null;
  const p = state.progress[studentId] = state.progress[studentId] || {};
  let reverted = 0, kept = 0;
  for (const id of rec.placement.topicIds) {
    const cur = p[id];
    if (!cur || cur.source !== 'placement' || cur.updatedAt !== rec.placement.at) { kept++; continue; }
    const prev = rec.placement.previous[id];
    if (prev) p[id] = { ...prev }; else delete p[id];
    reverted++;
  }
  rec.placement.undoneAt = Date.now();
  forgetTodaysChoices(studentId);
  persist(); emit();
  return { reverted, kept };
}

// ---- Level-set workbook (per learner and lane, resumable) ----
// A session is the workbook's own state (sheets, answers, sitting time); the
// mastery it marks goes through applyPlacement above so Records can undo it.
export function levelsetFor(studentId) {
  const v = state.levelset[studentId];
  return {
    lanes: v && v.lanes && typeof v.lanes === 'object' && !Array.isArray(v.lanes) ? v.lanes : {},
    observe: v && Array.isArray(v.observe) ? v.observe.filter(id => typeof id === 'string') : [],
    lane: v && typeof v.lane === 'string' ? v.lane : null, // the tab last open
  };
}
export function setLevelsetLane(studentId, lane) {
  const cur = levelsetFor(studentId);
  state.levelset[studentId] = { ...cur, lane };
  persist(); emit();
}
// A malformed stored session reads as none, so the route starts over
// instead of crashing.
export function levelsetSession(studentId, lane) {
  return normalizeSession(levelsetFor(studentId).lanes[lane]);
}
// `quiet` saves without re-rendering, for a click that updates its own row.
export function saveLevelsetSession(studentId, lane, session, { quiet = false } = {}) {
  const cur = levelsetFor(studentId);
  const lanes = { ...cur.lanes };
  if (session) lanes[lane] = session; else delete lanes[lane];
  state.levelset[studentId] = { ...cur, lanes };
  persist();
  if (!quiet) emit();
}
// Topics the parent was unsure about wait for an observation check on their
// topic page; saving one there takes it off the list (applyObservation).
export function queueObservation(studentId, topicIds, { quiet = false } = {}) {
  const cur = levelsetFor(studentId);
  const observe = [...cur.observe];
  for (const id of [].concat(topicIds || [])) if (id && !observe.includes(id)) observe.push(id);
  state.levelset[studentId] = { ...cur, observe };
  persist();
  if (!quiet) emit();
}
export function unqueueObservation(studentId, topicIds, { quiet = false } = {}) {
  const cur = levelsetFor(studentId);
  const drop = new Set([].concat(topicIds || []));
  state.levelset[studentId] = { ...cur, observe: cur.observe.filter(id => !drop.has(id)) };
  persist();
  if (!quiet) emit();
}

// ---- Records (notes / observations / questions) ----
export function recordsFor(studentId, topicId = null) {
  const list = state.records[studentId] || [];
  return topicId ? list.filter(r => r.topicId === topicId) : list;
}
export function recordingsFor(studentId, { sectionId = null, topicId = null } = {}) {
  const list = (state.records[studentId] || []).filter(r => r.type === 'recording');
  if (topicId) return list.filter(r => r.topicId === topicId);
  if (sectionId) return list.filter(r => r.sectionId === sectionId);
  return list;
}
export function addRecord(studentId, rec) {
  state.records[studentId] = state.records[studentId] || [];
  const full = { id: 'r_' + Math.random().toString(36).slice(2, 9), createdAt: Date.now(), ...rec };
  state.records[studentId].unshift(full);
  // Saved evidence counts as activity; written inline so this persists and emits once.
  activityOf(studentId)[dateKeyLocal(full.createdAt)] = true;
  persist(); emit();
  return full;
}
export function updateRecord(studentId, recId, patch) {
  const list = state.records[studentId] || [];
  const r = list.find(x => x.id === recId);
  if (r) Object.assign(r, patch);
  persist(); emit();
}
export function removeRecord(studentId, recId) {
  const rec = (state.records[studentId] || []).find(r => r.id === recId);
  if (rec && rec.audioPath) {
    backend.deleteAudio(rec.audioPath).catch(() => {});
  }
  state.records[studentId] = (state.records[studentId] || []).filter(r => r.id !== recId);
  persist(); emit();
}

// ---- Mastery tests ----
// A test result has: { scope: 'subject'|'section', subject, sectionId?, mode, score, total, pct, passed }
// A subject's observation checks, newest first. A topic check on a topic the
// taxonomy retired is kept in the data but not listed or counted.
export function observedChecks(studentId, subject) {
  return testsFor(studentId, subject)
    .filter(t => t.mode === 'observed' && (t.scope !== 'topic' || !t.topicId || isCurrentTopic(t.topicId)))
    .sort((a, b) => b.createdAt - a.createdAt);
}
export function testsFor(studentId, subject = null) {
  const list = state.tests[studentId] || [];
  return subject ? list.filter(t => t.subject === subject) : list;
}
export function lastTest(studentId, subject) {
  return (state.tests[studentId] || []).filter(t => (t.scope || 'subject') === 'subject' && t.subject === subject)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
export function lastSectionTest(studentId, sectionId) {
  return (state.tests[studentId] || []).filter(t => t.scope === 'section' && t.sectionId === sectionId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
export function sectionPassed(studentId, sectionId) {
  const t = lastSectionTest(studentId, sectionId);
  return !!(t && t.passed);
}
export function lastTopicTest(studentId, topicId) {
  return (state.tests[studentId] || []).filter(t => t.scope === 'topic' && t.topicId === topicId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
// True when any topic result (a quiz or an observation) for the topic passed.
export function topicTestPassed(studentId, topicId) {
  return (state.tests[studentId] || []).some(t => t.scope === 'topic' && t.topicId === topicId && t.passed);
}
export function addTestResult(studentId, result) {
  state.tests[studentId] = state.tests[studentId] || [];
  const full = { id: 't_' + Math.random().toString(36).slice(2, 9), createdAt: Date.now(), scope: 'subject', ...result };
  state.tests[studentId].unshift(full);
  markActivity(studentId);
  persist(); emit();
  return full;
}

// ---- Mastery by observation (non-AI) ----
// Saves an evidence checklist in one persist + emit: the test-shaped results
// (topic, plus any section or subject it completes), an assessment record
// for Records, and, on a full pass, the topic marked mastered exactly as a
// passed topic test does; today's picks stay, as they do for a quiz. A topic
// waiting in the level-set observation queue leaves it.
export function applyObservation(studentId, { results = [], record = null, masterTopicId = null }) {
  const at = Date.now();
  const tests = state.tests[studentId] = state.tests[studentId] || [];
  const saved = results.map((r, i) => ({ id: 't_' + Math.random().toString(36).slice(2, 9), createdAt: at + i, ...r }));
  // Newest first, as addTestResult does; the topic result stays first.
  tests.unshift(...[...saved].reverse());
  let rec = null;
  if (record) {
    rec = { id: 'r_' + Math.random().toString(36).slice(2, 9), createdAt: at, type: 'assessment', ...record };
    if (rec.observed && saved[0]) rec.observed = { ...rec.observed, testId: saved[0].id };
    state.records[studentId] = state.records[studentId] || [];
    state.records[studentId].unshift(rec);
  }
  if (masterTopicId) {
    const p = state.progress[studentId] = state.progress[studentId] || {};
    if (p[masterTopicId]?.status !== 'mastered') p[masterTopicId] = { status: 'mastered', updatedAt: at };
  }
  const topicId = results[0]?.topicId;
  const ls = levelsetFor(studentId);
  if (topicId && ls.observe.includes(topicId)) {
    state.levelset[studentId] = { ...ls, observe: ls.observe.filter(id => id !== topicId) };
  }
  activityOf(studentId)[dateKeyLocal(at)] = true;
  persist(); emit();
  return { tests: saved, record: rec };
}

// ---- Adaptive plan overrides (moves, completed days, extra practice items) ----
function planOf(studentId) {
  if (!state.plan[studentId]) state.plan[studentId] = { moves: {}, done: {}, extras: {} };
  const p = state.plan[studentId];
  p.moves = p.moves || {}; p.done = p.done || {}; p.extras = p.extras || {};
  return p;
}
export function planOverrides(studentId) { return planOf(studentId); }
// How many topics the parent moved by hand. A retired topic's move is kept
// (Records lists it) but is not part of the track, so it is not counted.
export function movedTopicCount(studentId) {
  return Object.keys(planOf(studentId).moves).filter(isCurrentTopic).length;
}
// Move a scheduled topic to a specific date (or clear with null).
export function moveTopic(studentId, topicId, dateKey) {
  const p = planOf(studentId);
  if (dateKey) p.moves[topicId] = dateKey; else delete p.moves[topicId];
  persist(); emit();
}
export function toggleDayDone(studentId, dateKey) {
  const p = planOf(studentId);
  if (p.done[dateKey]) delete p.done[dateKey]; else p.done[dateKey] = Date.now();
  persist(); emit();
}
export function isDayDone(studentId, dateKey) { return !!planOf(studentId).done[dateKey]; }
// The learner's catch-up pace ('catch-up-first' or 'mixed', see scheduler.js).
// Only the pace changes: done days, moves and extras stay as they are.
export function setCatchUpPace(studentId, pace) {
  const p = planOf(studentId);
  if (pace === 'mixed') p.pace = 'mixed'; else delete p.pace;
  persist(); emit();
}
// Extra practice items a parent adds to a day: {id, kind, topicId, topicName, subject, title}
export function addExtra(studentId, dateKey, item) {
  const p = planOf(studentId);
  p.extras[dateKey] = p.extras[dateKey] || [];
  p.extras[dateKey].push({ id: 'x_' + Math.random().toString(36).slice(2, 9), ...item });
  persist(); emit();
}
export function removeExtra(studentId, dateKey, itemId) {
  const p = planOf(studentId);
  p.extras[dateKey] = (p.extras[dateKey] || []).filter(x => x.id !== itemId);
  persist(); emit();
}
export function extrasOn(studentId, dateKey) { return planOf(studentId).extras[dateKey] || []; }
// Change where a learner's track starts; `clearMoves` also drops topics the
// parent moved by hand, so they follow the new track (a retired topic's move
// is kept: it is archived data, not part of the track). One persist + emit.
export function setStartDate(studentId, dateKey, { clearMoves = false } = {}) {
  const s = state.students.find(s => s.id === studentId);
  if (!s || !validDateKey(dateKey)) return;
  s.startDate = dateKey;
  if (clearMoves) {
    const p = planOf(studentId);
    p.moves = Object.fromEntries(Object.entries(p.moves).filter(([id]) => !isCurrentTopic(id)));
  }
  persist(); emit();
}

// ---- Challenge (timed "hard" quiz) results ----
export function addChallenge(studentId, result) {
  state.challenges[studentId] = state.challenges[studentId] || [];
  const full = { id: 'c_' + Math.random().toString(36).slice(2, 9), createdAt: Date.now(), ...result };
  state.challenges[studentId].unshift(full);
  markActivity(studentId);
  persist(); emit();
  return full;
}
export function challengesFor(studentId, topicId = null) {
  const list = state.challenges[studentId] || [];
  return topicId ? list.filter(c => c.topicId === topicId) : list;
}

// ---- Adaptations: difficulty level per (subject|domain) ----
function adaptationKey(subject, domain) { return `${subject}|${domain}`; }
export function adaptationLevel(studentId, subject, domain) {
  const a = (state.adaptations[studentId] || {})[adaptationKey(subject, domain)];
  return a ? a.level : 'standard';
}
export function setAdaptation(studentId, subject, domain, level) {
  state.adaptations[studentId] = state.adaptations[studentId] || {};
  if (level === 'standard') delete state.adaptations[studentId][adaptationKey(subject, domain)];
  else state.adaptations[studentId][adaptationKey(subject, domain)] = { level, since: Date.now() };
  persist(); emit();
}
export function allAdaptations(studentId) { return state.adaptations[studentId] || {}; }

// ---- Adaptive suggestions the parent can approve or dismiss ----
export function addSuggestion(studentId, sug) {
  state.suggestions[studentId] = state.suggestions[studentId] || [];
  // Avoid duplicate pending suggestions for the same subject/domain/kind.
  const dup = state.suggestions[studentId].some(s =>
    s.status === 'pending' && s.kind === sug.kind && s.subject === sug.subject && s.domain === sug.domain);
  if (dup) return null;
  const full = { id: 'g_' + Math.random().toString(36).slice(2, 9), status: 'pending', createdAt: Date.now(), ...sug };
  state.suggestions[studentId].unshift(full);
  persist(); emit();
  return full;
}
export function pendingSuggestions(studentId) {
  return (state.suggestions[studentId] || []).filter(s => s.status === 'pending');
}
export function resolveSuggestion(studentId, id, status) {
  const s = (state.suggestions[studentId] || []).find(x => x.id === id);
  if (s) s.status = status;
  persist(); emit();
}

// ---- Active recall / spaced repetition ----
// Leitner-style boxes with increasing intervals (days). Box 0 = new/relearning.
const RECALL_INTERVALS = [0, 1, 2, 4, 8, 16, 32];
// Card ids are `${topicId}::${n}`; older records may lack a topicId.
const recallTopicOf = (id, c) => c?.topicId || String(id).split('::')[0];
function recallOf(studentId) {
  if (!state.recall[studentId]) state.recall[studentId] = {};
  return state.recall[studentId];
}
function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
const DAY = 86400000;

// Ensure a scheduling record exists for a card; new cards are due immediately.
export function ensureRecallCard(studentId, cardId, topicId) {
  const r = recallOf(studentId);
  if (!r[cardId]) { r[cardId] = { topicId, box: 0, due: dayStart(Date.now()), reps: 0, lapses: 0, last: null }; persist({ automatic: true }); }
  // Repair records whose topicId was wiped by an earlier grading bug.
  else if (!r[cardId].topicId && topicId) { r[cardId].topicId = topicId; persist({ automatic: true }); }
  return r[cardId];
}
export function recallState(studentId, cardId) { return recallOf(studentId)[cardId] || null; }

// Grade a card: 'again' (forgot) drops to box 0; 'good' advances; 'easy' skips ahead.
export function gradeRecall(studentId, cardId, topicId, grade) {
  const r = recallOf(studentId);
  const c = r[cardId] || { topicId, box: 0, reps: 0, lapses: 0 };
  // Never replace a known topic with a missing one.
  if (topicId) c.topicId = topicId;
  if (grade === 'again') { c.box = 0; c.lapses = (c.lapses || 0) + 1; }
  else if (grade === 'good') { c.box = Math.min(RECALL_INTERVALS.length - 1, (c.box || 0) + 1); }
  else if (grade === 'easy') { c.box = Math.min(RECALL_INTERVALS.length - 1, (c.box || 0) + 2); }
  c.reps = (c.reps || 0) + 1;
  c.last = Date.now();
  const interval = RECALL_INTERVALS[c.box] || 1;
  c.due = dayStart(Date.now()) + interval * DAY;
  r[cardId] = c;
  markActivity(studentId);
  persist(); emit();
  return c;
}

// Cards due today (optionally filtered to a set of card ids / topic). A card
// of a retired topic keeps its schedule but is never due.
export function dueRecallCards(studentId, { cardIds = null, topicId = null } = {}) {
  const r = recallOf(studentId);
  const today = dayStart(Date.now());
  return Object.entries(r)
    .filter(([id, c]) => isObject(c) && c.due <= today && isCurrentTopic(recallTopicOf(id, c))
      && (!cardIds || cardIds.includes(id))
      && (!topicId || c.topicId === topicId))
    .map(([id, c]) => ({ id, ...c }));
}

// Cards due today, minus entries whose card is gone from a card set this
// session has already read. Topics not read yet are checked in the background
// (reconcileRecallDue), which prunes their orphans and emits if any were found.
export function recallDueCount(studentId) {
  const due = dueRecallCards(studentId);
  const live = due.filter(c => {
    const known = knownRecallIds(recallTopicOf(c.id, c));
    return !known || known.has(c.id);
  });
  reconcileRecallDue(studentId).catch(() => {});
  return live.length;
}
// A regenerated card set replaces a topic's cards for every learner. Card ids
// are positional, so old scheduling state would attach to different questions
// (or to cards that no longer exist); drop it and start the new set fresh.
export function resetRecallTopic(topicId) {
  let changed = false;
  for (const r of Object.values(state.recall || {})) {
    for (const [id, c] of Object.entries(r || {})) {
      if ((c?.topicId || String(id).split('::')[0]) === topicId) { delete r[id]; changed = true; }
    }
  }
  if (changed) { persist(); emit(); }
}
// Removes a learner's scheduling records for cards that no longer exist.
// `save: false` leaves saving to the caller.
export function dropRecallCards(studentId, cardIds, { save = true } = {}) {
  const r = recallOf(studentId);
  const gone = cardIds.filter(id => id in r);
  gone.forEach(id => { delete r[id]; });
  if (gone.length && save) { persist(); emit(); }
  return gone.length;
}
// The one place orphans are found: a learner's records for `topicId` whose
// card is not in `cards` (the topic's current, validated card set) are dropped.
// Used by "Due today" and by the due count. Returns how many were dropped.
export function dropOrphanRecall(studentId, topicId, cards, { save = true } = {}) {
  const known = new Set(cards.map(c => c.id));
  const gone = Object.entries(recallOf(studentId))
    .filter(([id, c]) => recallTopicOf(id, c) === topicId && !known.has(id))
    .map(([id]) => id);
  return dropRecallCards(studentId, gone, { save });
}

// ---- Spaced practice for missed mastery-test questions ----
// Extends the same expanding-interval ladder to problem-solving, not just facts.
// Unlike recall cards (stable per-topic content, cached and reusable), a test
// question is AI-generated per attempt and can't be regenerated identically —
// so the question content itself is stored on the queued item.
function practiceOf(studentId) {
  if (!state.practice[studentId]) state.practice[studentId] = {};
  return state.practice[studentId];
}

// Queue a missed question for spaced retry. Skips duplicates for the same
// topic + question text so retaking a test doesn't pile up repeats.
export function enqueuePracticeItem(studentId, item) {
  const p = practiceOf(studentId);
  const dup = Object.values(p).some(x => x.topicId === item.topicId && x.q === item.q);
  if (dup) return null;
  const id = 'p_' + Math.random().toString(36).slice(2, 9);
  p[id] = { ...item, box: 0, due: dayStart(Date.now()), reps: 0, lapses: 0, last: null, createdAt: Date.now() };
  persist(); emit();
  return p[id];
}

// Grade a retry: correct advances the interval; incorrect resets to box 0.
// A question graduates out of the queue once answered correctly at the top
// of the ladder — durable retention has been demonstrated, so it retires.
export function gradePracticeItem(studentId, itemId, correct) {
  const p = practiceOf(studentId);
  const item = p[itemId];
  if (!item) return null;
  item.reps = (item.reps || 0) + 1;
  item.last = Date.now();
  if (correct) {
    const nextBox = (item.box || 0) + 1;
    if (nextBox >= RECALL_INTERVALS.length) { delete p[itemId]; markActivity(studentId); persist(); emit(); return null; }
    item.box = nextBox;
  } else {
    item.box = 0;
    item.lapses = (item.lapses || 0) + 1;
  }
  item.due = dayStart(Date.now()) + (RECALL_INTERVALS[item.box] || 1) * DAY;
  markActivity(studentId);
  persist(); emit();
  return item;
}

export function duePracticeItems(studentId) {
  const p = practiceOf(studentId);
  const today = dayStart(Date.now());
  return Object.entries(p)
    .filter(([, c]) => isObject(c) && c.due <= today && (!c.topicId || isCurrentTopic(c.topicId)))
    .map(([id, c]) => ({ id, ...c }));
}
// One topic's queued retries, soonest first, each with `isDue`: the set behind
// a parent's "Extra practice · <topic>" on the calendar.
export function topicPracticeItems(studentId, topicId) {
  const today = dayStart(Date.now());
  return Object.entries(practiceOf(studentId))
    .filter(([, c]) => c.topicId === topicId)
    .map(([id, c]) => ({ id, ...c, isDue: c.due <= today }))
    .sort((a, b) => (a.due || 0) - (b.due || 0));
}
export function practiceDueCount(studentId) {
  return duePracticeItems(studentId).length;
}

// ---- Activity streak ----
function activityOf(studentId) {
  if (!state.activity[studentId]) state.activity[studentId] = {};
  return state.activity[studentId];
}
function dateKeyLocal(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Record that the student did something today (recall, a lesson test, mastery, etc.).
function markActivity(studentId) {
  if (!studentId) return;
  const a = activityOf(studentId);
  const k = dateKeyLocal(Date.now());
  if (!a[k]) { a[k] = true; persist(); emit(); }
}
// Consecutive-day streak counting back from today (or yesterday, so a day isn't
// "lost" until it's fully missed).
export function activityStreak(studentId) {
  const a = state.activity[studentId] || {};
  let streak = 0;
  const cur = new Date(); cur.setHours(0, 0, 0, 0);
  // If today isn't done yet but yesterday was, start counting from yesterday.
  if (!a[dateKeyLocal(cur.getTime())]) cur.setDate(cur.getDate() - 1);
  while (a[dateKeyLocal(cur.getTime())]) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}
// ---- Daily pick-one choices (literacy / numeracy) ----
const DAILY_KEEP_DAYS = 14;
export function dailyFor(studentId, dateKey) {
  return (state.daily[studentId] || {})[dateKey] || null;
}
// Remember the day's offers once, so the choice doesn't shift during the day.
export function saveDailyOffers(studentId, dateKey, offers) {
  const days = state.daily[studentId] || (state.daily[studentId] = {});
  days[dateKey] = { offers, picks: (days[dateKey] && days[dateKey].picks) || {} };
  for (const key of Object.keys(days).sort().slice(0, -DAILY_KEEP_DAYS)) delete days[key];
  persist({ automatic: true });
}
// Choose (or clear, with null) the pick for one lane on one day.
export function pickDaily(studentId, dateKey, lane, topicId) {
  const day = dailyFor(studentId, dateKey);
  if (!day) return;
  day.picks = day.picks || {};
  day.picks[lane] = topicId || null;
  persist(); emit();
}

// ---- Interests (what the learner is into) ----
export const INTEREST_CHIPS_MAX = 12;
const INTEREST_CHIP_LEN = 40;
const INTEREST_TEXT_LEN = 500;
// Tolerates anything an import or an older document might hold (null, arrays,
// non-string values), so the dashboard never trips over a bad entry.
function cleanInterests(value) {
  const { chips, text } = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const seen = new Set();
  const list = [];
  for (const raw of Array.isArray(chips) ? chips : []) {
    if (typeof raw !== 'string') continue;
    const chip = raw.trim().replace(/\s+/g, ' ').slice(0, INTEREST_CHIP_LEN);
    if (!chip || seen.has(chip.toLowerCase())) continue;
    seen.add(chip.toLowerCase());
    list.push(chip);
    if (list.length >= INTEREST_CHIPS_MAX) break;
  }
  return { chips: list, text: typeof text === 'string' ? text.trim().slice(0, INTEREST_TEXT_LEN) : '' };
}
// Always { chips, text }; a copy, so callers can't mutate state by accident.
export function interestsFor(studentId) {
  return cleanInterests(state.interests[studentId]);
}
// quiet: save without re-rendering, for the card's own free-text edits (a
// re-render mid-typing would drop focus and swallow the next tap).
export function setInterests(studentId, interests, { quiet = false } = {}) {
  state.interests[studentId] = cleanInterests(interests);
  persist();
  if (!quiet) emit();
  return interestsFor(studentId);
}

// ---- Reading setup and book library (HAR-45) ----
// Always the complete setup (phonics/reading.js normalizeReading), a copy.
export function readingFor(studentId) {
  return normalizeReading(state.reading[studentId]);
}
// `patch` replaces the fields it names. quiet: save without re-rendering, for
// a tick that updates its own row.
export function setReading(studentId, patch, { quiet = false } = {}) {
  state.reading[studentId] = normalizeReading({ ...readingFor(studentId), ...patch });
  persist();
  if (!quiet) emit();
  return readingFor(studentId);
}
// Saves a copy of a book (bank or made) to the learner's library, newest
// first. Returns the entry, or null when the library is full.
export function saveBookToLibrary(studentId, book, { now = Date.now() } = {}) {
  const cur = readingFor(studentId);
  if (cur.library.length >= LIBRARY_MAX) return null;
  const entry = { id: `book_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`, savedAt: now, book: JSON.parse(JSON.stringify(book)) };
  setReading(studentId, { library: [entry, ...cur.library] });
  return entry;
}
export function removeFromLibrary(studentId, entryId) {
  const cur = readingFor(studentId);
  setReading(studentId, { library: cur.library.filter(e => e.id !== entryId) });
}

// ---- Topic requests (what the parent asked the topic finder) ----
export const REQUEST_LOG_MAX = 50;
export const REQUEST_TEXT_LEN = REQUEST_TEXT_MAX;
// Keeps well-formed entries only, newest first, capped; tolerates anything an
// import or an older document might hold.
function cleanRequests(value) {
  const seen = new Set();
  const list = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || seen.has(raw.id)) continue;
    const text = typeof raw.text === 'string' ? raw.text.trim().replace(/\s+/g, ' ').slice(0, REQUEST_TEXT_LEN) : '';
    if (!text || !Number.isFinite(raw.createdAt)) continue;
    seen.add(raw.id);
    list.push({ id: raw.id, text, createdAt: raw.createdAt, topicId: typeof raw.topicId === 'string' && raw.topicId ? raw.topicId : null });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, REQUEST_LOG_MAX);
}
// On import: every known learner's log cleaned, unknown learners dropped.
function cleanRequestLogs(logs, students) {
  const out = {};
  if (!logs || typeof logs !== 'object' || Array.isArray(logs)) return out;
  for (const s of students) {
    if (Object.prototype.hasOwnProperty.call(logs, s.id)) {
      const list = cleanRequests(logs[s.id]);
      if (list.length) out[s.id] = list;
    }
  }
  return out;
}
// A copy, newest first.
export function requestsFor(studentId) {
  return cleanRequests(state.requests[studentId]);
}
// Logs a request; returns the new entry, or null for empty text.
export function logRequest(studentId, text, topicId = null) {
  const entry = { id: 'rq_' + Math.random().toString(36).slice(2, 10), text: String(text || ''), createdAt: Date.now(), topicId };
  const list = cleanRequests([entry, ...cleanRequests(state.requests[studentId])]);
  if (!list.some(r => r.id === entry.id)) return null;
  state.requests[studentId] = list;
  persist(); emit();
  return list.find(r => r.id === entry.id);
}
// Records which topic the parent chose for a logged request.
export function setRequestTopic(studentId, requestId, topicId) {
  const list = cleanRequests(state.requests[studentId]);
  const entry = list.find(r => r.id === requestId);
  if (!entry || entry.topicId === topicId) return false;
  entry.topicId = topicId || null;
  state.requests[studentId] = list;
  persist(); emit();
  return true;
}

// Whether the student was active on each of the last `days` days, oldest first.
export function recentActivityDays(studentId, days = 7) {
  const a = state.activity[studentId] || {};
  const cur = new Date(); cur.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cur); d.setDate(cur.getDate() - i);
    out.push({ date: d, active: !!a[dateKeyLocal(d.getTime())] });
  }
  return out;
}
export function activeToday(studentId) {
  const a = state.activity[studentId] || {};
  return !!a[dateKeyLocal(Date.now())];
}

// ---- Gamification: XP, levels, badges ----
// Reads never write: a render that only looks at XP or badges must not
// leave a change behind (it would show as lost in a save conflict).
function readGame(studentId) {
  const g = state.game[studentId] || {};
  return { xp: g.xp || 0, badges: g.badges || {} };
}
function gameOf(studentId) {
  if (!state.game[studentId]) state.game[studentId] = { xp: 0, badges: {} };
  const g = state.game[studentId];
  g.xp = g.xp || 0; g.badges = g.badges || {};
  return g;
}
// Level curve: level N needs a growing amount of XP (gentle early on).
function levelForXp(xp) {
  let level = 1, need = 100, total = 0;
  while (xp >= total + need) { total += need; level++; need = Math.round(need * 1.35); }
  return { level, into: xp - total, need, floor: total };
}
export function gameState(studentId) {
  const g = readGame(studentId);
  const lv = levelForXp(g.xp);
  return { xp: g.xp, badges: g.badges, ...lv, pct: Math.round((lv.into / lv.need) * 100) };
}
export function awardXp(studentId, amount) {
  if (!studentId || !amount) return null;
  const g = gameOf(studentId);
  const before = levelForXp(g.xp).level;
  g.xp += amount;
  const after = levelForXp(g.xp).level;
  persist(); emit();
  return { amount, leveledUp: after > before, level: after };
}
export function hasBadge(studentId, badgeId) { return !!readGame(studentId).badges[badgeId]; }
export function grantBadge(studentId, badgeId) {
  const g = gameOf(studentId);
  if (g.badges[badgeId]) return false;
  g.badges[badgeId] = Date.now();
  persist(); emit();
  return true;
}
export function earnedBadges(studentId) { return readGame(studentId).badges; }

// ---- Notification bell (family-wide; items are computed in alerts.js) ----
// True when the family saw the old first-run welcome, so the bell skips its own.
// A repair notice (below) is not that log, so it never hides the welcome.
export function welcomed() { return state.notifications.some(n => !isRepairNotice(n)); }
// What the data format 3 repair changed, for the bell (alerts.js repairNotices).
const isRepairNotice = n => isObject(n) && n.type === 'repair' && typeof n.id === 'string';
export function repairNotices() { return state.notifications.filter(isRepairNotice); }
export function dismissedAlerts() { return state.dismissedAlerts; }
// Records a dismissal for each key. Expired snoozes and past days' picks are
// dropped so the map stays small; permanent dismissals are kept.
export function dismissAlerts(keys, now = Date.now()) {
  const next = pruneDismissed(state.dismissedAlerts, now);
  keys.forEach(key => { next[key] = now; });
  state.dismissedAlerts = next;
  persist(); emit();
}

export function graphView() {
  return state.graphView === 'list' ? 'list' : 'atlas';
}
export function setGraphView(mode) {
  const next = mode === 'list' ? 'list' : 'atlas';
  if (state.graphView === next) return;
  state.graphView = next;
  persist();
  emit();
}

// ---- Child view ----
// While the child view is open, celebrations stay silent and tests and
// challenges render without scores. Not persisted: a reload always returns to
// the grown-up view, which is also the "forgot the PIN" path.
let childViewOpen = false;
export function isChildViewOpen() { return childViewOpen; }
export function setChildViewOpen(open) { childViewOpen = !!open; }

// A four-digit PIN that keeps the child view from closing with one tap. A
// family-device convenience, not authentication; only a salted hash is kept
// (pin.js).
export function hasParentPin() { return hasPin(state.settings); }
export function checkParentPin(pin) { return verifyPin(pin, state.settings); }
export function setParentPin(pin) {
  if (!PIN_PATTERN.test(String(pin))) return false;
  state.settings = pinSettings(state.settings, pin);
  persist();
  return true;
}

// Family calendar: home days of the week (Date#getDay numbers) and break
// ranges. Anything malformed is dropped or repaired; no home days at all
// falls back to Mon–Fri. Returns { homeDays: [0-6, …], breaks: [{ start, end, label }, …] }.
const DEFAULT_HOME_DAYS = [1, 2, 3, 4, 5];
export function normalizeCalendar(raw) {
  const cal = objectOr(raw, {});
  let homeDays = Array.isArray(cal.homeDays)
    ? [...new Set(cal.homeDays.map(n => (typeof n === 'string' && n.trim() !== '' ? Number(n) : n))
      .filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
    : [];
  if (!homeDays.length) homeDays = [...DEFAULT_HOME_DAYS];
  const breaks = (Array.isArray(cal.breaks) ? cal.breaks : [])
    .filter(b => b && realDateKey(b.start) && realDateKey(b.end))
    .map(b => {
      const [start, end] = b.start <= b.end ? [b.start, b.end] : [b.end, b.start];
      return { start, end, label: typeof b.label === 'string' ? b.label.trim().slice(0, 60) : '' };
    })
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { homeDays, breaks };
}
// The stored settings, or null until the family sets them.
export function calendarSettings() {
  return objectOr(state.settings?.calendar, null);
}
export function setCalendarSettings(calendar) {
  state.settings = { ...state.settings, calendar: normalizeCalendar(calendar) };
  persist(); emit();
}

// ---- Lesson cache (shared by this family) ----
// Lessons are reusable teaching material keyed by topic/activity. Each key
// prefix names a kind with a minimal shape; nothing that fails it is cached.
// Each kind is also the name of the AI capability that writes it.
const CACHE_KINDS = { 'topic:': 'lesson', 'print:': 'printables', 'act:': 'activity', 'recall:': 'recall' };
const lessonCache = new Map();
const existsMemo = new Map(); // key -> Promise<boolean>, for the no-provider "Open" upgrade
const inflight = new Map();   // key -> Promise of a generation in progress
const unsaved = new Set();    // keys generated this session that the server did not store
const recallChecked = new Map(); // topicId -> Promise, one cache read per session for the due count

export function cacheKind(key) {
  const prefix = Object.keys(CACHE_KINDS).find(p => String(key).startsWith(p));
  return prefix ? CACHE_KINDS[prefix] : null;
}

const text = (v) => typeof v === 'string' && v.trim() !== '';
const hasContent = (v) => text(v) || (Array.isArray(v) ? v.some(hasContent)
  : !!v && typeof v === 'object' && Object.values(v).some(hasContent));

// Recall cards used to be saved as a bare array, which the server rejects;
// they are stored as { cards } now and old arrays still read.
export function normalizeCached(kind, value) {
  if (kind === 'recall' && Array.isArray(value)) return { cards: value };
  return value;
}

// Optional list fields must be arrays when present; the renderers map over them.
const listsOrAbsent = (v, keys) => keys.every(k => v[k] == null || Array.isArray(v[k]));

export function isValidCached(kind, value) {
  const v = normalizeCached(kind, value);
  if (!isObject(v)) return false;
  switch (kind) {
    case 'lesson':
      return text(v.objective) && Array.isArray(v.teach) && v.teach.some(s => isObject(s) && hasContent(s))
        && listsOrAbsent(v, ['materials', 'guidedPractice', 'questions', 'commonMistakes'])
        && (v.parentTips == null || isObject(v.parentTips))
        && (v.independentActivity == null || (isObject(v.independentActivity) && listsOrAbsent(v.independentActivity, ['steps'])));
    case 'printables': return Array.isArray(v.printables) && v.printables.some(p => isObject(p) && isObject(p.content) && hasContent(p.content));
    case 'activity': return Array.isArray(v.steps) && v.steps.some(hasContent) && listsOrAbsent(v, ['materials']);
    case 'recall': return Array.isArray(v.cards) && v.cards.some(isValidRecallCard);
    default: return true;
  }
}

// One recall card as the session renders it: an id to schedule, a front and a
// back, and an optional text hint.
function isValidRecallCard(c) {
  return isObject(c) && text(c.id) && text(c.front) && text(c.back) && (c.hint == null || typeof c.hint === 'string');
}

// The usable cards of a recall cache value, how many malformed ones were left
// out, and the ids of those that still carry one.
export function recallCardsOf(value) {
  const list = normalizeCached('recall', value)?.cards;
  const all = Array.isArray(list) ? list : [];
  const cards = all.filter(isValidRecallCard);
  const droppedIds = all.filter(c => !isValidRecallCard(c) && text(c?.id)).map(c => c.id);
  return { cards, dropped: all.length - cards.length, droppedIds };
}

// Ids of a topic's card set when this session has read it, otherwise null.
function knownRecallIds(topicId) {
  const value = lessonCache.get('recall:' + topicId);
  return value ? new Set(recallCardsOf(value).cards.map(c => c.id)) : null;
}

// Reads each due topic's card set once per session (never generating) and
// drops orphaned schedule entries. Resolves to how many were dropped.
// The prune is a repair that loading makes, so it is saved like a migration
// (saveIfMigrated): once, right away, and a conflict with a tab that saved
// first reloads silently (the reloaded document is repaired again). A
// read-only store is never repaired.
async function reconcileRecallDue(studentId) {
  // A newer document is never written, so it is not repaired either.
  if (readOnly) return 0;
  const topics = new Set(dueRecallCards(studentId).map(c => recallTopicOf(c.id, c)));
  let dropped = 0;
  for (const topicId of topics) {
    if (!recallChecked.has(topicId)) recallChecked.set(topicId, getCachedLesson('recall:' + topicId));
    await recallChecked.get(topicId);
    // Read the live value: a regenerate may have replaced it since.
    const value = lessonCache.get('recall:' + topicId);
    // Checked again after the read: the store may have gone read-only meanwhile.
    if (value && !readOnly) dropped += dropOrphanRecall(studentId, topicId, recallCardsOf(value).cards, { save: false });
  }
  if (dropped) { saveIfMigrated(true); emit(); }
  return dropped;
}

export function invalidResult() {
  // Reads as a provider failure in explainAiError.
  return new Error('The AI provider returned an invalid response');
}

// The cached value for `id`, or null when missing or no longer a valid shape.
export async function getCachedLesson(id) {
  const kind = cacheKind(id);
  if (lessonCache.has(id)) return lessonCache.get(id);
  try {
    const data = normalizeCached(kind, await backend.loadLesson(id));
    if (data && isValidCached(kind, data)) {
      lessonCache.set(id, data);
      existsMemo.set(id, Promise.resolve(true));
      return data;
    }
  } catch {}
  return null;
}

// Returns false, and keeps the previous value, when `data` fails its kind's
// shape or the server does not store it.
export async function saveCachedLesson(id, data) {
  const kind = cacheKind(id);
  const value = normalizeCached(kind, data);
  if (!isValidCached(kind, value)) return false;
  try { await backend.saveLesson(id, value); }
  catch (e) { console.warn('Could not save to the lesson cache', e); return false; }
  lessonCache.set(id, value);
  existsMemo.set(id, Promise.resolve(true));
  unsaved.delete(id);
  return true;
}

// Whether `id` was generated this session but the server did not store it.
export function isUnsavedCached(id) { return unsaved.has(id); }

// Tries again to store a generated value the server refused. No AI call.
// Concurrent retries for one key share a single save.
const retrying = new Map(); // key -> Promise<boolean>
export function retrySaveCached(id) {
  if (!unsaved.has(id)) return Promise.resolve(true);
  if (!retrying.has(id)) {
    const save = saveCachedLesson(id, lessonCache.get(id));
    retrying.set(id, save);
    save.finally(() => retrying.delete(id)).catch(() => {});
  }
  return retrying.get(id);
}

// Saved entries under the given prefixes, newest first, that pass their
// kind's validator (each is read once and kept for this session, so opening
// it makes no further request). At most `limit`; [] when the listing fails.
export async function savedLessons(prefixes, limit = 8) {
  let listed;
  // A few more than `limit`, since entries that fail their validator are skipped.
  try { listed = (await Promise.all(prefixes.map(p => backend.listLessons(p, limit * 3)))).flat(); }
  catch { return []; }
  listed = listed.filter(e => typeof e?.key === 'string' && prefixes.some(p => e.key.startsWith(p)));
  listed.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const valid = [];
  for (const entry of listed) {
    if (valid.length >= limit) break;
    if (await hasCachedLesson(entry.key)) valid.push({ key: entry.key, savedAt: entry.savedAt });
  }
  return valid;
}

// Test-only: drops this tab's copies, as a fresh session would start.
export function forgetCachedLessons() {
  lessonCache.clear();
  existsMemo.clear();
  unsaved.clear();
  recallChecked.clear();
}

// Whether a valid cached value exists, memoized for the session. Only a
// definite answer is remembered; a failed request is tried again next time.
export function hasCachedLesson(id) {
  if (existsMemo.has(id)) return existsMemo.get(id);
  const kind = cacheKind(id);
  const check = (async () => {
    if (lessonCache.has(id)) return true;
    try {
      const data = normalizeCached(kind, await backend.loadLesson(id));
      if (data && isValidCached(kind, data)) { lessonCache.set(id, data); return true; }
      return false;
    } catch {
      existsMemo.delete(id);
      return false;
    }
  })();
  existsMemo.set(id, check);
  return check;
}

// The cached value, or a freshly generated one that is validated and saved.
// `force` skips the cache (regenerate). `accept(fresh)` runs before saving
// (views pass a trial render) and a throw there leaves the cache untouched.
// Concurrent calls for one key share a single generation. Without a provider
// a cache miss rejects as "not configured"; each cache kind is also the
// capability it needs, and a miss for one not switched on rejects as such.
// When the server will not store a first generation, the result is still
// returned and kept for this session (isUnsavedCached, retrySaveCached), so it
// is never paid for twice; a regenerate that cannot be stored rejects and the
// previous version stays.
export function generateCached(id, generate, { force = false, accept = null } = {}) {
  if (inflight.has(id)) return inflight.get(id);
  const kind = cacheKind(id);
  const run = (async () => {
    if (!force) {
      const cached = await getCachedLesson(id);
      if (cached) return cached;
    }
    if (!aiConfigured) throw new Error('AI is not configured');
    if (kind && !aiAvailable(kind)) throw Object.assign(new Error(capabilityOffMessage(kind)), { capability: kind });
    const fresh = normalizeCached(kind, await generate());
    if (!isValidCached(kind, fresh)) throw invalidResult();
    if (accept) {
      try { accept(fresh); } catch (e) { console.error(e); throw invalidResult(); }
    }
    if (!(await saveCachedLesson(id, fresh))) {
      if (force) throw new Error('Harrington could not save the result');
      lessonCache.set(id, fresh);
      unsaved.add(id);
    }
    return fresh;
  })();
  inflight.set(id, run);
  run.then(() => inflight.delete(id), () => inflight.delete(id));
  return run;
}

