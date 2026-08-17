// Year-end portfolio / progress report. Opens a clean, printable document built
// entirely from data already in the parent's account — mastery, passed tests,
// attendance (instruction days), records, and a mastery-growth chart. Many US
// states require homeschoolers to keep exactly this kind of portfolio + an
// attendance record; this turns the app's data into one you can print or save
// as PDF (via the browser's "Save as PDF").
import { esc, toast, fmtDate } from '../ui.js';
import { SUBJECTS } from '../data.js';
import { portfolio } from '../reports.js';
import { lineChart, barRow, barChart } from '../charts.js';
import * as store from '../store.js';

function prettyDate(k) {
  if (!k) return '—';
  // k may be a 'YYYY-MM-DD' key or a timestamp.
  if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return fmtDate(k);
}

const RECORD_LABEL = {
  observation: 'Observation', question: 'Question', discussion: 'Discussion',
  assessment: 'Assessment', recording: 'Recording',
};

export function openReport(student) {
  if (!student) { toast('Add a student first', 'error'); return; }
  const p = portfolio(student.id);
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print the report', 'error'); return; }

  const parent = store.get().user?.username || '';
  const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const range = (p.attendance.first || p.attendance.last)
    ? `${prettyDate(p.attendance.first)} – ${prettyDate(p.attendance.last)}`
    : 'Not enough activity recorded yet';

  // Summary tiles
  const tiles = [
    { label: 'Overall mastery', value: `${p.stats.pct}%` },
    { label: 'Topics mastered', value: p.stats.totalMastered },
    { label: 'Days of instruction', value: p.attendance.count },
    { label: 'Tests passed', value: p.passedTests.length },
    { label: 'Current level', value: p.game.level },
    { label: 'Current streak (days)', value: p.attendance.streak },
  ].map(t => `<div class="tile"><div class="tile-v">${esc(String(t.value))}</div><div class="tile-l">${esc(t.label)}</div></div>`).join('');

  // Mastery by subject
  const subjectBars = p.subjects.map(sub => {
    const s = p.stats.per[sub];
    const color = (SUBJECTS[sub] || {}).color || '#3f7d5e';
    return barRow({ label: sub, value: s.mastered, total: s.total, color });
  }).join('');

  // Mastery growth chart
  const growthSvg = p.growth.points.length
    ? lineChart([{ color: '#3f7d5e', points: p.growth.points }], { w: 560, h: 150, yMax: Math.max(1, p.growth.count) })
    : '<p class="muted">Not enough mastered topics yet to chart growth.</p>';

  // Attendance by month (bar chart)
  const months = Object.keys(p.attendance.byMonth).sort();
  const attSvg = months.length
    ? barChart(months.map(m => ({ value: p.attendance.byMonth[m], color: '#3d6b93' })), { w: 560, h: 120, yMax: Math.max(1, ...months.map(m => p.attendance.byMonth[m])) })
    : '';
  const monthLabels = months.length
    ? `<div class="xlabels">${months.map(m => `<span>${esc(new Date(m + '-01').toLocaleDateString(undefined, { month: 'short' }))}</span>`).join('')}</div>`
    : '';

  // Mastered topics grouped by subject, with dates
  const masteredBySubject = {};
  p.mastered.forEach(m => { (masteredBySubject[m.topic.subject] = masteredBySubject[m.topic.subject] || []).push(m); });
  const masteredHtml = Object.keys(masteredBySubject).length
    ? p.subjects.filter(s => masteredBySubject[s]).map(sub => {
        const color = (SUBJECTS[sub] || {}).color || '#3f7d5e';
        const rows = masteredBySubject[sub].map(m =>
          `<li><span class="dot" style="background:${color}"></span><span class="mt-name">${esc(m.topic.name)}</span><span class="mt-date">${m.at ? prettyDate(m.at) : ''}</span></li>`).join('');
        return `<div class="subj-group"><h3 style="color:${color}">${esc(sub)} <span class="count">(${masteredBySubject[sub].length})</span></h3><ul class="mt-list">${rows}</ul></div>`;
      }).join('')
    : '<p class="muted">No topics marked mastered yet.</p>';

  // Passed tests table
  const testsHtml = p.passedTests.length
    ? `<table class="tbl"><thead><tr><th>Assessment</th><th>Subject</th><th>Score</th><th>Date</th></tr></thead><tbody>${
        p.passedTests.map(t => `<tr><td>${esc((t.scope || 'subject') === 'topic' ? 'Topic check' : t.scope === 'section' ? 'Section check' : 'Subject mastery test')}${t.sectionId ? ' · ' + esc(String(t.sectionId).split('|')[1] || '') : ''}</td><td>${esc(t.subject || '')}</td><td>${t.pct}%</td><td>${prettyDate(t.createdAt)}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="muted">No mastery tests passed yet.</p>';

  // Records / observations sample (most recent 20)
  const recs = p.records.slice(0, 20);
  const recordsHtml = recs.length
    ? recs.map(r => `<div class="rec"><div class="rec-head"><span class="rec-type">${esc(RECORD_LABEL[r.type] || r.type || 'Note')}</span>${r.topicName ? `<span class="rec-topic">${esc(r.topicName)}</span>` : ''}<span class="rec-date">${prettyDate(r.createdAt)}</span></div>${r.title ? `<div class="rec-title">${esc(r.title)}</div>` : ''}${r.note ? `<div class="rec-note">${esc(r.note)}</div>` : ''}</div>`).join('')
    : '<p class="muted">No written records yet.</p>';

  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${esc(student.name)} — Learning Report</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Inter',system-ui,Arial,sans-serif;color:#1c1a17;margin:0;padding:0;line-height:1.5}
    .wrap{max-width:7.5in;margin:0 auto;padding:0.5in}
    h1{font-family:'Fraunces',Georgia,serif;font-size:30px;margin:0 0 2px}
    h2{font-family:'Fraunces',Georgia,serif;font-size:19px;margin:30px 0 12px;padding-bottom:6px;border-bottom:2px solid #1c1a17}
    h3{font-size:14px;margin:14px 0 6px}
    .sub{color:#4a4640;font-size:14px;margin:0}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px double #3f7d5e;padding-bottom:16px}
    .brand{display:flex;align-items:center;gap:8px;font-family:'Fraunces',Georgia,serif;font-weight:600;color:#3f7d5e}
    .brand .mark{width:22px;height:22px;border-radius:6px;background:#3f7d5e;display:inline-block}
    .meta-line{font-size:12px;color:#8a847a;margin-top:6px}
    .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
    .tile{border:1px solid #ece7dd;border-radius:10px;padding:12px;text-align:center}
    .tile-v{font-family:'Fraunces',Georgia,serif;font-size:24px;font-weight:700;color:#2f6049}
    .tile-l{font-size:11px;color:#8a847a;text-transform:uppercase;letter-spacing:.4px;margin-top:2px}
    .barrow{margin:0 0 10px}
    .barrow-head{display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px}
    .barrow-val{color:#4a4640}
    .barrow-track{height:8px;background:#f0ece3;border-radius:5px;overflow:hidden}
    .barrow-fill{height:100%;border-radius:5px}
    .muted{color:#8a847a;font-size:13px}
    .xlabels{display:flex;justify-content:space-between;font-size:10px;color:#8a847a;margin-top:2px}
    .subj-group{margin-bottom:10px;break-inside:avoid}
    .subj-group h3 .count{color:#8a847a;font-weight:400;font-size:12px}
    .mt-list{list-style:none;margin:0;padding:0;columns:2;column-gap:24px}
    .mt-list li{display:flex;align-items:center;gap:6px;font-size:12px;margin:0 0 3px;break-inside:avoid}
    .dot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}
    .mt-name{flex:1}
    .mt-date{color:#8a847a;font-size:11px;white-space:nowrap}
    .tbl{width:100%;border-collapse:collapse;font-size:12px}
    .tbl th{text-align:left;border-bottom:1.5px solid #1c1a17;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#4a4640}
    .tbl td{border-bottom:1px solid #ece7dd;padding:6px 8px}
    .rec{border:1px solid #ece7dd;border-radius:8px;padding:8px 10px;margin-bottom:7px;break-inside:avoid}
    .rec-head{display:flex;gap:8px;align-items:center;font-size:11px;color:#8a847a;margin-bottom:2px}
    .rec-type{font-weight:600;color:#3f7d5e;text-transform:uppercase;letter-spacing:.3px}
    .rec-topic{color:#4a4640}
    .rec-date{margin-left:auto}
    .rec-title{font-weight:600;font-size:13px}
    .rec-note{font-size:12px;color:#4a4640;white-space:pre-wrap}
    .foot{margin-top:30px;padding-top:12px;border-top:1px solid #ece7dd;font-size:10px;color:#8a847a;line-height:1.6}
    .signature{display:flex;gap:40px;margin-top:26px}
    .signature div{flex:1;border-top:1px solid #999;padding-top:5px;font-size:11px;color:#8a847a}
    .no-print{margin:16px 0;text-align:center}
    button.print{background:#3f7d5e;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}
    @media print{.no-print{display:none}.wrap{padding:0.4in;max-width:none}h2{break-after:avoid}}
  </style></head><body>
  <div class="wrap">
    <div class="no-print"><button class="print" onclick="window.print()">Print / Save as PDF</button></div>
    <div class="head">
      <div>
        <h1>${esc(student.name)}</h1>
        <p class="sub">Learning Portfolio &amp; Progress Report</p>
        <div class="meta-line">Age ${p.age ?? '—'}${student.birthYear ? ` · born ${student.birthYear}` : ''} · Instruction period: ${esc(range)}</div>
        ${parent ? `<div class="meta-line">Parent / Teacher: ${esc(parent)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="brand"><span class="mark"></span> Homestead</div>
        <div class="meta-line">Generated ${esc(generated)}</div>
      </div>
    </div>

    <div class="tiles">${tiles}</div>

    <h2>Mastery by subject</h2>
    ${subjectBars}

    <h2>Mastery growth over time</h2>
    ${growthSvg}
    <p class="muted">Cumulative topics fully mastered (${p.growth.count}) from ${p.growth.firstAt ? prettyDate(p.growth.firstAt) : '—'} to today.</p>

    <h2>Attendance &amp; instruction days</h2>
    <p class="sub">${p.attendance.count} day${p.attendance.count === 1 ? '' : 's'} of recorded instruction${p.attendance.first ? `, ${prettyDate(p.attendance.first)} – ${prettyDate(p.attendance.last)}` : ''}.</p>
    ${attSvg}${monthLabels}

    <h2>Topics mastered${p.mastered.length ? ` (${p.mastered.length})` : ''}</h2>
    ${masteredHtml}

    <h2>Assessments passed</h2>
    ${testsHtml}

    <h2>Records &amp; observations</h2>
    ${recordsHtml}

    <div class="signature"><div>Parent / Teacher signature</div><div>Date</div></div>

    <div class="foot">
      Generated by Homestead — a mastery-based homeschool platform.<br/>
      Curriculum from the Marble Skill Taxonomy (v1) · © Generative Spark, Inc. · licensed under ODbL 1.0 &amp; CC BY-SA 4.0.
    </div>
  </div>
  <script>window.onload=function(){setTimeout(function(){try{window.focus()}catch(e){}},200)}<\/script>
  </body></html>`);
  w.document.close();
}
