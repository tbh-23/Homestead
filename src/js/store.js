// App state + persistence. Auth and data via Puter (scoped to the signed-in parent).

const KEY = 'homestead:v1';

export const MASTERY = {
  none:       { label: 'Not started', rank: 0, color: '#c9c3b8' },
  learning:   { label: 'Learning',    rank: 1, color: '#d99b45' },
  practicing: { label: 'Practicing',  rank: 2, color: '#3d6b93' },
  mastered:   { label: 'Mastered',    rank: 3, color: '#3f7d5e' },
};

const listeners = new Set();
let state = {
  user: null,
  students: [],       // {id, name, birthYear, avatar, color}
  activeStudentId: null,
  progress: {},       // studentId -> { topicId -> { status, updatedAt } }
  records: {},        // studentId -> [ {id, topicId, type, title, note, rating, questions, createdAt} ]
  tests: {},          // studentId -> [ {id, subject, mode, score, total, pct, passed, createdAt} ]
  plan: {},           // studentId -> { moves:{topicId:dateKey}, done:{dateKey:true}, extras:{dateKey:[items]} }
  challenges: {},     // studentId -> [ {id, topicId, subject, domain, correct, total, seconds, createdAt} ]
  adaptations: {},    // studentId -> { 'Subject|Domain': { level:'advanced', since } }
  suggestions: {},    // studentId -> [ {id, kind, subject, domain, reason, status, createdAt} ]
  notifications: [],  // account-wide: [ {id, type, title, body, meta, read, createdAt} ]
  curriculumSnapshot: null, // {version, generatedAt, topicIds:[...], count}
  recall: {},         // studentId -> { cardId -> { topicId, box, due, reps, lapses, last } }
  practice: {},       // studentId -> { itemId -> { topicId, subject, q, type, options, answer, box, due, reps, lapses, last } }
  activity: {},       // studentId -> { 'yyyy-mm-dd': true }  (days with recall/lesson/mastery activity)
  game: {},           // studentId -> { xp, badges: {badgeId: ts} }
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => fn(state)); }
export function get() { return state; }

// ---- Auth ----
export async function refreshAuth() {
  try {
    if (puter.auth.isSignedIn()) {
      state.user = await puter.auth.getUser();
    } else {
      state.user = null;
    }
  } catch { state.user = null; }
  return state.user;
}

export async function signIn() {
  await puter.auth.signIn();
  await refreshAuth();
  await loadAll();
  emit();
}

export async function signOut() {
  try { await puter.auth.signOut(); } catch {}
  state.user = null;
  state.students = [];
  state.activeStudentId = null;
  state.progress = {};
  state.records = {};
  state.tests = {};
  state.plan = {};
  state.challenges = {};
  state.adaptations = {};
  state.suggestions = {};
  state.notifications = [];
  state.curriculumSnapshot = null;
  state.recall = {};
  state.practice = {};
  state.activity = {};
  state.game = {};
  emit();
}

// ---- Persistence ----
export async function loadAll() {
  if (!state.user) return;
  try {
    const raw = await puter.kv.get(KEY);
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      state.students = data.students || [];
      state.activeStudentId = data.activeStudentId || (state.students[0] && state.students[0].id) || null;
      state.progress = data.progress || {};
      state.records = data.records || {};
      state.tests = data.tests || {};
      state.plan = data.plan || {};
      state.challenges = data.challenges || {};
      state.adaptations = data.adaptations || {};
      state.suggestions = data.suggestions || {};
      state.notifications = data.notifications || [];
      state.curriculumSnapshot = data.curriculumSnapshot || null;
      state.recall = data.recall || {};
      state.practice = data.practice || {};
      state.activity = data.activity || {};
      state.game = data.game || {};
    }
  } catch (e) { console.warn('load failed', e); }
}

let saveTimer = null;
export function persist() {
  if (!state.user) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await puter.kv.set(KEY, JSON.stringify({
        students: state.students,
        activeStudentId: state.activeStudentId,
        progress: state.progress,
        records: state.records,
        tests: state.tests,
        plan: state.plan,
        challenges: state.challenges,
        adaptations: state.adaptations,
        suggestions: state.suggestions,
        notifications: state.notifications,
        curriculumSnapshot: state.curriculumSnapshot,
        recall: state.recall,
        practice: state.practice,
        activity: state.activity,
        game: state.game,
      }));
    } catch (e) { console.warn('save failed', e); }
  }, 400);
}

// ---- Students ----
const PALETTE = ['#3f7d5e', '#b0603a', '#3d6b93', '#7a5a9e', '#c08a2e', '#a3486b'];
export function addStudent(name, birthYear) {
  const id = 's_' + Math.random().toString(36).slice(2, 9);
  const color = PALETTE[state.students.length % PALETTE.length];
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  state.students.push({ id, name, birthYear, color, createdAt: Date.now(), startDate });
  state.progress[id] = state.progress[id] || {};
  state.records[id] = state.records[id] || [];
  state.activeStudentId = id;
  persist(); emit();
  return id;
}
export function updateStudent(id, patch) {
  const s = state.students.find(s => s.id === id);
  if (s) Object.assign(s, patch);
  persist(); emit();
}
export function removeStudent(id) {
  state.students = state.students.filter(s => s.id !== id);
  delete state.progress[id]; delete state.records[id];
  if (state.activeStudentId === id) state.activeStudentId = state.students[0]?.id || null;
  persist(); emit();
}
export function setActiveStudent(id) { state.activeStudentId = id; persist(); emit(); }
export function activeStudent() { return state.students.find(s => s.id === state.activeStudentId) || null; }

export function studentAge(s) {
  if (!s || !s.birthYear) return null;
  return new Date().getFullYear() - s.birthYear;
}

// ---- Progress / mastery ----
export function progressFor(studentId) { return state.progress[studentId] || {}; }
export function statusOf(studentId, topicId) {
  return (state.progress[studentId] && state.progress[studentId][topicId]?.status) || 'none';
}
export function setStatus(studentId, topicId, status) {
  state.progress[studentId] = state.progress[studentId] || {};
  state.progress[studentId][topicId] = { status, updatedAt: Date.now() };
  markActivity(studentId);
  persist(); emit();
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
    puter.fs.delete(rec.audioPath).catch(() => {});
  }
  state.records[studentId] = (state.records[studentId] || []).filter(r => r.id !== recId);
  persist(); emit();
}

// ---- Mastery tests ----
// A test result has: { scope: 'subject'|'section', subject, sectionId?, mode, score, total, pct, passed }
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
export function topicTestPassed(studentId, topicId) {
  const t = lastTopicTest(studentId, topicId);
  return !!(t && t.passed);
}
export function addTestResult(studentId, result) {
  state.tests[studentId] = state.tests[studentId] || [];
  const full = { id: 't_' + Math.random().toString(36).slice(2, 9), createdAt: Date.now(), scope: 'subject', ...result };
  state.tests[studentId].unshift(full);
  markActivity(studentId);
  persist(); emit();
  return full;
}

// ---- Adaptive plan overrides (moves, completed days, extra practice items) ----
function planOf(studentId) {
  if (!state.plan[studentId]) state.plan[studentId] = { moves: {}, done: {}, extras: {} };
  const p = state.plan[studentId];
  p.moves = p.moves || {}; p.done = p.done || {}; p.extras = p.extras || {};
  return p;
}
export function planOverrides(studentId) { return planOf(studentId); }
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
export function adaptationKey(subject, domain) { return `${subject}|${domain}`; }
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
function recallOf(studentId) {
  if (!state.recall[studentId]) state.recall[studentId] = {};
  return state.recall[studentId];
}
function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
const DAY = 86400000;

// Ensure a scheduling record exists for a card; new cards are due immediately.
export function ensureRecallCard(studentId, cardId, topicId) {
  const r = recallOf(studentId);
  if (!r[cardId]) { r[cardId] = { topicId, box: 0, due: dayStart(Date.now()), reps: 0, lapses: 0, last: null }; persist(); }
  return r[cardId];
}
export function recallState(studentId, cardId) { return recallOf(studentId)[cardId] || null; }

// Grade a card: 'again' (forgot) drops to box 0; 'good' advances; 'easy' skips ahead.
export function gradeRecall(studentId, cardId, topicId, grade) {
  const r = recallOf(studentId);
  const c = r[cardId] || { topicId, box: 0, reps: 0, lapses: 0 };
  c.topicId = topicId;
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

// Cards due today (optionally filtered to a set of card ids / topic).
export function dueRecallCards(studentId, { cardIds = null, topicId = null } = {}) {
  const r = recallOf(studentId);
  const today = dayStart(Date.now());
  return Object.entries(r)
    .filter(([id, c]) => c.due <= today
      && (!cardIds || cardIds.includes(id))
      && (!topicId || c.topicId === topicId))
    .map(([id, c]) => ({ id, ...c }));
}
export function recallStatsForTopic(studentId, cardIds) {
  const r = recallOf(studentId);
  const today = dayStart(Date.now());
  let started = 0, due = 0, learned = 0;
  cardIds.forEach(id => {
    const c = r[id];
    if (!c) return;
    started++;
    if (c.due <= today) due++;
    if ((c.box || 0) >= 3) learned++;
  });
  return { total: cardIds.length, started, due, learned };
}
export function recallDueCount(studentId) {
  return dueRecallCards(studentId).length;
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
    .filter(([, c]) => c.due <= today)
    .map(([id, c]) => ({ id, ...c }));
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
export function markActivity(studentId) {
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
export function activeToday(studentId) {
  const a = state.activity[studentId] || {};
  return !!a[dateKeyLocal(Date.now())];
}

// ---- Gamification: XP, levels, badges ----
function gameOf(studentId) {
  if (!state.game[studentId]) state.game[studentId] = { xp: 0, badges: {} };
  const g = state.game[studentId];
  g.xp = g.xp || 0; g.badges = g.badges || {};
  return g;
}
// Level curve: level N needs a growing amount of XP (gentle early on).
export function levelForXp(xp) {
  let level = 1, need = 100, total = 0;
  while (xp >= total + need) { total += need; level++; need = Math.round(need * 1.35); }
  return { level, into: xp - total, need, floor: total };
}
export function gameState(studentId) {
  const g = gameOf(studentId);
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
export function hasBadge(studentId, badgeId) { return !!gameOf(studentId).badges[badgeId]; }
export function grantBadge(studentId, badgeId) {
  const g = gameOf(studentId);
  if (g.badges[badgeId]) return false;
  g.badges[badgeId] = Date.now();
  persist(); emit();
  return true;
}
export function earnedBadges(studentId) { return gameOf(studentId).badges; }

// ---- Notifications (account-wide) ----
export function notifications() { return state.notifications; }
export function unreadCount() { return state.notifications.filter(n => !n.read).length; }
export function addNotification(n) {
  const full = { id: 'n_' + Math.random().toString(36).slice(2, 9), read: false, createdAt: Date.now(), ...n };
  state.notifications.unshift(full);
  // keep the list from growing without bound
  if (state.notifications.length > 100) state.notifications = state.notifications.slice(0, 100);
  persist(); emit();
  return full;
}
export function markNotificationRead(id) {
  const n = state.notifications.find(x => x.id === id);
  if (n) n.read = true;
  persist(); emit();
}
export function markAllNotificationsRead() {
  state.notifications.forEach(n => { n.read = true; });
  persist(); emit();
}
export function clearNotifications() { state.notifications = []; persist(); emit(); }

// ---- Curriculum snapshot (for detecting repo updates) ----
export function getCurriculumSnapshot() { return state.curriculumSnapshot; }
export function setCurriculumSnapshot(snap) { state.curriculumSnapshot = snap; persist(); }

// ---- Lesson cache (shared per parent account, not student-specific) ----
// Lessons are reusable teaching material keyed by topic/activity, cached in KV.
const lessonCache = new Map();
function lessonKey(id) { return 'homestead:lesson:' + id; }

export async function getCachedLesson(id) {
  if (lessonCache.has(id)) return lessonCache.get(id);
  try {
    const raw = await puter.kv.get(lessonKey(id));
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      lessonCache.set(id, data);
      return data;
    }
  } catch {}
  return null;
}

export async function saveCachedLesson(id, data) {
  lessonCache.set(id, data);
  try { await puter.kv.set(lessonKey(id), JSON.stringify(data)); } catch {}
}

export { emit };
