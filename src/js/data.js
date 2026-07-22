// Loads the Marble Skill Taxonomy and builds the learning graph.
// Data source: https://github.com/withmarbleapp/os-taxonomy (ODbL 1.0 / CC BY-SA 4.0)

const CDN = 'https://cdn.jsdelivr.net/gh/withmarbleapp/os-taxonomy@main/data';

export const SUBJECTS = {
  'Mathematics':                  { color: '#3f7d5e', icon: 'calculator' },
  'English':                      { color: '#b0603a', icon: 'book-open' },
  'Science':                      { color: '#3d6b93', icon: 'flask-conical' },
  'History':                      { color: '#8a5a2b', icon: 'landmark' },
  'Personal & Social Development':{ color: '#7a5a9e', icon: 'heart-handshake' },
  'Life Skills':                  { color: '#c08a2e', icon: 'sprout' },
  'Computing':                    { color: '#4a7a86', icon: 'cpu' },
  'Learning to Learn':            { color: '#a3486b', icon: 'brain' },
};

export const AGES = [5, 6, 7, 8, 9, 10, 11, 12, 13];

let _cache = null;

export async function loadTaxonomy() {
  if (_cache) return _cache;
  const [topicsRes, depsRes, clustersRes, manifestRes] = await Promise.all([
    fetch(`${CDN}/topics.json`),
    fetch(`${CDN}/dependencies.json`),
    fetch(`${CDN}/clusters.json`),
    fetch(`${CDN}/manifest.json`).catch(() => null),
  ]);
  if (!topicsRes.ok || !depsRes.ok) throw new Error('Could not load the curriculum data.');
  const topicsJson = await topicsRes.json();
  const depsJson = await depsRes.json();
  const clustersJson = clustersRes.ok ? await clustersRes.json() : { clusters: [] };
  const manifest = (manifestRes && manifestRes.ok) ? await manifestRes.json() : null;

  const topics = topicsJson.topics || topicsJson;
  const dependencies = depsJson.dependencies || depsJson;
  const clusters = clustersJson.clusters || [];

  const byId = new Map(topics.map(t => [t.id, t]));

  // Prerequisite edges: topicId depends on prerequisiteId
  const prereqsOf = new Map();   // topic -> [{id, strength, reason}]
  const unlocksOf = new Map();   // topic -> [{id, strength, reason}]
  for (const t of topics) { prereqsOf.set(t.id, []); unlocksOf.set(t.id, []); }
  for (const d of dependencies) {
    if (!byId.has(d.topicId) || !byId.has(d.prerequisiteId)) continue;
    prereqsOf.get(d.topicId).push({ id: d.prerequisiteId, strength: d.strength, reason: d.reason });
    unlocksOf.get(d.prerequisiteId).push({ id: d.topicId, strength: d.strength, reason: d.reason });
  }

  // Domain summaries lookup: subject|domain|ageStart -> summary
  const clusterMap = new Map();
  for (const c of clusters) {
    clusterMap.set(`${c.subject}|${c.domain}|${c.ageRangeStart}`, c.summary);
  }

  // Group topics by subject
  const bySubject = {};
  for (const t of topics) {
    (bySubject[t.subject] = bySubject[t.subject] || []).push(t);
  }

  _cache = {
    topics, dependencies, clusters,
    byId, prereqsOf, unlocksOf, clusterMap, bySubject,
    manifest,
    meta: {
      topics: topics.length,
      dependencies: dependencies.length,
      version: manifest?.taxonomyVersion || 'v1',
      generatedAt: manifest?.generatedAt || null,
    },
  };
  return _cache;
}

export function getData() {
  if (!_cache) throw new Error('Taxonomy not loaded');
  return _cache;
}

// Clamp a topic's start age into the 5-13 window used by the app.
export function topicAge(t) {
  return Math.min(13, Math.max(5, t.ageRangeStart || 5));
}

// Order topics within a subject by age then centrality (a sensible learning order).
export function orderTopics(list) {
  return [...list].sort((a, b) => {
    if ((a.ageRangeStart || 5) !== (b.ageRangeStart || 5)) return (a.ageRangeStart || 5) - (b.ageRangeStart || 5);
    if ((b.centrality || 0) !== (a.centrality || 0)) return (b.centrality || 0) - (a.centrality || 0);
    return a.name.localeCompare(b.name);
  });
}

export function hardPrereqs(topicId) {
  const d = getData();
  return (d.prereqsOf.get(topicId) || []).filter(p => p.strength === 'hard');
}

export function allPrereqs(topicId) {
  const d = getData();
  return d.prereqsOf.get(topicId) || [];
}

export function unlocks(topicId) {
  const d = getData();
  return d.unlocksOf.get(topicId) || [];
}
