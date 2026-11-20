// Curriculum hierarchy helpers. The browser view and tests share this module
// so subject → domain → section → topic drill-down stays consistent.

import { getData, orderTopics, topicAge, orderedSubjects } from './data.js';

// `subjects` (an object keyed by subject) limits and orders the tree; by
// default it holds every subject with topics, so none is dropped.
export function buildCurriculumTree(data, subjects = null) {
  const clusterMap = data.clusterMap instanceof Map
    ? data.clusterMap
    : new Map(Object.entries(data.clusterMap || {}));
  const bySubject = data.bySubject || {};

  return (subjects ? Object.keys(subjects) : orderedSubjects(bySubject)).map((subject) => {
    const topics = orderTopics(bySubject[subject] || []);
    const domains = new Map();
    for (const topic of topics) {
      const domain = topic.domain || 'General';
      if (!domains.has(domain)) domains.set(domain, []);
      domains.get(domain).push(topic);
    }

    return {
      subject,
      topics,
      domains: [...domains.entries()].map(([domain, domainTopics]) => {
        const byAge = new Map();
        for (const topic of domainTopics) {
          const age = topicAge(topic);
          if (!byAge.has(age)) byAge.set(age, []);
          byAge.get(age).push(topic);
        }
        return {
          subject,
          domain,
          topics: domainTopics,
          sections: [...byAge.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([age, sectionTopics]) => ({
              subject,
              domain,
              age,
              topics: sectionTopics,
              summary: clusterMap.get(`${subject}|${domain}|${age}`) || '',
            })),
        };
      }),
    };
  });
}

export function curriculumTree() {
  return buildCurriculumTree(getData());
}

export function findSubject(subject) {
  return curriculumTree().find((node) => node.subject === subject) || null;
}

export function findDomain(subject, domain) {
  return findSubject(subject)?.domains.find((node) => node.domain === domain) || null;
}

export function findSection(subject, domain, age) {
  const numericAge = Number(age);
  return findDomain(subject, domain)?.sections.find((node) => node.age === numericAge) || null;
}

export function localEdges(topics, prereqsOf) {
  const ids = new Set(topics.map((topic) => topic.id));
  const edges = [];
  for (const topic of topics) {
    for (const prereq of prereqsOf.get(topic.id) || []) {
      if (ids.has(prereq.id)) {
        edges.push({ from: prereq.id, to: topic.id, strength: prereq.strength });
      }
    }
  }
  return edges;
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 63, g: 125, b: 94 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function quietMasteryFill(hex, pct, paper = '#fbf6ec') {
  const amount = 0.1 + (Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * 0.22;
  const color = hexToRgb(hex);
  const base = hexToRgb(paper);
  return rgbToHex(
    base.r + (color.r - base.r) * amount,
    base.g + (color.g - base.g) * amount,
    base.b + (color.b - base.b) * amount,
  );
}

function longestPathColumns(ids, edges) {
  const idSet = new Set(ids);
  const preds = new Map(ids.map((id) => [id, []]));
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    preds.get(edge.to).push(edge.from);
  }
  const memo = new Map();
  const visiting = new Set();
  const layerOf = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const incoming = preds.get(id) || [];
    const layer = incoming.length ? 1 + Math.max(...incoming.map(layerOf)) : 0;
    visiting.delete(id);
    memo.set(id, layer);
    return layer;
  };
  const columns = new Map();
  for (const id of ids) columns.set(id, layerOf(id));
  return columns;
}

const SKILL_TREE_LAYOUT = {
  colWidth: 128,
  rowHeight: 108,
  paddingX: 36,
  paddingY: 28,
  nodeWidth: 96,
  nodeHeight: 96,
  hopWidth: 136,
  hopHeight: 62,
  orbSize: 52,
};

export const SKILL_STATE_CHROME = {
  locked: { label: 'Locked', fill: '#7a7263', ring: '#cdc3ad' },
  ready: { label: 'Ready', fill: '#2f6285', ring: '#bfdcec' },
  'in-progress': { label: 'In progress', fill: '#8a6412', ring: '#f2c14e' },
  mastered: { label: 'Mastered', fill: '#3f6b3b', ring: '#a9c9a0' },
};

export function resolveSkillNodeState(topicId, progress = {}, prereqsOf = new Map()) {
  const status = progress[topicId] || 'none';
  if (status === 'mastered') return 'mastered';
  if (status === 'learning' || status === 'practicing') return 'in-progress';
  const hard = (prereqsOf.get(topicId) || []).filter((edge) => {
    if (typeof edge === 'string') return true;
    return edge.strength === 'hard';
  });
  const unlocked = hard.every((edge) => {
    const id = typeof edge === 'string' ? edge : edge.id;
    return progress[id] === 'mastered';
  });
  return unlocked ? 'ready' : 'locked';
}

export function blockingHardPrereqIds(topicId, progress = {}, prereqsOf = new Map()) {
  return (prereqsOf.get(topicId) || [])
    .filter((edge) => (typeof edge === 'string' ? true : edge.strength === 'hard'))
    .map((edge) => (typeof edge === 'string' ? edge : edge.id))
    .filter((id) => (progress[id] || 'none') !== 'mastered');
}

export function layeredDagLayout(nodes, edges, opts = {}) {
  const {
    colWidth = 196,
    rowHeight = 64,
    paddingX = 24,
    paddingY = 20,
    nodeWidth = 168,
    nodeHeight = 44,
    hopWidth = 148,
    hopHeight = 52,
    orbSize = 0,
  } = opts;

  const topicNodes = nodes.filter((node) => node.kind !== 'hop');
  const hopNodes = nodes.filter((node) => node.kind === 'hop');
  const topicIds = topicNodes.map((node) => node.id);
  const topicIdSet = new Set(topicIds);
  const topicEdges = edges.filter((edge) => topicIdSet.has(edge.from) && topicIdSet.has(edge.to));
  const topicColumns = longestPathColumns(topicIds, topicEdges);

  const inHops = hopNodes.filter((node) => node.side === 'in');
  const outHops = hopNodes.filter((node) => node.side !== 'in');
  const shift = inHops.length ? 1 : 0;
  const maxTopicCol = topicColumns.size ? Math.max(0, ...topicColumns.values()) : 0;

  const placed = [];
  for (const node of topicNodes) {
    placed.push({
      ...node,
      column: (topicColumns.get(node.id) || 0) + shift,
      width: nodeWidth,
      height: nodeHeight,
      orb: orbSize || 0,
    });
  }
  inHops.forEach((node, index) => {
    placed.push({ ...node, column: 0, rowHint: index, width: hopWidth, height: hopHeight });
  });
  const outCol = shift + maxTopicCol + (outHops.length || topicNodes.length ? 1 : 0);
  outHops.forEach((node, index) => {
    placed.push({ ...node, column: Math.max(outCol, shift + maxTopicCol + 1), rowHint: index, width: hopWidth, height: hopHeight });
  });

  const byCol = new Map();
  for (const node of placed) {
    if (!byCol.has(node.column)) byCol.set(node.column, []);
    byCol.get(node.column).push(node);
  }

  const predY = new Map();
  const columns = [...byCol.keys()].sort((a, b) => a - b);
  for (const column of columns) {
    const group = byCol.get(column);
    group.sort((a, b) => {
      const ay = predY.has(a.id) ? predY.get(a.id) : (a.rowHint ?? 0);
      const by = predY.has(b.id) ? predY.get(b.id) : (b.rowHint ?? 0);
      if (ay !== by) return ay - by;
      const ageA = a.topic?.ageRangeStart ?? 0;
      const ageB = b.topic?.ageRangeStart ?? 0;
      if (ageA !== ageB) return ageA - ageB;
      return String(a.label || a.id).localeCompare(String(b.label || b.id));
    });
    group.forEach((node, row) => {
      node.row = row;
      node.x = paddingX + column * colWidth;
      node.y = paddingY + row * rowHeight;
      predY.set(node.id, node.y);
    });
    for (const edge of edges) {
      if (!topicIdSet.has(edge.to) && !edge.to.startsWith('hop:')) continue;
      const from = group.find((node) => node.id === edge.from);
      if (from) {
        const current = predY.get(edge.to);
        predY.set(edge.to, current == null ? from.y : (current + from.y) / 2);
      }
    }
  }

  const width = paddingX * 2 + (columns.length ? (Math.max(...columns) + 1) * colWidth : colWidth);
  const height = paddingY * 2 + (placed.length
    ? (Math.max(...placed.map((node) => node.row || 0)) + 1) * rowHeight
    : rowHeight);

  return { nodes: placed, width, height, edges };
}

// The selected skill rides along as a `?skill=` suffix so "Back to graph" and
// the browser history restore it. Selection is view state, never family data.
export function graphHash(params = {}) {
  const parts = ['graph'];
  if (params.subject) parts.push(encodeURIComponent(params.subject));
  if (params.domain) parts.push(encodeURIComponent(params.domain));
  if (params.age != null && params.age !== '') parts.push(encodeURIComponent(String(params.age)));
  const path = parts.join('/');
  return params.skill ? `${path}?skill=${encodeURIComponent(params.skill)}` : path;
}

// Inverse of graphHash: takes the hash without its leading '#'. Returns null
// when the hash is not a graph route.
export function parseGraphHash(hash = '') {
  const raw = String(hash).replace(/^#/, '');
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? '' : raw.slice(q + 1);
  const decode = (part) => {
    try { return decodeURIComponent(part); }
    catch { return part; }
  };
  const [name, ...rest] = path.split('/').map(decode);
  if (name !== 'graph') return null;
  const params = {};
  if (rest[0]) params.subject = rest[0];
  if (rest[1]) params.domain = rest[1];
  if (rest[2]) params.age = rest[2];
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (decode(pair.slice(0, eq)) === 'skill') {
      const skill = decode(pair.slice(eq + 1));
      if (skill) params.skill = skill;
    }
  }
  return params;
}

// Selection is per learner: when the active learner changes between two
// renders, the skill in the route is dropped. `previous` is undefined before
// the first render so a deep link or reload keeps its skill.
export function selectionForLearner(params = {}, previous, current) {
  const switched = previous !== undefined && previous !== current;
  if (!switched || !params.skill) return { params, switched, dropped: false };
  const { skill, ...rest } = params;
  return { params: rest, switched, dropped: true };
}

// The learner the graph's selection belongs to after a store emit. Off the
// graph a switch is recorded at once, so a selection made later for the new
// learner (a topic page's "Back to graph") is kept. On the graph it is left
// for the next render, which sees the switch and drops the old skill.
export function learnerAfterEmit(previous, current, onGraph) {
  return onGraph ? previous : current;
}

export const MAX_DOMAIN_GATEWAYS = 8;

export const WORLD_MAP_VIEWBOX = { width: 1100, height: 640 };

const REALM_PLACES = {
  Mathematics: { cx: 230, cy: 300, rx: 158, ry: 118, rotate: -12 },
  English: { cx: 530, cy: 128, rx: 148, ry: 96, rotate: 8 },
  Science: { cx: 560, cy: 330, rx: 142, ry: 108, rotate: -3 },
  History: { cx: 860, cy: 150, rx: 132, ry: 92, rotate: 10 },
  'Personal & Social Development': { cx: 880, cy: 340, rx: 138, ry: 100, rotate: -6 },
  'Life Skills': { cx: 280, cy: 520, rx: 138, ry: 92, rotate: 7 },
  Computing: { cx: 620, cy: 520, rx: 146, ry: 94, rotate: -8 },
  'Learning to Learn': { cx: 200, cy: 120, rx: 128, ry: 86, rotate: 4 },
  Geography: { cx: 930, cy: 532, rx: 126, ry: 82, rotate: 6 },
};

// Small spots in the gaps between the realms above, for subjects a newer
// taxonomy adds before they get a place of their own: the n-th unknown subject
// takes the n-th spot (after the last, they start again lower down).
const SPARE_PLACES = [
  { cx: 395, cy: 215, rx: 72, ry: 48, rotate: 0 },
  { cx: 715, cy: 225, rx: 72, ry: 48, rotate: 0 },
  { cx: 410, cy: 425, rx: 72, ry: 48, rotate: 0 },
  { cx: 745, cy: 425, rx: 72, ry: 48, rotate: 0 },
  { cx: 1010, cy: 70, rx: 72, ry: 48, rotate: 0 },
  { cx: 80, cy: 590, rx: 64, ry: 40, rotate: 0 },
];

function realmPlace(subject, spare = 0) {
  if (REALM_PLACES[subject]) return REALM_PLACES[subject];
  const place = SPARE_PLACES[spare % SPARE_PLACES.length];
  return { ...place, cy: place.cy + 18 * Math.floor(spare / SPARE_PLACES.length) };
}

function realmBlobPath(cx, cy, rx, ry, rotate = 0) {
  const rad = (rotate * Math.PI) / 180;
  const count = 8;
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    const wobble = 0.86 + 0.14 * Math.sin(i * 2.15 + rx * 0.02);
    const x = Math.cos(t) * rx * wobble;
    const y = Math.sin(t) * ry * wobble;
    pts.push([
      cx + x * Math.cos(rad) - y * Math.sin(rad),
      cy + x * Math.sin(rad) + y * Math.cos(rad),
    ]);
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < count; i += 1) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % count];
    d += ` Q ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} ${((p1[0] + p2[0]) / 2).toFixed(1)} ${((p1[1] + p2[1]) / 2).toFixed(1)}`;
  }
  return `${d} Z`;
}

function domainClusterPoints(cx, cy, rx, ry, count) {
  if (count <= 0) return [];
  const innerRx = rx * 0.4;
  const innerRy = ry * 0.34;
  if (count === 1) return [{ x: cx, y: cy + 16 }];
  return Array.from({ length: count }, (_, index) => {
    const t = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(t) * innerRx,
      y: cy + 14 + Math.sin(t) * innerRy,
    };
  });
}

export function buildWorldMap(tree) {
  let spare = 0;
  const realms = (tree || []).map((node) => {
    const place = realmPlace(node.subject, REALM_PLACES[node.subject] ? 0 : spare++);
    const clusters = domainClusterPoints(place.cx, place.cy, place.rx, place.ry, node.domains.length)
      .map((point, index) => ({
        kind: 'domain-cluster',
        domain: node.domains[index].domain,
        topicCount: node.domains[index].topics.length,
        x: point.x,
        y: point.y,
      }));
    return {
      kind: 'realm',
      subject: node.subject,
      domainCount: node.domains.length,
      topicCount: node.topics.length,
      domains: node.domains.map((domain) => ({ domain: domain.domain, topicCount: domain.topics.length })),
      clusters,
      path: realmBlobPath(place.cx, place.cy, place.rx, place.ry, place.rotate),
      ...place,
    };
  });
  return {
    kind: 'world',
    viewBox: WORLD_MAP_VIEWBOX,
    realms,
    topicNodes: [],
  };
}

export function defaultDomain(subjectNode, preferredAge = null) {
  const domains = subjectNode?.domains || [];
  if (!domains.length) return null;
  if (preferredAge == null || Number.isNaN(Number(preferredAge))) return domains[0];
  const target = Number(preferredAge);
  const nearestAge = (domain) => {
    const ages = (domain.sections || []).map((section) => section.age);
    if (!ages.length) return Number.POSITIVE_INFINITY;
    return ages.reduce((best, age) => (
      Math.abs(age - target) < Math.abs(best - target) ? age : best
    ));
  };
  return domains.reduce((best, domain) => (
    Math.abs(nearestAge(domain) - target) < Math.abs(nearestAge(best) - target) ? domain : best
  ));
}

function domainKey(subject, domain) {
  return `${subject}|${domain}`;
}

function topicDomainKey(topic) {
  return domainKey(topic.subject, topic.domain);
}

export function domainHopId(key) {
  return `hop:${key}`;
}

function gatewaySide(hop) {
  if (hop.in && !hop.out) return 'in';
  if (hop.out && !hop.in) return 'out';
  if (hop.in >= hop.out) return 'in';
  return 'out';
}

function collectDomainGateways(homeTopics, home, data, { cap = MAX_DOMAIN_GATEWAYS, siblingDomains = [] } = {}) {
  const homeIds = new Set(homeTopics.map((topic) => topic.id));
  const homeKey = home ? domainKey(home.subject, home.domain) : '';
  const hopMap = new Map();

  const ensure = (topic) => {
    if (!topic || homeIds.has(topic.id)) return null;
    const key = topicDomainKey(topic);
    if (key === homeKey) return null;
    if (!hopMap.has(key)) {
      hopMap.set(key, {
        key,
        subject: topic.subject,
        domain: topic.domain,
        edgeCount: 0,
        hardCount: 0,
        in: 0,
        out: 0,
        sibling: false,
      });
    }
    return hopMap.get(key);
  };

  for (const topic of homeTopics) {
    for (const prereq of data.prereqsOf.get(topic.id) || []) {
      const hop = ensure(data.byId.get(prereq.id));
      if (!hop) continue;
      hop.edgeCount += 1;
      if (prereq.strength === 'hard') hop.hardCount += 1;
      hop.in += 1;
    }
    for (const unlock of data.unlocksOf.get(topic.id) || []) {
      const hop = ensure(data.byId.get(unlock.id));
      if (!hop) continue;
      hop.edgeCount += 1;
      if (unlock.strength === 'hard') hop.hardCount += 1;
      hop.out += 1;
    }
  }

  for (const domain of siblingDomains) {
    if (!home || domain === home.domain) continue;
    const key = domainKey(home.subject, domain);
    if (!hopMap.has(key)) {
      hopMap.set(key, {
        key,
        subject: home.subject,
        domain,
        edgeCount: 0,
        hardCount: 0,
        in: 0,
        out: 0,
        sibling: true,
      });
    } else {
      hopMap.get(key).sibling = true;
    }
  }

  const all = [...hopMap.values()].map((hop) => ({ ...hop, side: gatewaySide(hop) }));
  const siblings = all.filter((hop) => hop.sibling)
    .sort((a, b) => b.hardCount - a.hardCount || b.edgeCount - a.edgeCount || a.domain.localeCompare(b.domain));
  const siblingRoom = Math.min(siblings.length, Math.max(3, Math.ceil(cap * 0.6)));
  const chosenSiblings = siblings.slice(0, siblingRoom);
  const chosenKeys = new Set(chosenSiblings.map((hop) => hop.key));
  const rest = all.filter((hop) => !chosenKeys.has(hop.key))
    .sort((a, b) => b.hardCount - a.hardCount || b.edgeCount - a.edgeCount || a.domain.localeCompare(b.domain));
  const hops = [...chosenSiblings, ...rest.slice(0, Math.max(0, cap - chosenSiblings.length))];
  return { hops, truncated: hops.length < all.length, total: all.length };
}

function gatewayEdgesFor(homeTopics, hops, data) {
  const hopByKey = new Map(hops.map((hop) => [hop.key, hop]));
  const edges = [];
  const seen = new Set();
  const add = (from, to, strength) => {
    const id = `${from}|${to}|${strength}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ from, to, strength });
  };

  for (const topic of homeTopics) {
    for (const prereq of data.prereqsOf.get(topic.id) || []) {
      const other = data.byId.get(prereq.id);
      if (!other) continue;
      const hop = hopByKey.get(topicDomainKey(other));
      if (hop) add(domainHopId(hop.key), topic.id, prereq.strength);
    }
    for (const unlock of data.unlocksOf.get(topic.id) || []) {
      const other = data.byId.get(unlock.id);
      if (!other) continue;
      const hop = hopByKey.get(topicDomainKey(other));
      if (hop) add(topic.id, domainHopId(hop.key), unlock.strength);
    }
  }
  return edges;
}

export function buildSkillTree(domainNode, data, { neighborCap = MAX_DOMAIN_GATEWAYS, siblingDomains = [] } = {}) {
  const homeTopics = domainNode.topics || [];
  const local = localEdges(homeTopics, data.prereqsOf);
  const { hops, truncated, total } = collectDomainGateways(homeTopics, domainNode, data, {
    cap: neighborCap,
    siblingDomains,
  });
  const nodes = [
    ...homeTopics.map((topic) => ({
      id: topic.id,
      kind: 'topic',
      label: topic.name,
      topic,
    })),
    ...hops.map((hop) => ({
      id: domainHopId(hop.key),
      kind: 'hop',
      side: hop.side,
      label: hop.domain,
      sublabel: hop.subject === domainNode.subject ? 'Neighbour domain' : hop.subject,
      hop,
    })),
  ];
  const edges = [...local, ...gatewayEdgesFor(homeTopics, hops, data)];
  return {
    homeTopics,
    hops,
    nodes,
    edges,
    truncated,
    totalHops: total,
    layout: layeredDagLayout(nodes, edges, SKILL_TREE_LAYOUT),
  };
}
