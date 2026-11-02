// Child-safe topic card, opened from the child view: the topic, its evidence
// phrased as "Can you…?" prompts, a few things to try, and a way to tell a
// grown-up about it. No tests, scores or percentages.
import * as store from '../store.js';
import { subjectMeta } from '../data.js';
import { el, esc, refreshIcons, toast, openModal } from '../ui.js';
import { activityIdeas } from '../resources.js';
import { openRecorder } from '../recorder.js';
import { growthIcon, stageForStatus, GROWTH } from '../meadow.js';
import { howItWorksFrame } from './howitworks.js';
import { canYouPrompt } from '../phrasing.js';

// The static ideas are written for grown-ups; drop any that are about scores.
function childIdeas(topic) {
  return activityIdeas(topic).filter(a => !/\bscore\b/i.test(`${a.title} ${a.body}`));
}

export function openChildTopic(topic) {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  if (!topic) { toast('Ask a grown-up to pick something new'); return; }
  const meta = subjectMeta(topic.subject);
  const stage = stageForStatus(store.statusOf(student.id, topic.id), true);
  const prompts = (topic.evidence || []).map(canYouPrompt).filter(Boolean).slice(0, 5);
  const ideas = childIdeas(topic);

  const body = el(`<div class="p-5 sm:p-6">
    <div class="flex items-center gap-3">
      ${growthIcon(stage, 56)}
      <div class="min-w-0">
        <p class="text-sm font-600 flex items-center gap-1.5" style="color:${esc(meta.color)}"><i data-lucide="${esc(meta.icon)}" class="w-4 h-4"></i>${esc(topic.subject)}</p>
        <h2 class="font-display text-2xl font-600 leading-tight">${esc(topic.name)}</h2>
        <p class="text-sm font-600" style="color:${esc(GROWTH[stage].color)}">${esc(GROWTH[stage].kid)}</p>
      </div>
    </div>
    <section class="mt-5 ct-how hidden" aria-labelledby="ct-how">
      <h3 id="ct-how" class="font-display text-xl font-600 mb-2">See how it works</h3>
    </section>
    ${prompts.length ? `<section class="mt-5" aria-labelledby="ct-try">
      <h3 id="ct-try" class="font-display text-xl font-600 mb-2">Try these</h3>
      <ul class="space-y-2">${prompts.map(p => `<li class="meadow-card px-4 py-3 flex gap-3 text-[15px] leading-snug"><i data-lucide="sparkle" class="w-5 h-5 shrink-0 text-butter-deep mt-0.5"></i><span>${esc(p)}</span></li>`).join('')}</ul>
    </section>` : ''}
    ${ideas.length ? `<section class="mt-5" aria-labelledby="ct-ideas">
      <h3 id="ct-ideas" class="font-display text-xl font-600 mb-2">Things to try with a grown-up</h3>
      <div class="grid gap-2.5">${ideas.map(a => `<div class="rounded-2xl bg-paper border border-paper-line p-4 flex gap-3">
        <span class="w-10 h-10 rounded-full bg-paper-card flex items-center justify-center shrink-0" style="color:${esc(meta.color)}"><i data-lucide="${esc(a.icon)}" class="w-5 h-5"></i></span>
        <span class="min-w-0"><span class="block font-600">${esc(a.title)}</span><span class="block text-sm text-ink-soft leading-snug mt-0.5">${esc(a.body)}</span></span>
      </div>`).join('')}</div>
    </section>` : ''}
    <button id="tell" class="mt-6 w-full h-14 rounded-full bg-brand hover:bg-brand-dark text-paper-card font-display text-lg font-600 flex items-center justify-center gap-3">
      <span class="w-9 h-9 rounded-full bg-butter text-ink flex items-center justify-center"><i data-lucide="mic" class="w-5 h-5"></i></span>Tell about it</button>
    <button id="done" class="mt-2 w-full px-4 py-2.5 rounded-full text-ink-soft font-medium hover:bg-paper transition-colors">Back to my garden</button>
  </div>`);

  const figure = howItWorksFrame(topic);
  if (figure) {
    const how = body.querySelector('.ct-how');
    how.appendChild(figure);
    how.classList.remove('hidden');
  }

  const m = openModal(body, { wide: true });
  body.querySelector('#tell').onclick = () => { m.close(); openRecorder(student.id, topic); };
  body.querySelector('#done').onclick = () => m.close();
  refreshIcons();
  return m;
}
