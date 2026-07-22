// Builds a day-by-day learning track from age 5 to 13 for a student, and
// picks deterministic daily "extras" (refreshers + activities/quizzes).
import { getData, SUBJECTS, orderTopics, topicAge } from './data.js';
import * as store from './store.js';

const SCHOOL_DAYS_PER_YEAR = 180;   // weekdays of new-topic teaching per year

function pad(n) { return String(n).padStart(2, '0'); }
export function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function isWeekend(d) { const g = d.getDay(); return g === 0 || g === 6; }

function weekdaysFrom(startDate, count) {
  const days = [];
  const d = new Date(startDate);
  let guard = 0;
  while (days.length < count && guard < count * 3 + 10) {
    if (!isWeekend(d)) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return days;
}

// Deterministic RNG so a given date always yields the same extras.
function seedFromKey(k) { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const _planCache = new Map(); // studentId -> plan

// The date the track begins: the student's chosen start date, else the day they
// were added, else today. Stored as a yyyy-mm-dd key on the student.
export function planStartKey(student) {
  if (student && student.startDate) return student.startDate;
  if (student && student.createdAt) return keyOf(new Date(student.createdAt));
  return keyOf(new Date());
}

// Build the full track from the chosen start date, covering the student's
// current age up to 13, one age-band after another (~180 weekdays each).
// Returns { byDate: Map(key -> [topic]), topicDate: Map(id -> key), firstKey, lastKey }
export function buildPlan(student) {
  if (!student) return { byDate: new Map(), topicDate: new Map() };
  const movesSig = JSON.stringify(store.planOverrides(student.id).moves || {});
  const cacheKey = student.id + '|' + planStartKey(student) + '|' + movesSig;
  if (_planCache.has(cacheKey)) return _planCache.get(cacheKey);

  const d = getData();
  const byDate = new Map();
  const topicDate = new Map();
  let firstKey = null, lastKey = null;

  const startAge = Math.min(13, Math.max(5, store.studentAge(student) || 5));
  let cursor = parseKey(planStartKey(student));

  for (let age = startAge; age <= 13; age++) {
    const weekdays = weekdaysFrom(cursor, SCHOOL_DAYS_PER_YEAR);
    if (weekdays.length === 0) continue;

    // Topics that begin at this age, per subject, in ladder order.
    const perSubject = Object.keys(SUBJECTS).map(sub =>
      orderTopics((d.bySubject[sub] || []).filter(t => topicAge(t) === age)));

    // Interleave subjects so each stretch of days spans a variety.
    const interleaved = [];
    let idx = 0, more = true;
    while (more) {
      more = false;
      for (const list of perSubject) {
        if (idx < list.length) { interleaved.push(list[idx]); more = true; }
      }
      idx++;
    }

    const n = interleaved.length;
    interleaved.forEach((t, i) => {
      const dayIdx = n <= 1 ? 0 : Math.min(weekdays.length - 1, Math.floor(i * weekdays.length / n));
      const k = keyOf(weekdays[dayIdx]);
      topicDate.set(t.id, k);
      if (!lastKey || k > lastKey) lastKey = k;
      if (!firstKey || k < firstKey) firstKey = k;
    });

    // Next age-band begins the weekday after this one ends.
    const lastDay = weekdays[weekdays.length - 1];
    cursor = new Date(lastDay);
    cursor.setDate(cursor.getDate() + 1);
  }

  // Apply parent overrides (a topic moved to a chosen date).
  const overrides = store.planOverrides(student.id).moves || {};
  for (const [tid, k] of Object.entries(overrides)) {
    if (topicDate.has(tid)) topicDate.set(tid, k);
  }

  // Build byDate from the (possibly overridden) topicDate map.
  const d2 = getData();
  for (const [tid, k] of topicDate) {
    const topic = d2.byId.get(tid);
    if (!topic) continue;
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(topic);
    if (!lastKey || k > lastKey) lastKey = k;
    if (!firstKey || k < firstKey) firstKey = k;
  }

  const plan = { byDate, topicDate, firstKey, lastKey };
  _planCache.set(cacheKey, plan);
  return plan;
}

export function invalidatePlan(studentId) {
  if (!studentId) { _planCache.clear(); return; }
  for (const k of [..._planCache.keys()]) { if (k.startsWith(studentId + '|')) _planCache.delete(k); }
}

export function topicsOn(student, dateKey) {
  return buildPlan(student).byDate.get(dateKey) || [];
}

// The date the school track is "up to" — clamped into the track window.
export function trackDayFor(student, dateKey) {
  const plan = buildPlan(student);
  if (!plan.firstKey) return dateKey;
  if (dateKey < plan.firstKey) return plan.firstKey;
  if (dateKey > plan.lastKey) return plan.lastKey;
  return dateKey;
}

// Deterministic daily extras: refresher topics + a suggested activity/quiz.
// Pulls mainly from already-mastered / earlier topics so review continues.
export function dailyExtras(student, dateKey) {
  const d = getData();
  const rng = mulberry32(seedFromKey(student.id + '|' + dateKey));
  const pick = arr => arr.length ? arr[Math.floor(rng() * arr.length)] : null;

  const mastered = d.topics.filter(t => store.statusOf(student.id, t.id) === 'mastered');
  const age = store.studentAge(student) || 5;
  // Fallback pool: topics at or below the student's age (things they've likely seen).
  const seenPool = mastered.length >= 3 ? mastered : d.topics.filter(t => topicAge(t) <= Math.max(5, age));

  // Refresher: a random previously-learned topic.
  const refresher = pick(seenPool);

  // A second, different refresher for variety.
  let refresher2 = pick(seenPool);
  let guard = 0;
  while (refresher2 && refresher && refresher2.id === refresher.id && guard < 6) { refresher2 = pick(seenPool); guard++; }

  // Challenge: an upcoming/unmastered topic near their age for a stretch.
  const upcoming = d.topics.filter(t => store.statusOf(student.id, t.id) !== 'mastered' && Math.abs(topicAge(t) - age) <= 1);
  const challenge = pick(upcoming);

  // Which kind of extra to feature today.
  const kinds = ['quiz', 'activity', 'game'];
  const featured = kinds[Math.floor(rng() * kinds.length)];

  return { refresher, refresher2, challenge, featured, rngSeed: seedFromKey(dateKey) };
}
