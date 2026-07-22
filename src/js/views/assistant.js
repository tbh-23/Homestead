import * as store from '../store.js';
import { getData, SUBJECTS } from '../data.js';
import { el, refreshIcons, toast } from '../ui.js';
import { studentStats } from '../mastery.js';
import { aiParentChat } from '../ai.js';

let panel = null, messages = [], busy = false;

// Build a compact context string from the active student's real data.
function buildContext() {
  const s = store.activeStudent();
  if (!s) return 'No student is selected yet.';
  const d = getData();
  const age = store.studentAge(s);
  const stats = studentStats(s.id);
  const per = Object.entries(stats.per)
    .map(([sub, v]) => `${sub} ${v.pct}% (${v.mastered}/${v.total})`).join(', ');

  // Topics currently in progress or recently active.
  const prog = store.progressFor(s.id);
  const inProgress = Object.entries(prog)
    .filter(([id, v]) => d.byId.has(id) && (v.status === 'learning' || v.status === 'practicing'))
    .map(([id]) => d.byId.get(id).name).slice(0, 8);

  const recentRecords = store.recordsFor(s.id).slice(0, 5)
    .map(r => `${r.type}: ${(r.note || r.title || '').slice(0, 80)}`).filter(Boolean);

  return [
    `Student: ${s.name}, age ${age}.`,
    `Overall mastery ${stats.pct}%. By subject: ${per}.`,
    inProgress.length ? `Currently working on: ${inProgress.join('; ')}.` : 'No topics currently in progress.',
    recentRecords.length ? `Recent parent notes — ${recentRecords.join(' | ')}.` : '',
  ].filter(Boolean).join('\n');
}

const STARTERS = [
  'My child keeps struggling with a topic — how can I help?',
  'Give me a fun way to practice this week.',
  'How do I know when a topic is truly mastered?',
  'They get frustrated easily. Any tips?',
];

export function assistantLauncher() {
  const btn = el(`<button id="asst-launch" class="fixed z-[80] bottom-20 right-4 lg:bottom-6 lg:right-6 w-14 h-14 rounded-full bg-brand hover:bg-brand-dark text-white flex items-center justify-center transition-colors" title="Ask the Homestead Helper" style="box-shadow:0 6px 20px rgba(47,96,73,0.35)">
    <i data-lucide="messages-square" class="w-6 h-6"></i>
  </button>`);
  btn.onclick = () => toggle();
  return btn;
}

function toggle() {
  if (panel) { close(); return; }
  open();
}

function close() {
  if (!panel) return;
  panel.classList.add('opacity-0', 'translate-y-3');
  const p = panel; panel = null;
  setTimeout(() => p.remove(), 200);
}

function open() {
  const s = store.activeStudent();
  panel = el(`<div class="fixed z-[85] bottom-4 right-4 lg:bottom-6 lg:right-6 w-[calc(100vw-2rem)] sm:w-[400px] h-[560px] max-h-[calc(100vh-6rem)] lg:max-h-[calc(100vh-3rem)] bg-paper-card border border-paper-line rounded-2xl overflow-hidden flex flex-col opacity-0 translate-y-3 transition-all duration-200" style="box-shadow:0 12px 40px rgba(28,26,23,0.18)">
    <div class="px-4 py-3 border-b border-paper-line flex items-center gap-2.5 bg-brand text-white shrink-0">
      <span class="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><i data-lucide="sparkles" class="w-4.5 h-4.5"></i></span>
      <div class="flex-1 min-w-0">
        <p class="font-600 text-sm leading-tight">Homestead Helper</p>
        <p class="text-[11px] text-white/80 leading-tight">Teaching tips${s ? ' for ' + s.name : ''}</p>
      </div>
      <button id="asst-close" class="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center"><i data-lucide="x" class="w-4.5 h-4.5"></i></button>
    </div>
    <div id="asst-msgs" class="flex-1 overflow-y-auto px-4 py-4 space-y-3"></div>
    <div class="px-3 pt-2 pb-3 border-t border-paper-line shrink-0">
      <div id="asst-starters" class="flex gap-1.5 overflow-x-auto pb-2"></div>
      <form id="asst-form" class="flex items-end gap-2">
        <textarea id="asst-input" rows="1" placeholder="Ask for teaching help\u2026" class="flex-1 resize-none px-3 py-2.5 rounded-xl border border-paper-line bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand max-h-28"></textarea>
        <button id="asst-send" class="w-10 h-10 rounded-xl bg-brand hover:bg-brand-dark text-white flex items-center justify-center shrink-0 transition-colors"><i data-lucide="arrow-up" class="w-4.5 h-4.5"></i></button>
      </form>
    </div>
  </div>`);
  document.body.appendChild(panel);
  refreshIcons();
  requestAnimationFrame(() => panel.classList.remove('opacity-0', 'translate-y-3'));

  panel.querySelector('#asst-close').onclick = close;

  const msgsEl = panel.querySelector('#asst-msgs');
  const input = panel.querySelector('#asst-input');
  const form = panel.querySelector('#asst-form');

  // Greeting on first open (kept across opens within the session).
  if (messages.length === 0) {
    renderBubble(msgsEl, 'assistant',
      `<p>Hi! I'm your teaching helper.${s ? ` I can see ${s.name}'s progress.` : ''} Tell me what they're finding tricky — for example, <em>"my child is struggling with subtraction and telling time, any ideas?"</em> — and I'll give you concrete tips and activities.</p>`);
  } else {
    messages.forEach(m => renderBubble(msgsEl, m.role, m.role === 'assistant' ? m.html || esc(m.content) : esc(m.content)));
  }
  scrollDown(msgsEl);

  // Starter chips (only before the first user turn)
  const starters = panel.querySelector('#asst-starters');
  if (!messages.some(m => m.role === 'user')) {
    STARTERS.forEach(s2 => {
      const c = el(`<button type="button" class="shrink-0 px-2.5 py-1.5 rounded-full border border-paper-line text-xs text-ink-soft hover:border-brand/40 hover:text-ink transition-colors">${s2}</button>`);
      c.onclick = () => { input.value = s2; send(); };
      starters.appendChild(c);
    });
  } else {
    starters.remove();
  }

  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 112) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  form.onsubmit = e => { e.preventDefault(); send(); };

  function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = ''; input.style.height = 'auto';
    panel.querySelector('#asst-starters')?.remove();
    messages.push({ role: 'user', content: text });
    renderBubble(msgsEl, 'user', esc(text));
    scrollDown(msgsEl);

    busy = true;
    const loading = el(`<div class="flex items-center gap-2 text-sm text-ink-faint"><span class="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="sparkles" class="w-4 h-4 text-brand-dark"></i></span><span class="flex gap-1 py-2"><span class="w-1.5 h-1.5 rounded-full bg-ink-faint/50 animate-bounce" style="animation-delay:0ms"></span><span class="w-1.5 h-1.5 rounded-full bg-ink-faint/50 animate-bounce" style="animation-delay:120ms"></span><span class="w-1.5 h-1.5 rounded-full bg-ink-faint/50 animate-bounce" style="animation-delay:240ms"></span></span></div>`);
    msgsEl.appendChild(loading);
    refreshIcons();
    scrollDown(msgsEl);

    // Only send the text turns to the model (system + context added in ai.js).
    const turns = messages.map(m => ({ role: m.role, content: m.content }));
    aiParentChat(turns, buildContext()).then(html => {
      loading.remove();
      messages.push({ role: 'assistant', content: '', html });
      renderBubble(msgsEl, 'assistant', html);
      scrollDown(msgsEl);
    }).catch(() => {
      loading.remove();
      renderBubble(msgsEl, 'assistant', `<p class="text-[#b0413a]">Sorry, I couldn't respond just now. Please try again.</p>`);
    }).finally(() => { busy = false; });
  }
}

function renderBubble(container, role, html) {
  if (role === 'user') {
    container.appendChild(el(`<div class="flex justify-end"><div class="max-w-[85%] bg-brand text-white rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed">${html}</div></div>`));
  } else {
    container.appendChild(el(`<div class="flex gap-2">
      <span class="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="sparkles" class="w-4 h-4 text-brand-dark"></i></span>
      <div class="ai-prose max-w-[85%] bg-paper border border-paper-line rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-ink-soft leading-relaxed">${html}</div>
    </div>`));
  }
  refreshIcons();
}

function scrollDown(c) { setTimeout(() => { c.scrollTop = c.scrollHeight; }, 30); }
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
