import { getData, topicAge, subjectMeta } from '../data.js';
import { curriculumAge, curriculumBoost, learnerYear, rankByCurriculum, yearLabel } from '../curriculum.js';
import {
  blockingHardPrereqIds,
  buildSkillTree,
  buildWorldMap,
  curriculumTree,
  defaultDomain,
  findSubject,
  findDomain,
  findSection,
  learnerAfterEmit,
  localEdges,
  parseGraphHash,
  quietMasteryFill,
  resolveSkillNodeState,
  selectionForLearner,
  SKILL_STATE_CHROME,
  WORLD_MAP_VIEWBOX,
} from '../graph.js';
import * as store from '../store.js';
import { MASTERY, topicsMasteryStats, isUnlocked, blockingPrereqs } from '../mastery.js';
import { el, esc, refreshIcons, toast } from '../ui.js';
import { openLesson } from './lesson.js';
import { offerTeachingGuide } from './teachingguide.js';
import { gateAi } from '../ai-status.js';
import { openRecordForm } from './records.js';
import { GROWTH, growthChip, growthIcon, stageForSkillState, stageForStatus } from '../meadow.js';
import { countLabel, formatCount } from '../format.js';

// The selected skill lives in the hash (params.skill). The state below only
// makes it per learner and carries scroll and focus across re-renders.
let lastLearnerId; // undefined until the store first emits or the graph renders, so deep links keep their skill
let savedTreeScroll = null; // { key, skill, x, y, left, top } for the return from a topic page, consumed once
let afterSelect = null; // { key, focusId, reveal } set by a selection, applied by the next tree render
const pendingRestore = new WeakMap(); // scroller -> { target, after } its next frame applies

// Every graph history entry carries { id, learner } in history.state under
// GRAPH_ENTRY: the learner its ?skill= was chosen for, and an id for the
// window, tree and quest log scroll it was last seen at (entryScroll), so
// browser Back and Forward put the tree back the way it was left.
const GRAPH_ENTRY = 'harringtonGraph';
const entryScroll = new Map(); // entry id -> { key, skill, x, y, left, top, questTop }
const entryPrefix = Math.random().toString(36).slice(2, 8); // ids from an earlier page load never match
let entryCount = 0;

// A learner switch made away from the graph (the dashboard selector, say) is
// recorded here, so the next graph arrival compares against the new learner.
// The saved return scroll is keyed by learner, so it needs no reset here.
store.subscribe(() => {
  const active = store.activeStudent();
  const learnerId = active ? active.id : null;
  lastLearnerId = learnerAfterEmit(lastLearnerId, learnerId, parseGraphHash(window.location.hash) !== null);
});

window.addEventListener('scroll', recordEntryScroll, { passive: true });

export function renderGraph(params, { navigate }) {
  const active = store.activeStudent();
  params = applyLearnerSelection(params, active, navigate);
  const mode = store.graphView();
  const visual = mode === 'atlas';
  const root = el(`<div class="${visual ? 'max-w-[88rem]' : 'max-w-5xl'} mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  root.appendChild(viewToggleBar());

  if (!visual) {
    if (params.subject && params.domain && params.age) {
      root.appendChild(renderSection(params, active, navigate));
    } else if (params.subject && params.domain) {
      root.appendChild(renderDomain(params, active, navigate));
    } else if (params.subject) {
      root.appendChild(renderSubject(params, active, navigate));
    } else {
      root.appendChild(renderSubjects(active, navigate));
    }
  } else if (params.subject) {
    root.appendChild(renderSkillTree(params, active, navigate));
  } else {
    root.appendChild(renderWorldMap(params, active, navigate));
  }

  refreshIcons();
  return root;
}

// A learner switch drops the previous learner's selection; the route and the
// hash are rewritten in place so a later re-render does not bring it back.
// The selection belongs to the learner its history entry was stamped with, so
// Back to an entry made for another learner clears it too; a fresh entry
// (a link, a deep link) belongs to the learner the graph last saw.
function applyLearnerSelection(params, active, navigate) {
  const learnerId = active ? active.id : null;
  const entry = currentEntry();
  const owner = entry ? entry.learner : lastLearnerId;
  const result = selectionForLearner(params, owner, learnerId);
  lastLearnerId = learnerId;
  if (result.dropped) navigate('graph', result.params, { replace: true, render: false });
  stampEntry(entry, learnerId);
  return result.params;
}

function currentEntry() {
  const state = window.history.state;
  const entry = state && state[GRAPH_ENTRY];
  return entry && entry.id ? entry : null;
}

function stampEntry(entry, learner) {
  if (entry && entry.learner === learner) return;
  const id = entry ? entry.id : `${entryPrefix}-${(entryCount += 1)}`;
  window.history.replaceState({ ...(window.history.state || {}), [GRAPH_ENTRY]: { id, learner } }, '');
}

// Keeps the scroll of the tree on screen against its history entry. A tree
// whose restore is still pending reads 0,0, and once the address has moved on
// (Back or Forward, before the next render) the tree no longer owns it.
function recordEntryScroll() {
  const scroller = document.querySelector('.skill-tree-scroller');
  if (!scroller || !scroller.dataset.entry || pendingRestore.has(scroller)) return;
  if (window.location.hash !== scroller.dataset.hash) return;
  const log = document.querySelector('.quest-log');
  entryScroll.set(scroller.dataset.entry, {
    key: scroller.dataset.treeKey,
    skill: scroller.dataset.skill || null,
    x: window.scrollX,
    y: window.scrollY,
    left: scroller.scrollLeft,
    top: scroller.scrollTop,
    questTop: log ? log.scrollTop : 0,
  });
}

function treeKey(active, domainNode) {
  return `${active ? active.id : ''}|${domainNode.subject}|${domainNode.domain}`;
}

// What the tree currently on screen is showing, if it is the same tree.
// render() builds the new view before it swaps out the old one, so this still
// reads the live scroller on a selection change or a status write. A scroller
// whose restore has not run yet (two renders in one frame, such as a store
// emit right after a return) hands over that pending restore, window
// position, focus and reveal included, instead of its momentary 0,0.
// The quest log keeps its own scroll when it still shows the same skill.
function liveTree(key, skill) {
  const scroller = document.querySelector('.skill-tree-scroller');
  if (!scroller || scroller.dataset.treeKey !== key) return null;
  const pending = pendingRestore.get(scroller);
  if (pending) return pending;
  const log = document.querySelector('.quest-log');
  const questTop = log && skill && log.dataset.skillId === skill ? log.scrollTop : 0;
  return { target: { left: scroller.scrollLeft, top: scroller.scrollTop, questTop }, after: null };
}

function rememberTreeForReturn(key, skill) {
  const scroller = document.querySelector('.skill-tree-scroller');
  const log = document.querySelector('.quest-log');
  savedTreeScroll = {
    key,
    skill,
    x: window.scrollX,
    y: window.scrollY,
    left: scroller ? scroller.scrollLeft : 0,
    top: scroller ? scroller.scrollTop : 0,
    questTop: log ? log.scrollTop : 0,
  };
}

// target: { left, top, questTop } to keep the tree and the quest log where
// they were, plus { x, y } to put the window back too, or { centerOn } to
// bring a linked node into view. The scroller is still detached here, so
// everything waits for the frame, which runs before the first paint.
function restoreTreeScroll(scroller, target, after) {
  pendingRestore.set(scroller, { target, after });
  requestAnimationFrame(() => {
    pendingRestore.delete(scroller);
    if (!scroller.isConnected) return; // a newer render took over the restore
    const log = document.querySelector('.quest-log');
    if (target && target.centerOn) {
      const node = scroller.querySelector(`[data-skill-id="${CSS.escape(target.centerOn)}"]`);
      if (node) {
        scroller.scrollLeft = Math.max(0, node.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2);
        scroller.scrollTop = Math.max(0, node.offsetTop - (scroller.clientHeight - node.offsetHeight) / 2);
      }
    } else if (target) {
      if (target.y != null) window.scrollTo({ left: target.x, top: target.y, behavior: 'instant' });
      scroller.scrollLeft = target.left;
      scroller.scrollTop = target.top;
      if (log && target.questTop) log.scrollTop = target.questTop;
    }
    recordEntryScroll();
    if (!after) return;
    // Keyboard users keep their place: the re-render replaced the button.
    const node = after.focusId && scroller.querySelector(`[data-skill-id="${CSS.escape(after.focusId)}"]`);
    if (node) node.focus({ preventScroll: true });
    // A click low in a tall tree can leave the quest log off screen; bring it
    // in only then, so a visible quest log never moves the page.
    if (after.reveal && log) revealQuestLog(log);
  });
}

// The view fades up 8px as it mounts, so a box measured now sits lower than
// where it settles. Measure without that transform and scroll the window
// itself, so the quest log's top lands on its scroll-margin-top (below the
// phone top bar) once the fade ends.
function revealQuestLog(log) {
  const box = log.getBoundingClientRect();
  const shift = settledShift(log);
  const top = box.top - shift;
  const bottom = box.bottom - shift;
  if (bottom > 0 && top < window.innerHeight) return;
  const margin = parseFloat(getComputedStyle(log).scrollMarginTop) || 0;
  window.scrollTo({ left: window.scrollX, top: Math.max(0, window.scrollY + top - margin), behavior: 'instant' });
}

// How far the element's ancestors are translated down right now.
function settledShift(node) {
  let shift = 0;
  for (let at = node.parentElement; at; at = at.parentElement) {
    const transform = getComputedStyle(at).transform;
    if (transform && transform !== 'none') shift += new DOMMatrixReadOnly(transform).m42;
  }
  return shift;
}

function viewToggleBar() {
  const mode = store.graphView();
  const bar = el(`<div class="flex justify-end mb-4"></div>`);
  const group = el(`<div class="inline-flex rounded-xl border border-paper-line bg-paper-card p-0.5" role="group" aria-label="Curriculum view"></div>`);
  for (const item of [
    { id: 'atlas', label: 'Visual' },
    { id: 'list', label: 'List' },
  ]) {
    const on = mode === item.id;
    const btn = el(`<button type="button" class="px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${on ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'}">${item.label}</button>`);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.onclick = () => store.setGraphView(item.id);
    group.appendChild(btn);
  }
  bar.appendChild(group);
  return bar;
}

function openRealm(navigate, subjectNode, active, domainName = null) {
  const preferred = preferredAge(active);
  const domain = domainName
    ? subjectNode.domains.find((node) => node.domain === domainName)
    : defaultDomain(subjectNode, preferred);
  if (!domain) {
    navigate('graph', { subject: subjectNode.subject });
    return;
  }
  navigate('graph', { subject: subjectNode.subject, domain: domain.domain });
}

// The age whose domain opens first: the learner's Australian Curriculum year
// (as the usual age for it) when set, else their age.
function preferredAge(active) {
  return active ? curriculumAge(active, store.studentAge(active)) : null;
}

function skillStateFor(active, topicId, prereqsOf) {
  if (active) {
    const status = store.statusOf(active.id, topicId);
    if (status === 'mastered') return 'mastered';
    if (status === 'learning' || status === 'practicing') return 'in-progress';
    return isUnlocked(active.id, topicId) ? 'ready' : 'locked';
  }
  return resolveSkillNodeState(topicId, {}, prereqsOf);
}

function blockerIdsFor(active, topicId, prereqsOf) {
  if (active) return blockingPrereqs(active.id, topicId).map((edge) => edge.id);
  return blockingHardPrereqIds(topicId, {}, prereqsOf);
}

function renderWorldMap(params, active, navigate) {
  const wrap = el(`<div></div>`);
  const d = getData();
  const tree = curriculumTree();
  const scene = buildWorldMap(tree);

  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-[11px] uppercase tracking-[0.18em] text-ink-faint font-medium mb-1">World Map</p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">Curriculum realms</h1>
      <p class="text-ink-soft text-sm mt-1 max-w-2xl">${tree.length === 1 ? 'One subject' : `${formatCount(tree.length)} subjects`} as lands on a map, not a syllabus calendar. Open a realm to walk its skill tree. Quiet tints are for you; this is not a report card.</p>
      <p class="text-xs text-ink-faint mt-2">${countLabel(d.meta.topics, 'topic')} · ${countLabel(d.meta.dependencies, 'prerequisite link')} · ${d.meta.version}</p>
    </div>`));

  const stage = el(`<div class="world-map relative rounded-2xl border border-[#cfe0c6] overflow-hidden"></div>`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${WORLD_MAP_VIEWBOX.width} ${WORLD_MAP_VIEWBOX.height}`);
  svg.setAttribute('class', 'w-full h-auto world-map-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Curriculum world map of ${countLabel(scene.realms.length, 'subject realm')}`);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="parchment" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e3eff6"/>
      <stop offset="50%" stop-color="#e4eedf"/>
      <stop offset="100%" stop-color="#cfe0c6"/>
    </linearGradient>
    <filter id="realm-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#3f6b3b" flood-opacity="0.18"/>
    </filter>`;
  svg.appendChild(defs);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', String(WORLD_MAP_VIEWBOX.width));
  bg.setAttribute('height', String(WORLD_MAP_VIEWBOX.height));
  bg.setAttribute('fill', 'url(#parchment)');
  svg.appendChild(bg);

  for (let i = 0; i < 7; i += 1) {
    const contour = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    contour.setAttribute('cx', '550');
    contour.setAttribute('cy', '320');
    contour.setAttribute('rx', String(420 + i * 48));
    contour.setAttribute('ry', String(240 + i * 32));
    contour.setAttribute('fill', 'none');
    contour.setAttribute('stroke', '#a9c9a0');
    contour.setAttribute('stroke-width', '0.8');
    contour.setAttribute('opacity', '0.45');
    svg.appendChild(contour);
  }

  for (const realm of scene.realms) {
    const meta = subjectMeta(realm.subject);
    const stats = active ? topicsMasteryStats(active.id, tree.find((node) => node.subject === realm.subject)?.topics || []) : { pct: 0 };
    const fill = quietMasteryFill(meta.color, stats.pct, '#fffdf8');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'world-realm');
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `${realm.subject} realm, ${countLabel(realm.domainCount, 'domain')}`);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', realm.path);
    path.setAttribute('fill', fill);
    path.setAttribute('stroke', meta.color);
    path.setAttribute('stroke-width', '2.4');
    path.setAttribute('filter', 'url(#realm-glow)');
    path.style.cursor = 'pointer';
    const subjectNode = tree.find((node) => node.subject === realm.subject);
    path.addEventListener('click', () => openRealm(navigate, subjectNode, active));
    group.appendChild(path);

    for (const cluster of realm.clusters) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(cluster.x));
      dot.setAttribute('cy', String(cluster.y));
      dot.setAttribute('r', '5.5');
      dot.setAttribute('fill', meta.color);
      dot.setAttribute('fill-opacity', '0.55');
      dot.setAttribute('stroke', '#fffdf8');
      dot.setAttribute('stroke-width', '1.2');
      dot.style.cursor = 'pointer';
      dot.setAttribute('aria-label', cluster.domain);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = cluster.domain;
      dot.appendChild(title);
      dot.addEventListener('click', (event) => {
        event.stopPropagation();
        openRealm(navigate, subjectNode, active, cluster.domain);
      });
      group.appendChild(dot);
    }

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(realm.cx));
    label.setAttribute('y', String(realm.cy - 8));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'world-realm-label');
    label.setAttribute('fill', '#2e2a24');
    label.style.pointerEvents = 'none';
    label.textContent = realm.subject;
    group.appendChild(label);

    const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('x', String(realm.cx));
    sub.setAttribute('y', String(realm.cy + 12));
    sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('class', 'world-realm-sub');
    sub.setAttribute('fill', '#6f6b64');
    sub.style.pointerEvents = 'none';
    sub.textContent = countLabel(realm.domainCount, 'domain');
    group.appendChild(sub);

    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRealm(navigate, subjectNode, active);
      }
    });
    svg.appendChild(group);
  }

  stage.appendChild(svg);
  wrap.appendChild(stage);
  wrap.appendChild(el(`<p class="text-xs text-ink-faint mt-3">Dots inside a realm are domain clusters. Click a realm, or a cluster, to open that skill tree. Future skills stay visible once you are inside.</p>`));
  return wrap;
}

function renderSkillTree(params, active, navigate) {
  const wrap = el(`<div></div>`);
  const subjectNode = findSubject(params.subject);
  if (!subjectNode) return missing(wrap, navigate, 'Realm not found.');

  const preferred = preferredAge(active);
  const domainNode = params.domain
    ? findDomain(params.subject, params.domain)
    : defaultDomain(subjectNode, preferred);
  if (!domainNode) return missing(wrap, navigate, 'Domain not found.');

  const d = getData();
  const meta = subjectMeta(domainNode.subject);
  const siblingDomains = subjectNode.domains.map((node) => node.domain);
  const graph = buildSkillTree(domainNode, d, { siblingDomains });
  const homeIds = new Set(graph.homeTopics.map((topic) => topic.id));
  const selectedSkillId = params.skill && homeIds.has(params.skill) ? params.skill : null;
  const key = treeKey(active, domainNode);
  const live = liveTree(key, selectedSkillId);
  // The saved scroll belongs to one return trip: this tree with the skill
  // that was open when the parent left. Any other arrival drops it.
  const fits = (scroll) => scroll && scroll.key === key && scroll.skill === selectedSkillId;
  const saved = !live && fits(savedTreeScroll) ? savedTreeScroll : null;
  savedTreeScroll = null;
  // Back or Forward to an entry seen before puts it back as it was left.
  const entry = currentEntry();
  const visited = !live && !saved && entry && fits(entryScroll.get(entry.id)) ? entryScroll.get(entry.id) : null;
  let after = (afterSelect && afterSelect.key === key ? afterSelect : null) || (live && live.after);
  afterSelect = null;
  // A return to a selected skill puts focus back on it, without scrolling.
  if (!after && !live && (saved || visited) && selectedSkillId) after = { key, focusId: selectedSkillId, reveal: false };
  const here = { subject: domainNode.subject, domain: domainNode.domain };
  // Same tree, new selection: update in place, keep the page where it is.
  const select = (skill) => {
    afterSelect = { key, focusId: skill || selectedSkillId, reveal: !!skill };
    navigate('graph', skill ? { ...here, skill } : here, { preserveScroll: true, replace: true });
  };

  const selected = selectedSkillId ? d.byId.get(selectedSkillId) : null;
  const selectedState = selected ? skillStateFor(active, selected.id, d.prereqsOf) : null;
  const blockers = selected && selectedState === 'locked'
    ? blockerIdsFor(active, selected.id, d.prereqsOf)
    : [];
  const blockerSet = new Set(blockers);

  wrap.appendChild(crumbs([
    { label: 'World Map', go: () => navigate('graph') },
    { label: domainNode.subject, go: () => openRealm(navigate, subjectNode, active) },
    { label: domainNode.domain },
  ]));

  wrap.appendChild(el(`
    <div class="mb-4">
      <p class="text-[11px] uppercase tracking-[0.18em] text-ink-faint font-medium mb-1">Skill tree</p>
      <p class="text-xs font-medium mb-2 flex flex-wrap gap-1.5">
        <span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${esc(domainNode.subject)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">${esc(domainNode.domain)}</span>
      </p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(domainNode.domain)}</h1>
      <p class="text-ink-soft text-sm mt-1 leading-relaxed max-w-3xl">Skills, not weeks. Solid branches are required gates. Dashed branches help. Locked skills stay dim but visible so the road ahead is not hidden. Neighbour domains sit on the rim as gateways.</p>
      <button type="button" class="find-link mt-1 min-h-11 inline-flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:text-brand"><i data-lucide="search" class="w-4 h-4"></i>Find a topic</button>
    </div>`));
  wrap.querySelector('.find-link').onclick = () => navigate('find');

  wrap.appendChild(skillLegend());

  const stage = el(`<div class="skill-stage relative flex gap-0 rounded-2xl border border-paper-line bg-[#ebe4d4] overflow-hidden"></div>`);
  const scroller = renderSkillDag(graph, {
    navigate,
    color: meta.color,
    active,
    prereqsOf: d.prereqsOf,
    selectedId: selectedSkillId,
    blockerSet,
    onSelect: select,
  });
  scroller.dataset.treeKey = key;
  scroller.dataset.hash = window.location.hash;
  if (selectedSkillId) scroller.dataset.skill = selectedSkillId;
  if (entry) scroller.dataset.entry = entry.id;
  scroller.addEventListener('scroll', recordEntryScroll, { passive: true });
  stage.appendChild(scroller);
  const target = (live && live.target) || saved || visited || (selectedSkillId ? { centerOn: selectedSkillId } : null);
  restoreTreeScroll(scroller, target, after);
  if (selected) {
    stage.appendChild(renderQuestLog(selected, {
      active,
      navigate,
      prereqsOf: d.prereqsOf,
      unlocksOf: d.unlocksOf,
      byId: d.byId,
      state: selectedState,
      blockers,
      onSelect(topicId) {
        if (homeIds.has(topicId)) {
          select(topicId);
          return;
        }
        const other = d.byId.get(topicId);
        if (!other) return;
        navigate('graph', { subject: other.subject, domain: other.domain, skill: topicId });
      },
      onClose() {
        select(null);
      },
      onOpenTopic() {
        rememberTreeForReturn(key, selected.id);
      },
      onBackToTree() {
        const node = scroller.querySelector(`[data-skill-id="${CSS.escape(selected.id)}"]`);
        if (!node) return;
        node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        node.focus({ preventScroll: true });
      },
    }));
  }
  wrap.appendChild(stage);

  if (graph.truncated) {
    wrap.appendChild(el(`<p class="text-xs text-ink-faint mt-2">Showing ${graph.hops.length} of ${graph.totalHops} connected domains as gateways.</p>`));
  }
  return wrap;
}

function skillLegend() {
  const items = [
    ['locked', 'Locked'],
    ['ready', 'Ready'],
    ['in-progress', 'In progress'],
    ['mastered', 'Mastered'],
  ];
  const row = el(`<div class="flex flex-wrap items-center gap-3 text-[11px] text-ink-soft mb-3"></div>`);
  for (const [id, label] of items) {
    const chrome = SKILL_STATE_CHROME[id];
    const stage = stageForSkillState(id);
    row.appendChild(el(`<span class="inline-flex items-center gap-1.5">${growthIcon(stage, 22)}<span><span class="font-600" style="color:${GROWTH[stage].color}">${GROWTH[stage].label}</span> · ${label}</span></span>`));
  }
  row.appendChild(el(`<span class="inline-flex items-center gap-1.5 ml-1"><span class="w-6 border-t-2 border-ink/70"></span>Required</span>`));
  row.appendChild(el(`<span class="inline-flex items-center gap-1.5"><span class="w-6 border-t-2 border-dashed border-ink-faint"></span>Helpful</span>`));
  return row;
}

function renderSkillDag(graph, { navigate, color, active, prereqsOf, selectedId, blockerSet, onSelect }) {
  const { layout, edges } = graph;
  const scroller = el(`<div class="dag-scroller skill-tree-scroller relative flex-1 min-w-0 overflow-auto"></div>`);
  const inner = el(`<div class="relative" style="width:${Math.max(layout.width, 320)}px;height:${Math.max(layout.height, 240)}px"></div>`);
  const pos = Object.fromEntries(layout.nodes.map((node) => [node.id, node]));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'absolute inset-0 pointer-events-none');
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('aria-hidden', 'true');

  for (const edge of edges) {
    const from = pos[edge.from];
    const to = pos[edge.to];
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(from, to));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', edge.strength === 'hard' ? color : '#6f665a');
    path.setAttribute('stroke-width', edge.strength === 'hard' ? '2.2' : '1.5');
    path.setAttribute('stroke-linecap', 'round');
    if (edge.strength !== 'hard') path.setAttribute('stroke-dasharray', '6 5');
    svg.appendChild(path);
  }
  inner.appendChild(svg);

  for (const node of layout.nodes) {
    if (node.kind === 'hop') {
      const btn = el(`<button type="button" class="skill-gateway absolute text-left" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;border-color:${color}99">
        <span class="block text-xs font-600 leading-tight clamp-2">${esc(node.label)}</span>
        <span class="block text-[10px] text-ink-faint mt-0.5">${esc(node.sublabel)}</span>
      </button>`);
      btn.setAttribute('title', `${node.label} — expand this domain`);
      btn.onclick = () => navigate('graph', { subject: node.hop.subject, domain: node.hop.domain });
      inner.appendChild(btn);
    } else {
      const topic = node.topic;
      const state = skillStateFor(active, topic.id, prereqsOf);
      const chrome = SKILL_STATE_CHROME[state];
      const selected = topic.id === selectedId;
      const blocking = blockerSet.has(topic.id);
      const stage = stageForSkillState(state);
      const btn = el(`<button type="button" class="skill-node absolute ${selected ? 'is-selected' : ''} ${blocking ? 'is-blocking' : ''}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px" title="${esc(topic.name)} · ${GROWTH[stage].label} · ${chrome.label}">
        <span class="skill-orb skill-orb-state-${state}" style="background:${chrome.fill};box-shadow:0 0 0 ${selected ? 4 : 2}px ${chrome.ring}${state === 'ready' ? ', 0 0 16px rgba(47,98,133,0.45)' : state === 'mastered' ? ', 0 0 0 2px #cfe0c6' : ''}">
          <span class="w-10 h-10 rounded-full bg-paper-card flex items-center justify-center">${growthIcon(stage, 30)}</span>
        </span>
        <span class="skill-node-label">${esc(topic.name)}</span>
      </button>`);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      btn.setAttribute('data-skill-state', state);
      btn.setAttribute('data-skill-id', topic.id);
      if (state === 'locked') btn.setAttribute('aria-description', 'Locked. Foundations needed.');
      btn.onclick = () => onSelect(topic.id);
      inner.appendChild(btn);
    }
  }

  scroller.appendChild(inner);
  return scroller;
}

function edgePath(from, to) {
  const fromH = from.orb ? from.orb : from.height;
  const toH = to.orb ? to.orb : to.height;
  const x1 = from.x + (from.orb || from.width);
  const y1 = from.y + fromH / 2;
  const x2 = to.x;
  const y2 = to.y + toH / 2;
  const dx = Math.max(36, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function renderQuestLog(topic, { active, navigate, prereqsOf, unlocksOf, byId, state, blockers, onSelect, onClose, onOpenTopic, onBackToTree }) {
  const chrome = SKILL_STATE_CHROME[state];
  const panel = el(`<aside class="quest-log shrink-0 bg-paper-card border-l border-paper-line overflow-y-auto" aria-label="Quest log"></aside>`);
  panel.dataset.skillId = topic.id;
  panel.addEventListener('scroll', recordEntryScroll, { passive: true });
  const locked = state === 'locked';
  const ready = state === 'ready';
  const mastered = state === 'mastered';
  const hardPrereqs = (prereqsOf.get(topic.id) || []).filter((edge) => edge.strength === 'hard');
  const unlocks = (unlocksOf.get(topic.id) || [])
    .map((edge) => {
      const other = byId.get(edge.id);
      return other ? { ...edge, topic: other } : null;
    })
    .filter(Boolean);

  const why = locked
    ? `Foundations needed. ${countLabel(blockers.length, 'required skill')} still ${blockers.length === 1 ? 'sits' : 'sit'} in front of this one. It is not ready.`
    : ready
      ? 'Ready. Every required foundation is mastered, so this skill can be treated as open.'
      : mastered
        ? 'Mastered. This gate is open for skills that depend on it.'
        : 'In progress. Learning has started; mastery still uses the existing topic test.';

  // Phones stack the quest log under a tall tree; this takes the parent back
  // up to the selected node. Hidden where the log sits beside the tree.
  const back = el(`<button type="button" class="quest-back-to-tree items-center gap-1.5 min-h-11 mx-4 mt-3 px-3 py-1.5 rounded-full border border-paper-line bg-paper text-xs font-medium text-ink-soft hover:text-ink"><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>Back to tree</button>`);
  back.onclick = onBackToTree;
  panel.appendChild(back);

  panel.appendChild(el(`
    <div class="p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <p class="text-[11px] uppercase tracking-[0.16em] text-ink-faint font-medium">Quest log</p>
          <h2 class="font-display text-xl font-600 leading-tight mt-1">${esc(topic.name)}</h2>
        </div>
        <button type="button" class="quest-close text-ink-faint hover:text-ink p-1" aria-label="Close quest log"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <p class="mb-3">${growthChip(stageForSkillState(state), chrome.label)}</p>
      <p class="text-sm text-ink-soft leading-relaxed">${esc(topic.description || 'A demonstrable skill in this domain.')}</p>
    </div>`));

  panel.querySelector('.quest-close').onclick = onClose;

  const body = el(`<div class="px-4 sm:px-5 pb-5 space-y-4"></div>`);

  if (locked) {
    body.appendChild(el(`<div class="rounded-xl border border-[#f3b7a8] bg-[#fbe5de] p-3.5">
      <p class="font-600 text-sm text-[#8e3a2f] flex items-center gap-1.5"><i data-lucide="lock" class="w-4 h-4"></i>Foundations needed</p>
      <p class="text-sm text-[#8a6412] mt-1 leading-relaxed">${esc(why)}</p>
    </div>`));
  } else {
    body.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed">${esc(why)}</p>`));
  }

  if (hardPrereqs.length) {
    const box = el(`<div><p class="text-xs font-600 text-ink mb-2">Required foundations</p><div class="flex flex-wrap gap-1.5"></div></div>`);
    const chips = box.querySelector('div');
    for (const edge of hardPrereqs) {
      const other = byId.get(edge.id);
      if (!other) continue;
      const blocked = blockers.includes(edge.id);
      const chip = el(`<button type="button" class="px-2 py-1 rounded-full border text-xs ${blocked ? 'border-[#f3b7a8] bg-[#fbe5de] text-[#8e3a2f]' : 'border-paper-line text-ink-soft'}">${esc(other.name)}</button>`);
      chip.onclick = () => onSelect(other.id);
      chips.appendChild(chip);
    }
    body.appendChild(box);
  }

  if (unlocks.length) {
    const box = el(`<div><p class="text-xs font-600 text-ink mb-2">What this unlocks</p><div class="flex flex-wrap gap-1.5"></div></div>`);
    const chips = box.querySelector('div');
    for (const edge of unlocks.slice(0, 8)) {
      const chip = el(`<button type="button" class="px-2 py-1 rounded-full border border-paper-line text-xs text-ink-soft">${esc(edge.topic.name)}</button>`);
      chip.onclick = () => onSelect(edge.topic.id);
      chips.appendChild(chip);
    }
    if (unlocks.length > 8) chips.appendChild(el(`<span class="text-xs text-ink-faint">+${unlocks.length - 8} more</span>`));
    body.appendChild(box);
  }

  body.appendChild(el(`<p class="text-[11px] text-ink-faint">Parent view only. Mastery comes from the 90% topic test or your own judgment, not a new score.</p>`));

  const actions = el(`<div class="space-y-2"></div>`);
  const lesson = el(`<button type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm"><i data-lucide="book-open-text" class="w-4 h-4"></i>Open full lesson</button>`);
  lesson.onclick = () => openLesson(topic);
  actions.appendChild(gateAi(lesson, { capability: 'lesson', cachedKey: 'topic:' + topic.id }));
  if (!store.aiAvailable('lesson')) offerTeachingGuide(topic, btn => actions.prepend(btn), { navigate });

  const deep = el(`<button type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink font-medium text-sm hover:border-brand/40"><i data-lucide="panel-right" class="w-4 h-4"></i>Open topic page</button>`);
  deep.onclick = () => {
    onOpenTopic();
    navigate('topic', { id: topic.id });
  };
  actions.appendChild(deep);

  if (active) {
    const evidence = el(`<button type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink font-medium text-sm hover:border-brand/40"><i data-lucide="clipboard-pen" class="w-4 h-4"></i>Record evidence</button>`);
    evidence.onclick = () => openRecordForm(active.id, topic);
    actions.appendChild(evidence);

    if (locked) {
      const blocked = el(`<button type="button" disabled class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink-faint text-sm cursor-not-allowed"><i data-lucide="lock" class="w-4 h-4"></i>Not ready to mark as learning</button>`);
      actions.appendChild(blocked);
    } else if (!mastered) {
      const row = el(`<div class="grid grid-cols-2 gap-2"></div>`);
      const mark = el(`<button type="button" class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-brand/30 text-brand-dark font-medium text-sm hover:bg-brand-light/60"><i data-lucide="sprout" class="w-4 h-4"></i>${state === 'in-progress' ? 'Keep as learning' : 'Mark as learning'}</button>`);
      mark.onclick = () => {
        store.setStatus(active.id, topic.id, 'learning');
        toast(`Marked as learning`, 'success');
      };
      row.appendChild(mark);
      const master = el(`<button type="button" class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-brand/30 text-brand-dark font-medium text-sm hover:bg-brand-light/60"><i data-lucide="badge-check" class="w-4 h-4"></i>Mark as mastered</button>`);
      master.onclick = () => {
        store.setStatus(active.id, topic.id, 'mastered');
        toast(`Marked as mastered`, 'success');
      };
      row.appendChild(master);
      actions.appendChild(row);
    }
  }

  body.appendChild(actions);
  panel.appendChild(body);
  return panel;
}

function renderSubjects(active, navigate) {
  const wrap = el(`<div></div>`);
  const d = getData();
  wrap.appendChild(el(`
    <div class="mb-6">
      <h1 class="font-display text-2xl sm:text-3xl font-600">Curriculum list</h1>
      <p class="text-ink-soft text-sm mt-1">The full Marble map as cards. Start at a subject and keep drilling in. Mastery stays in the parent view.</p>
      <p class="text-xs text-ink-faint mt-2">${countLabel(d.meta.topics, 'topic')} · ${countLabel(d.meta.dependencies, 'prerequisite link')} · ${d.meta.version}</p>
    </div>`));

  const grid = el(`<div class="grid sm:grid-cols-2 gap-3"></div>`);
  for (const node of curriculumTree()) {
    const meta = subjectMeta(node.subject);
    const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
    const card = el(`<button class="text-left bg-paper-card border border-paper-line rounded-2xl p-4 card-hover">
      <span class="flex items-center gap-3 mb-3">
        <span class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:${meta.color}"><i data-lucide="${meta.icon}" class="w-5 h-5 text-white"></i></span>
        <span class="min-w-0">
          <span class="block font-600">${esc(node.subject)}</span>
          <span class="block text-xs text-ink-faint">${countLabel(node.domains.length, 'domain')} · ${countLabel(node.topics.length, 'topic')}</span>
        </span>
      </span>
      ${parentMastery(stats)}
    </button>`);
    card.onclick = () => navigate('graph', { subject: node.subject });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderSubject(params, active, navigate) {
  const node = findSubject(params.subject);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Subject not found.');

  const meta = subjectMeta(node.subject);
  const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
  wrap.appendChild(crumbs([
    { label: 'Curriculum', go: () => navigate('graph') },
    { label: node.subject },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <div class="flex items-center gap-2 mb-2">
        <span class="w-9 h-9 rounded-xl flex items-center justify-center" style="background:${meta.color}"><i data-lucide="${meta.icon}" class="w-4.5 h-4.5 text-white"></i></span>
        <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(node.subject)}</h1>
      </div>
      <p class="text-ink-soft text-sm">Domains in this subject. Open one to see its age-banded sections and the topics inside them.</p>
      <div class="mt-3">${parentMastery(stats)}</div>
    </div>`));

  const list = el(`<div class="space-y-2.5"></div>`);
  for (const domain of node.domains) {
    const domainStats = active ? topicsMasteryStats(active.id, domain.topics) : { mastered: 0, total: domain.topics.length, pct: 0 };
    const row = el(`<button class="w-full text-left bg-paper-card border border-paper-line rounded-2xl p-4 hover:border-brand/40 transition-colors">
      <span class="flex items-start justify-between gap-3">
        <span>
          <span class="block font-600">${esc(domain.domain)}</span>
          <span class="block text-xs text-ink-faint mt-1">${countLabel(domain.sections.length, 'age band')} · ${countLabel(domain.topics.length, 'topic')}</span>
        </span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 mt-1"></i>
      </span>
      <span class="block mt-3">${parentMastery(domainStats)}</span>
    </button>`);
    row.onclick = () => navigate('graph', { subject: node.subject, domain: domain.domain });
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderDomain(params, active, navigate) {
  const node = findDomain(params.subject, params.domain);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Domain not found.');

  const meta = subjectMeta(node.subject);
  const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
  wrap.appendChild(crumbs([
    { label: 'Curriculum', go: () => navigate('graph') },
    { label: node.subject, go: () => navigate('graph', { subject: node.subject }) },
    { label: node.domain },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-xs font-medium mb-2"><span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${esc(node.subject)}</span></p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(node.domain)}</h1>
      <p class="text-ink-soft text-sm mt-1">Each band is a teachable section: one domain at one age. Open a band to see its topics and how they connect.</p>
      <div class="mt-3">${parentMastery(stats)}</div>
    </div>`));

  const list = el(`<div class="space-y-2.5"></div>`);
  for (const section of node.sections) {
    const sectionStats = active ? topicsMasteryStats(active.id, section.topics) : { mastered: 0, total: section.topics.length, pct: 0 };
    const row = el(`<button class="w-full text-left bg-paper-card border border-paper-line rounded-2xl p-4 hover:border-brand/40 transition-colors">
      <span class="flex items-start justify-between gap-3">
        <span>
          <span class="block font-600">Age ${esc(section.age)}</span>
          <span class="block text-sm text-ink-soft mt-1 leading-relaxed">${esc(section.summary || `${countLabel(section.topics.length, 'topic')} in this band.`)}</span>
        </span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 mt-1"></i>
      </span>
      <span class="block mt-3">${parentMastery(sectionStats)}</span>
    </button>`);
    row.onclick = () => navigate('graph', { subject: node.subject, domain: node.domain, age: section.age });
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderSection(params, active, navigate) {
  const node = findSection(params.subject, params.domain, params.age);
  const wrap = el(`<div></div>`);
  if (!node) return missing(wrap, navigate, 'Section not found.');

  const d = getData();
  const meta = subjectMeta(node.subject);
  const stats = active ? topicsMasteryStats(active.id, node.topics) : { mastered: 0, total: node.topics.length, pct: 0 };
  const edges = localEdges(node.topics, d.prereqsOf);

  wrap.appendChild(crumbs([
    { label: 'Curriculum', go: () => navigate('graph') },
    { label: node.subject, go: () => navigate('graph', { subject: node.subject }) },
    { label: node.domain, go: () => navigate('graph', { subject: node.subject, domain: node.domain }) },
    { label: `Age ${node.age}` },
  ]));
  wrap.appendChild(el(`
    <div class="mb-5">
      <p class="text-xs font-medium mb-2 flex flex-wrap gap-1.5">
        <span class="px-2.5 py-1 rounded-full text-white" style="background:${meta.color}">${esc(node.subject)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">${esc(node.domain)}</span>
        <span class="px-2.5 py-1 rounded-full bg-paper-card border border-paper-line text-ink-soft">Age ${esc(node.age)}</span>
      </p>
      <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(node.domain)}</h1>
      <p class="text-ink-soft text-sm mt-1 leading-relaxed">${esc(node.summary || 'Topics in this section, with the prerequisite links that stay inside the band.')}</p>
      <div class="mt-3">${parentMastery(stats)}</div>
    </div>`));

  if (edges.length) {
    wrap.appendChild(el(`<div class="rounded-xl bg-brand-light/40 border border-brand/20 p-3.5 mb-5 text-xs text-ink-soft leading-relaxed">
      <span class="font-600 text-ink">${edges.length} connection${edges.length === 1 ? '' : 's'} inside this section.</span>
      Switch to Visual to see the skill tree. Hard links are required before a mastery claim; soft links are helpful.
    </div>`));
  }

  const list = el(`<div class="space-y-2.5"></div>`);
  // Topics linked to the learner's curriculum year (and unmastered ones at
  // the year below) first; the rest keep their order.
  const year = learnerYear(active);
  const ctx = { year, index: d.standards?.index || null, mastered: (id) => !!active && store.statusOf(active.id, id) === 'mastered' };
  for (const topic of rankByCurriculum(node.topics, ctx)) {
    const status = active ? store.statusOf(active.id, topic.id) : 'none';
    const linked = year && curriculumBoost(topic, ctx) === 2 ? ` · linked to ${esc(yearLabel(year))}` : '';
    const listStage = stageForStatus(status, active ? isUnlocked(active.id, topic.id) : false);
    const prereqs = (d.prereqsOf.get(topic.id) || []).map((edge) => {
      const other = d.byId.get(edge.id);
      return other ? { ...edge, topic: other } : null;
    }).filter(Boolean);
    const unlockCount = (d.unlocksOf.get(topic.id) || []).length;
    const row = el(`<button class="w-full text-left bg-paper-card border border-paper-line rounded-2xl p-4 hover:border-brand/40 transition-colors">
      <span class="flex items-start gap-3">
        <span class="mt-0.5" title="${GROWTH[listStage].label} · ${MASTERY[status].label}">${growthIcon(listStage, 26)}</span>
        <span class="min-w-0 flex-1">
          <span class="block font-600">${esc(topic.name)}</span>
          <span class="block text-sm text-ink-soft mt-1 leading-relaxed">${esc(topic.description || '')}</span>
          <span class="block text-xs text-ink-faint mt-2"><span class="font-600" style="color:${GROWTH[listStage].color}">${GROWTH[listStage].label}</span> · ${MASTERY[status].label} · ages ${esc(topic.ageRangeStart)}–${esc(topic.ageRangeEnd)}${linked}${unlockCount ? ` · unlocks ${unlockCount}` : ''}</span>
          ${prereqLine(prereqs)}
        </span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-ink-faint shrink-0 mt-1"></i>
      </span>
    </button>`);
    row.onclick = () => navigate('topic', { id: topic.id });
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function prereqLine(prereqs) {
  if (!prereqs.length) return '';
  const chips = prereqs.slice(0, 4).map((edge) => {
    const tone = edge.strength === 'hard' ? 'border-[#f3b7a8] text-[#8e3a2f]' : 'border-paper-line text-ink-soft';
    return `<span class="px-2 py-0.5 rounded-full border ${tone}">${edge.strength === 'hard' ? 'needs' : 'helped by'} ${esc(edge.topic.name)}</span>`;
  }).join('');
  const extra = prereqs.length > 4 ? `<span class="text-ink-faint">+${prereqs.length - 4} more</span>` : '';
  return `<span class="flex flex-wrap gap-1.5 mt-2">${chips}${extra}</span>`;
}

function parentMastery(stats) {
  const width = Math.max(0, Math.min(100, stats.pct));
  return `<span class="block">
    <span class="flex items-center justify-between text-[11px] text-ink-faint mb-1">
      <span>Parent view</span>
      <span>${formatCount(stats.mastered)} of ${formatCount(stats.total)} mastered</span>
    </span>
    <span class="block h-1.5 rounded-full bg-paper-line overflow-hidden"><span class="block h-full rounded-full bg-brand" style="width:${width}%"></span></span>
  </span>`;
}

function crumbs(items) {
  const nav = el(`<nav class="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft mb-4"></nav>`);
  items.forEach((item, index) => {
    if (index) nav.appendChild(el(`<i data-lucide="chevron-right" class="w-3.5 h-3.5 text-ink-faint"></i>`));
    if (item.go) {
      const btn = el(`<button class="hover:text-ink">${esc(item.label)}</button>`);
      btn.onclick = item.go;
      nav.appendChild(btn);
    } else {
      nav.appendChild(el(`<span class="text-ink font-medium">${esc(item.label)}</span>`));
    }
  });
  return nav;
}

function missing(wrap, navigate, message) {
  wrap.appendChild(el(`<p class="text-ink-soft mb-4">${message}</p>`));
  const back = el(`<button class="text-sm font-medium text-brand-dark">Back to curriculum</button>`);
  back.onclick = () => navigate('graph');
  wrap.appendChild(back);
  return wrap;
}

// Used by the topic page so a parent returns to the matching graph section,
// with the topic still selected in the skill tree.
export function graphParamsForTopic(topic) {
  return {
    subject: topic.subject,
    domain: topic.domain,
    age: topicAge(topic),
    skill: topic.id,
  };
}
