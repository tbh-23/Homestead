// Error-pattern detection. After a test, classify the child's missed questions
// into reusable misconceptions and merge them into the student's log, so a
// recurring mistake surfaces as a pattern the parent can act on. Best-effort and
// non-blocking — it never interrupts the test flow if the AI call fails.
import * as store from './store.js';
import { aiMisconceptions } from './ai.js';

export async function detectMisconceptions(student, subject, topic, misses) {
  if (!student || !misses || !misses.length) return;
  try {
    const age = store.studentAge(student) || 8;
    const tagged = await aiMisconceptions({
      subject,
      age,
      topicName: topic ? topic.name : null,
      misses: misses.map((m, i) => ({ n: i, q: m.q, options: m.options, chosen: m.chosen, correct: m.correct })),
    });
    const domain = topic ? topic.domain : null;
    tagged.forEach(t => {
      if (!t || !(t.category || t.label)) return;
      // A one-off careless slip isn't a pattern worth flagging to the parent.
      if (String(t.category || '').toLowerCase().replace(/[^a-z]/g, '') === 'carelessslip') return;
      const src = Number.isInteger(t.n) ? misses[t.n] : null;
      store.addMisconception(student.id, {
        topicId: topic ? topic.id : null,
        subject,
        domain,
        category: t.category,
        label: t.label,
        why: t.why,
        evidence: src ? src.q : '',
      });
    });
  } catch (e) { /* best-effort background diagnosis */ }
}
