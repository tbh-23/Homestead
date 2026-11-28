// "Check mastery by observation": the topic's evidence items as a checklist
// the parent ticks while watching, the suggested question to ask, and an
// optional note (typed, or a voice note through the recorder). Saves a
// test-shaped result, so a full pass marks the topic mastered as a digital
// test does, and can complete the section and the subject. Parent view only.
import { getData } from '../data.js';
import * as store from '../store.js';
import { el, esc, openModal, refreshIcons, toast } from '../ui.js';
import { openRecorder } from '../recorder.js';
import { checkableEvidence, assessmentQuestion } from '../phrasing.js';
import { observedResult, observedRollup, observedTitle } from '../observe.js';
import { sectionForTopic, subjectSections } from '../mastery.js';
import { GUIDE_ATTRIBUTION, loadTeachingGuide } from '../teaching.js';

// True when the topic has something a parent can watch for.
export function canObserve(topic) {
  return checkableEvidence(topic).length > 0;
}

export function openObservation(topic, student = store.activeStudent()) {
  if (!student) { toast('Add a student first', 'error'); return null; }
  const items = checkableEvidence(topic, student.name);
  if (!items.length) { toast('This topic has no evidence list to observe', 'error'); return null; }
  const question = assessmentQuestion(topic, student.name);
  const queued = store.levelsetFor(student.id).observe.includes(topic.id);

  const body = el(`<div class="p-5">
    <div class="flex items-start gap-3 mb-4">
      <span class="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="eye" class="w-5 h-5 text-brand-dark"></i></span>
      <div class="min-w-0">
        <h3 class="font-display text-lg font-600 leading-tight">Check mastery by observation</h3>
        <p class="text-sm text-ink-soft mt-0.5 [overflow-wrap:anywhere]">${esc(topic.name)}. Watch ${esc(student.name)} at work or ask the question below, then tick what you saw. No quiz and no AI.</p>
      </div>
    </div>
    ${queued ? `<p class="text-xs text-[#8a6412] bg-[#fbecc4] rounded-lg px-3 py-2 mb-3">You marked this “Unsure” in the level-set workbook.</p>` : ''}
    ${question ? `<div class="rounded-xl bg-paper border border-paper-line p-3.5 mb-4">
      <p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint mb-1">Suggested question</p>
      <p class="text-sm text-ink-soft italic leading-relaxed">“${esc(question)}”</p>
    </div>` : ''}
    <div id="ob-guide-q"></div>
    <fieldset>
      <legend class="text-sm font-medium mb-2 [overflow-wrap:anywhere]">What did you see ${esc(student.name)} do?</legend>
      <div class="space-y-2" id="ob-items">${items.map((text, i) => `<label class="flex items-start gap-2.5 p-2.5 rounded-lg border border-paper-line bg-paper cursor-pointer hover:border-brand/40">
        <input type="checkbox" class="mt-0.5 accent-[#3f6b3b]" data-i="${esc(i)}" />
        <span class="text-sm text-ink leading-snug">${esc(text)}</span>
      </label>`).join('')}</div>
    </fieldset>
    <p class="text-xs text-ink-faint mt-2" id="ob-count" aria-live="polite"></p>
    <label class="text-sm font-medium block mt-4 mb-1.5" for="ob-note">Note <span class="text-ink-faint font-normal">(optional)</span></label>
    <textarea id="ob-note" rows="3" class="w-full px-3.5 py-2.5 rounded-xl border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" placeholder="What you asked, what they said or did"></textarea>
    <button id="ob-voice" type="button" class="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#a4473a]"><i data-lucide="mic" class="w-4 h-4"></i>Record a voice note instead</button>
    <div class="flex gap-2 mt-5">
      <button id="ob-cancel" type="button" class="flex-1 px-4 py-2.5 rounded-xl bg-paper border border-paper-line text-ink-soft font-medium text-sm hover:border-brand/40">Cancel</button>
      <button id="ob-save" type="button" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm transition-colors"><i data-lucide="check" class="w-4 h-4"></i><span>Save observation</span></button>
    </div>
  </div>`);

  const boxes = [...body.querySelectorAll('#ob-items input')];
  const count = body.querySelector('#ob-count');
  const saveLabel = body.querySelector('#ob-save span');
  const update = () => {
    const n = boxes.filter(b => b.checked).length;
    count.textContent = n === items.length
      ? `All ${items.length} seen: saving marks ${topic.name} mastered.`
      : `${n} of ${items.length} seen. Mastered needs all of them; a partial check is still kept in Records.`;
    saveLabel.textContent = n === items.length ? 'Save and mark mastered' : 'Save observation';
  };
  boxes.forEach(b => { b.onchange = update; });
  update();

  // A second question from the teaching guide, when the topic has one, shown
  // as Marble wrote it (the prompts speak to the child directly), with
  // Marble's caveat and credit.
  loadTeachingGuide(topic.id).then(guide => {
    const extra = guide?.check?.prompt || '';
    if (!extra || extra === question) return;
    body.querySelector('#ob-guide-q').replaceWith(el(`<div class="rounded-xl bg-paper border border-paper-line p-3.5 mb-4">
      <p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint mb-1">${question ? 'Another question to try' : 'Suggested question'} · from the teaching guide</p>
      <p class="text-sm text-ink-soft italic leading-relaxed">“${esc(extra)}”</p>
      <p class="ob-guide-credit text-[11px] text-ink-faint leading-relaxed mt-1.5">${guide.caveat ? `${esc(guide.caveat)} ` : ''}${esc(GUIDE_ATTRIBUTION)}</p>
    </div>`));
  }).catch(() => {});

  const m = openModal(body);
  body.querySelector('#ob-cancel').onclick = () => m.close();
  body.querySelector('#ob-voice').onclick = () => openRecorder(student.id, topic);
  let saving = false;
  body.querySelector('#ob-save').onclick = () => {
    if (saving) return;
    saving = true;
    const ticked = boxes.map(b => b.checked);
    const saved = saveObservation(student, topic, items, ticked, body.querySelector('#ob-note').value.trim());
    m.close();
    const { topicResult, rollup } = saved;
    if (!topicResult.passed) toast(`Observation saved: ${topicResult.score} of ${topicResult.total} seen`, 'success');
    else if (rollup.subject) toast(`${topic.name} mastered. That completes ${topic.subject} by observation.`, 'success');
    else if (rollup.section) toast(`${topic.name} mastered. That completes its section by observation.`, 'success');
    else toast(`${topic.name} marked mastered by observation`, 'success');
  };
  refreshIcons();
  return m;
}

// Builds and stores the results for one checklist. Exported for the level-set
// view's queued topics, which open the same flow.
export function saveObservation(student, topic, items, ticked, note = '') {
  const topicResult = observedResult(topic, ticked);
  let rollup = { section: null, subject: null };
  if (topicResult.passed) {
    // Only topics with a passed topic result count, never placed or hand-set ones.
    const topicPassed = (id) => id === topic.id || store.topicTestPassed(student.id, id);
    const subjectPassed = !!store.lastTest(student.id, topic.subject)?.passed;
    rollup = observedRollup({
      section: sectionForTopic(topic),
      sections: subjectSections(topic.subject),
      topicPassed,
      sectionPassed: (id) => store.sectionPassed(student.id, id),
      subjectPassed,
    });
  }
  const results = [topicResult, rollup.section, rollup.subject].filter(Boolean);
  store.applyObservation(student.id, {
    results,
    masterTopicId: topicResult.passed ? topic.id : null,
    record: {
      topicId: topic.id, topicName: topic.name,
      title: observedTitle(topic, topicResult), note,
      observed: {
        score: topicResult.score, total: topicResult.total, passed: topicResult.passed,
        items: items.map((text, i) => ({ text, seen: !!ticked[i] })),
        sectionId: rollup.section ? rollup.section.sectionId : null,
        subject: rollup.subject ? rollup.subject.subject : null,
      },
    },
  });
  return { topicResult, rollup };
}

// The topic names of a section, for a passed-section line in Records.
export function sectionLabel(sectionId) {
  const [subject, domain, age] = String(sectionId || '').split('|');
  return subject && domain ? `${domain} · Age ${age}` : '';
}

// Topics waiting for an observation check, as topics.
export function queuedTopics(studentId) {
  const d = getData();
  return store.levelsetFor(studentId).observe.map(id => d.byId.get(id)).filter(Boolean);
}
