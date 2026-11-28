// Australian Curriculum coverage (#coverage, reached from Records): for one
// year level, each content description with its linked topics and a status
// taken from this family's own records (curriculum.js coverageReport). It
// lives under Records because it is a reading of the records, and prints as
// registration evidence. The wording stays evidence-based: a status says
// what is recorded, never that a content description is achieved.
import { getData, standardsPending } from '../data.js';
import * as store from '../store.js';
import { el, esc, refreshIcons } from '../ui.js';
import { countLabel } from '../format.js';
import {
  ACARA_NOTICE, ALIGNMENT_CREDIT, COVERAGE_STATUSES, CURRICULUM_NAME, EVIDENCE_LABELS, YEARS,
  coverageReport, learnerYear, normalizeYear, topicEvidence, yearForAge, yearLabel, yearsLabel,
} from '../curriculum.js';

const STATUS_TONE = {
  mastered: 'bg-brand text-white',
  evidence: 'bg-[#fbecc4] text-[#6b4d0e]',
  'not-yet': 'bg-paper-deep text-ink-soft',
};

// Learning areas the parent opened, kept across re-renders.
const openAreas = new Set();

export function renderCoverage(params, { navigate }) {
  const d = getData();
  const active = store.activeStudent();
  const root = el(`<div class="coverage-report max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);
  const back = el(`<button class="no-print flex items-center gap-1.5 min-h-11 text-sm text-ink-soft hover:text-ink mb-2"><i data-lucide="arrow-left" class="w-4 h-4"></i>Back to Records</button>`);
  back.onclick = () => navigate('records');
  root.appendChild(back);

  if (!active) {
    root.appendChild(el(`<p class="text-ink-soft">Add a student to see their ${esc(CURRICULUM_NAME)} coverage.</p>`));
    return root;
  }
  const saved = learnerYear(active);
  const year = normalizeYear(params.id) || saved || yearForAge(store.studentAge(active)) || 'F';
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  root.appendChild(el(`<div class="mb-5">
    <p class="text-[11px] uppercase tracking-[0.18em] text-ink-faint font-medium mb-1">Records</p>
    <h1 class="font-display text-2xl sm:text-3xl font-600">${esc(CURRICULUM_NAME)} coverage</h1>
    <p class="text-ink-soft text-sm mt-1 [overflow-wrap:anywhere]"><span class="font-600 text-ink">${esc(active.name)}</span> · ${esc(yearLabel(year))} · version 9 content descriptions</p>
  </div>`));

  const controls = el(`<div class="no-print flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
    <div class="flex-1 min-w-0">
      <label for="cov-year" class="text-sm font-medium block mb-1.5">Year level</label>
      <select id="cov-year" class="w-full sm:w-64 min-h-11 px-3.5 rounded-xl border border-paper-line bg-paper text-sm">${YEARS.map(y => `<option value="${esc(y)}" ${y === year ? 'selected' : ''}>${esc(yearLabel(y))}${y === saved ? ` (${esc(active.name)}'s year)` : ''}</option>`).join('')}</select>
    </div>
    <button id="cov-print" type="button" class="min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium"><i data-lucide="printer" class="w-4 h-4"></i>Print report</button>
  </div>`);
  controls.querySelector('#cov-year').onchange = (e) => navigate('coverage', e.target.value === saved ? {} : { id: e.target.value }, { replace: true });
  controls.querySelector('#cov-print').onclick = () => window.print();
  root.appendChild(controls);
  if (!saved) {
    root.appendChild(el(`<p class="no-print text-xs text-ink-faint -mt-2 mb-4 [overflow-wrap:anywhere]">${esc(active.name)} has no ${esc(CURRICULUM_NAME)} year set, so this shows the year that usually fits their age. Set one under Students &gt; Edit to order topics by it.</p>`));
  }

  root.appendChild(el(`<p class="text-sm text-ink-soft leading-relaxed mb-5 [overflow-wrap:anywhere]">Each status comes from ${esc(active.name)}'s records in Harrington. <span class="font-600 text-ink">Linked topics mastered</span>: every linked topic is marked mastered. <span class="font-600 text-ink">Evidence</span>: at least one linked topic has a record (such as an observation), a passed check or challenge, or practice. A saved lesson is a plan, not evidence, so it does not count. <span class="font-600 text-ink">Not yet</span>: nothing recorded for a linked topic. The links between topics and content descriptions are a map from the Marble Skill Taxonomy, not a certificate; a status describes recorded evidence, not a judgment that a content description has been met.</p>`));

  const body = el(`<div class="cov-body"></div>`);
  root.appendChild(body);

  // The list loads after the app starts (data.js loadStandards); the app
  // renders again when it arrives or fails.
  if (!d.standards) {
    body.appendChild(el(standardsPending()
      ? `<p class="cov-loading text-sm text-ink-soft">Loading the ${esc(CURRICULUM_NAME)} list…</p>`
      : `<div class="rounded-2xl border border-paper-line bg-paper-card p-4 text-sm text-ink-soft">The ${esc(CURRICULUM_NAME)} list could not be loaded from the curriculum data on this server. Check that the server can reach the taxonomy, then reload.</div>`));
    return root;
  }

  body.appendChild(reportBody(d, active, year, navigate));

  root.appendChild(el(`<footer class="cov-footer mt-8 pt-4 border-t border-paper-line text-xs text-ink-faint leading-relaxed space-y-2">
    <p class="font-medium text-ink-soft">Generated from Harrington records on ${esc(today)}; ${esc(ALIGNMENT_CREDIT)}.</p>
    <p class="cov-notice">${esc(ACARA_NOTICE)}</p>
  </footer>`));
  refreshIcons();
  return root;
}

function reportBody(d, active, year, navigate) {
  const evidenceSources = {
    records: store.recordsFor(active.id),
    tests: store.testsFor(active.id),
    challenges: store.challengesFor(active.id),
    practice: store.get().practice?.[active.id] || {},
  };
  const memo = new Map();
  const evidenceOf = (id) => {
    if (!memo.has(id)) memo.set(id, topicEvidence(id, evidenceSources));
    return memo.get(id);
  };
  const report = coverageReport({
    year, standards: d.standards.list, topics: d.topics,
    statusOf: (id) => store.statusOf(active.id, id), evidenceOf,
  });
  const wrap = el(`<div></div>`);
  if (!report.areas.length) {
    wrap.appendChild(el(`<p class="text-sm text-ink-soft">No content descriptions at ${esc(yearLabel(year))} in the curriculum data.</p>`));
    return wrap;
  }

  const summary = el(`<section aria-label="Counts by learning area" class="cov-summary rounded-2xl border border-paper-line bg-paper-card p-4 mb-5">
    <h2 class="font-600 mb-1">${esc(yearLabel(year))}: ${esc(countLabel(report.counts.total, 'content description'))}</h2>
    <p class="text-xs text-ink-soft mb-3">${esc(statusCounts(report.counts))}</p>
    <table class="w-full text-sm">
      <thead><tr class="text-left text-xs text-ink-faint"><th class="font-medium py-1 pr-2">Learning area</th><th class="font-medium py-1 px-1 text-right">Linked topics mastered</th><th class="font-medium py-1 px-1 text-right">Evidence</th><th class="font-medium py-1 pl-1 text-right">Not yet</th></tr></thead>
      <tbody>${report.areas.map(a => `<tr class="border-t border-paper-line"><td class="py-1.5 pr-2">${esc(a.learningArea)} <span class="text-ink-faint">(${esc(a.counts.total)})</span></td><td class="py-1.5 px-1 text-right">${esc(a.counts.mastered)}</td><td class="py-1.5 px-1 text-right">${esc(a.counts.evidence)}</td><td class="py-1.5 pl-1 text-right">${esc(a.counts['not-yet'])}</td></tr>`).join('')}</tbody>
    </table>
  </section>`);
  wrap.appendChild(summary);

  for (const area of report.areas) wrap.appendChild(areaSection(area, navigate));
  return wrap;
}

const statusCounts = (c) => `${c.mastered} with linked topics mastered · ${c.evidence} with evidence · ${c['not-yet']} not yet`;

function areaSection(area, navigate) {
  const key = area.learningArea;
  const open = openAreas.has(key);
  const id = `cov-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const section = el(`<section class="cov-area rounded-2xl border border-paper-line bg-paper-card mb-3" aria-labelledby="${esc(id)}-h">
    <h2 id="${esc(id)}-h" class="m-0">
      <button type="button" class="cov-toggle w-full min-h-11 flex items-center gap-3 text-left px-4 py-3" aria-expanded="${esc(open)}" aria-controls="${esc(id)}">
        <span class="flex-1 min-w-0">
          <span class="block font-600">${esc(key)}</span>
          <span class="block text-xs text-ink-soft mt-0.5">${esc(countLabel(area.counts.total, 'content description'))} · ${esc(statusCounts(area.counts))}</span>
        </span>
        <i data-lucide="chevron-down" class="no-print w-4 h-4 text-ink-faint shrink-0 transition-transform ${open ? 'rotate-180' : ''}"></i>
      </button>
    </h2>
    <ul id="${esc(id)}" class="cov-list ${open ? '' : 'hidden'} divide-y divide-paper-line border-t border-paper-line"></ul>
  </section>`);
  section.querySelector('.cov-toggle').onclick = () => {
    if (openAreas.has(key)) openAreas.delete(key); else openAreas.add(key);
    const now = openAreas.has(key);
    section.querySelector('.cov-toggle').setAttribute('aria-expanded', String(now));
    section.querySelector('.cov-list').classList.toggle('hidden', !now);
    section.querySelector('.cov-toggle svg, .cov-toggle i')?.classList.toggle('rotate-180', now);
  };
  const list = section.querySelector('ul');
  for (const item of area.standards) list.appendChild(standardItem(item, navigate));
  return section;
}

function standardItem({ standard: s, topics, status, evidence }, navigate) {
  const li = el(`<li class="cov-item px-4 py-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-600 text-ink">${esc(s.code)}</span>
      <span class="text-xs text-ink-faint">${esc(yearsLabel(s.yearLevels))} · ${s.subject && s.subject !== s.learningArea ? `${esc(s.subject)} · ` : ''}${esc(s.strand)}</span>
      <span class="cov-status ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${esc(STATUS_TONE[status])}" title="${esc(COVERAGE_STATUSES[status].hint)}">${esc(COVERAGE_STATUSES[status].label)}</span>
    </div>
    <p class="text-sm text-ink mt-1 leading-relaxed">${esc(s.description || s.title)}</p>
    ${evidence.length ? `<p class="text-xs text-ink-soft mt-1">Recorded: ${esc(evidence.map(k => EVIDENCE_LABELS[k] || k).join(', '))}</p>` : ''}
    <div class="cov-topics mt-1.5 text-xs text-ink-soft"></div>
  </li>`);
  const holder = li.querySelector('.cov-topics');
  if (!topics.length) {
    holder.textContent = 'No Harrington topic is linked to this content description yet.';
    return li;
  }
  holder.appendChild(el(`<span class="text-ink-faint">Linked topics: </span>`));
  topics.forEach((t, i) => {
    const link = el(`<a href="#topic/${esc(encodeURIComponent(t.id))}" class="inline-flex items-center min-h-11 sm:min-h-0 text-brand-dark hover:underline">${esc(t.name)}</a>`);
    link.onclick = (e) => { e.preventDefault(); navigate('topic', { id: t.id }); };
    holder.appendChild(link);
    if (i < topics.length - 1) holder.appendChild(document.createTextNode(', '));
  });
  return li;
}
