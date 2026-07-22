// Shared logic for mastery gating, ordering and stats.
import { getData, hardPrereqs, orderTopics, topicAge, SUBJECTS } from './data.js';
import * as store from './store.js';
import { MASTERY } from './store.js';

// A topic is "unlocked" when all its HARD prerequisites are mastered.
export function isUnlocked(studentId, topicId) {
  const hp = hardPrereqs(topicId);
  if (hp.length === 0) return true;
  return hp.every(p => store.statusOf(studentId, p.id) === 'mastered');
}

// Which hard prereqs are still not mastered (blocking).
export function blockingPrereqs(studentId, topicId) {
  return hardPrereqs(topicId).filter(p => store.statusOf(studentId, p.id) !== 'mastered');
}

// Topics for a subject grouped by age band, in learning order.
export function subjectByAge(subject) {
  const d = getData();
  const list = orderTopics(d.bySubject[subject] || []);
  const byAge = {};
  for (const t of list) {
    const a = topicAge(t);
    (byAge[a] = byAge[a] || []).push(t);
  }
  return byAge;
}

// Overall stats for a student across all subjects.
export function studentStats(studentId) {
  const d = getData();
  const per = {};
  let totalMastered = 0, total = 0;
  for (const subject of Object.keys(SUBJECTS)) {
    const list = d.bySubject[subject] || [];
    let mastered = 0, learning = 0, practicing = 0;
    for (const t of list) {
      const st = store.statusOf(studentId, t.id);
      if (st === 'mastered') mastered++;
      else if (st === 'practicing') practicing++;
      else if (st === 'learning') learning++;
    }
    per[subject] = { total: list.length, mastered, learning, practicing,
      inProgress: learning + practicing,
      pct: list.length ? Math.round((mastered / list.length) * 100) : 0 };
    totalMastered += mastered; total += list.length;
  }
  return { per, totalMastered, total, pct: total ? Math.round((totalMastered / total) * 100) : 0 };
}

// The next best topics to work on for a student: unlocked, not mastered,
// closest to their age, most central first.
export function recommendedNext(studentId, limit = 6) {
  const d = getData();
  const s = store.get().students.find(x => x.id === studentId);
  const age = store.studentAge(s) || 5;
  const candidates = [];
  for (const t of d.topics) {
    const st = store.statusOf(studentId, t.id);
    if (st === 'mastered') continue;
    if (!isUnlocked(studentId, t.id)) continue;
    const ta = topicAge(t);
    if (ta > age + 1) continue; // don't jump too far ahead
    const ageGap = Math.abs(ta - age);
    // prioritise things already started, then age fit, then centrality
    const startedBonus = st === 'practicing' ? 3 : st === 'learning' ? 2 : 0;
    const score = startedBonus * 2 - ageGap + (t.centrality || 0) * 2;
    candidates.push({ topic: t, score, status: st });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// Topics recently updated (for activity feed).
export function recentActivity(studentId, limit = 8) {
  const d = getData();
  const prog = store.progressFor(studentId);
  return Object.entries(prog)
    .filter(([id]) => d.byId.has(id))
    .map(([id, v]) => ({ topic: d.byId.get(id), status: v.status, updatedAt: v.updatedAt }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit);
}

// ---- Sections (a teachable unit = subject + domain within one age band) ----
export function sectionId(subject, domain, age) { return `${subject}|${domain}|${age}`; }

// Ordered sections for a subject: grouped by (domain, age band), ordered by age
// then by the domain's centrality — the order a learner should move through them.
export function subjectSections(subject) {
  const d = getData();
  const byAge = subjectByAge(subject); // age -> ordered topics
  const sections = [];
  Object.keys(byAge).map(Number).sort((a, b) => a - b).forEach(age => {
    const groups = new Map(); // domain -> topics (keeps first-seen order)
    byAge[age].forEach(t => {
      if (!groups.has(t.domain)) groups.set(t.domain, []);
      groups.get(t.domain).push(t);
    });
    for (const [domain, topics] of groups) {
      sections.push({
        id: sectionId(subject, domain, age),
        subject, domain, age, topics,
        summary: d.clusterMap.get(`${subject}|${domain}|${age}`) || '',
      });
    }
  });
  return sections;
}

// The section (domain + age unit) a given topic belongs to.
export function sectionForTopic(topic) {
  const age = topicAge(topic);
  const sections = subjectSections(topic.subject);
  return sections.find(s => s.domain === topic.domain && s.age === age) || null;
}

// Mastery stats over an arbitrary list of topics.
export function topicsMasteryStats(studentId, topics) {
  let mastered = 0;
  topics.forEach(t => { if (store.statusOf(studentId, t.id) === 'mastered') mastered++; });
  return { mastered, total: topics.length, pct: topics.length ? Math.round((mastered / topics.length) * 100) : 0 };
}

// ---- The mastery ladder: topic test -> section test -> subject test ----

// A section is unlocked (its topics can be worked on) when the PREVIOUS section
// in the subject sequence has been passed. The first section is always open.
export function sectionUnlocked(studentId, subject, sectionIdx) {
  if (sectionIdx <= 0) return true;
  const sections = subjectSections(subject);
  const prev = sections[sectionIdx - 1];
  return prev ? store.sectionPassed(studentId, prev.id) : true;
}

// The section TEST is available once every topic in the section is mastered
// (i.e. every topic test passed).
export function sectionTestReady(studentId, section) {
  return section.topics.length > 0 && section.topics.every(t => store.statusOf(studentId, t.id) === 'mastered');
}

// The subject (final) TEST is available once every section has been passed.
export function subjectTestReady(studentId, subject) {
  const sections = subjectSections(subject);
  return sections.length > 0 && sections.every(s => store.sectionPassed(studentId, s.id));
}

// How many topics in a section still need their topic test passed.
export function topicsRemaining(studentId, section) {
  return section.topics.filter(t => store.statusOf(studentId, t.id) !== 'mastered').length;
}

export { MASTERY };
