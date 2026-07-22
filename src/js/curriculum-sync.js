// Detects when the upstream Marble taxonomy repo has changed since the parent
// last used Homestead, and raises notifications. The curriculum data itself is
// ALWAYS the latest (it's fetched fresh from the repo's @main on every load);
// this only surfaces *what* changed so the parent knows.
import { getData, SUBJECTS } from './data.js';
import * as store from './store.js';

// Build a compact snapshot of the current curriculum for future comparison.
function snapshot(d) {
  const bySubjectCount = {};
  for (const s of Object.keys(SUBJECTS)) bySubjectCount[s] = (d.bySubject[s] || []).length;
  return {
    version: d.meta.version,
    generatedAt: d.meta.generatedAt,
    count: d.topics.length,
    depCount: d.dependencies.length,
    topicIds: d.topics.map(t => t.id),
    bySubjectCount,
    savedAt: Date.now(),
  };
}

// Called once after the taxonomy loads and the user is signed in.
export function syncCurriculum() {
  const d = getData();
  const prev = store.getCurriculumSnapshot();
  const next = snapshot(d);

  // First run for this account: remember the baseline and add a gentle welcome
  // note so the notification center isn't empty and the feature is discoverable.
  if (!prev || !Array.isArray(prev.topicIds)) {
    store.setCurriculumSnapshot(next);
    if (store.notifications().length === 0) {
      store.addNotification({
        type: 'welcome',
        title: 'Your curriculum stays up to date',
        body: `Homestead is loaded with ${next.count.toLocaleString()} topics (${next.version}) and refreshes automatically from the open curriculum. When new material is added, you'll be notified right here.`,
      });
    }
    return;
  }

  // Nothing changed → keep the snapshot fresh (timestamps) and move on.
  const versionChanged = prev.version !== next.version || prev.generatedAt !== next.generatedAt;
  const countChanged = prev.count !== next.count || prev.depCount !== next.depCount;
  if (!versionChanged && !countChanged) {
    store.setCurriculumSnapshot(next);
    return;
  }

  // Figure out exactly which topics were added / removed.
  const prevSet = new Set(prev.topicIds);
  const nextSet = new Set(next.topicIds);
  const added = next.topicIds.filter(id => !prevSet.has(id));
  const removed = prev.topicIds.filter(id => !nextSet.has(id));

  // Per-subject additions, for a friendly summary.
  const addedBySubject = {};
  added.forEach(id => {
    const t = d.byId.get(id);
    if (!t) return;
    (addedBySubject[t.subject] = addedBySubject[t.subject] || []).push(t.name);
  });

  if (added.length || removed.length || versionChanged) {
    const parts = [];
    if (added.length) parts.push(`${added.length} new topic${added.length > 1 ? 's' : ''}`);
    if (removed.length) parts.push(`${removed.length} removed`);
    const subjectLine = Object.entries(addedBySubject)
      .map(([s, list]) => `${s} (${list.length})`).join(', ');

    let body;
    if (added.length) {
      body = `The curriculum was updated to ${next.version}. New material was added${subjectLine ? ' in ' + subjectLine : ''}. It's already live in your timeline and calendar.`;
    } else if (removed.length) {
      body = `The curriculum was updated to ${next.version}. ${removed.length} topic${removed.length > 1 ? 's were' : ' was'} revised or removed. Your progress on remaining topics is unchanged.`;
    } else {
      body = `The curriculum was updated to ${next.version}. Refinements were made to existing material — it's already live.`;
    }

    store.addNotification({
      type: 'curriculum',
      title: added.length ? `Curriculum updated — ${added.length} new topic${added.length > 1 ? 's' : ''}` : 'Curriculum updated',
      body,
      meta: {
        version: next.version,
        added: added.length,
        removed: removed.length,
        addedBySubject,
        sampleNames: added.slice(0, 8).map(id => d.byId.get(id)?.name).filter(Boolean),
      },
    });
  }

  store.setCurriculumSnapshot(next);
}
