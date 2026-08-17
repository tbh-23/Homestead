// Portfolio / progress-report data. Pulls together everything already stored for
// a student (mastery, tests, attendance, records) into shapes the printable
// year-end report and the Insights charts both consume. No new data is invented —
// this only reads and summarizes what the parent's account already holds.
import { getData, SUBJECTS } from './data.js';
import * as store from './store.js';
import { studentStats } from './mastery.js';

const DAY = 86400000;

// Topics a student has mastered, each with the timestamp it was marked mastered,
// oldest first. Filtered to topics that still exist in the curriculum.
export function masteredTopics(studentId, subject = null) {
  const d = getData();
  const prog = store.progressFor(studentId);
  return Object.entries(prog)
    .filter(([id, v]) => v.status === 'mastered' && d.byId.has(id))
    .map(([id, v]) => ({ topic: d.byId.get(id), at: v.updatedAt || 0 }))
    .filter(x => !subject || x.topic.subject === subject)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

// Cumulative "topics mastered" over time, as points for lineChart (x is 0..1
// across the span from the first mastery to now). Empty span → single point.
export function masteryGrowth(studentId, subject = null) {
  const items = masteredTopics(studentId, subject).filter(x => x.at);
  if (!items.length) return { points: [], count: 0, firstAt: null, lastAt: null };
  const firstAt = items[0].at;
  const now = Date.now();
  const span = Math.max(DAY, now - firstAt);
  const points = [{ x: 0, y: 0 }];
  items.forEach((it, i) => { points.push({ x: (it.at - firstAt) / span, y: i + 1 }); });
  points.push({ x: 1, y: items.length }); // carry the line to "now"
  return { points, count: items.length, firstAt, lastAt: items[items.length - 1].at };
}

// Test/quiz results over time (subject + section + topic mastery tests).
export function testHistory(studentId, subject = null) {
  return (store.testsFor(studentId) || [])
    .filter(t => !subject || t.subject === subject)
    .map(t => ({ at: t.createdAt, pct: t.pct, passed: !!t.passed, scope: t.scope || 'subject' }))
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

// Attendance / instruction days from the activity log (any day the child did a
// lesson, recall, mastery test, etc.). Many states require an attendance record.
export function attendanceSummary(studentId) {
  const a = store.get().activity[studentId] || {};
  const days = Object.keys(a).filter(k => a[k]).sort();
  const byMonth = {};
  for (const k of days) { const ym = k.slice(0, 7); byMonth[ym] = (byMonth[ym] || 0) + 1; }
  return {
    days,
    count: days.length,
    first: days[0] || null,
    last: days[days.length - 1] || null,
    byMonth,
    streak: store.activityStreak(studentId),
  };
}

// One consolidated bundle for the printable report.
export function portfolio(studentId) {
  const student = store.get().students.find(s => s.id === studentId) || null;
  const stats = studentStats(studentId);
  const tests = (store.testsFor(studentId) || [])
    .filter(t => t.passed)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const records = store.recordsFor(studentId);
  return {
    student,
    age: store.studentAge(student),
    stats,
    subjects: Object.keys(SUBJECTS),
    mastered: masteredTopics(studentId),
    growth: masteryGrowth(studentId),
    passedTests: tests,
    records,
    attendance: attendanceSummary(studentId),
    game: store.gameState(studentId),
    badges: store.earnedBadges(studentId),
  };
}
