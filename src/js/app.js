import { loadTaxonomy } from './data.js';
import * as store from './store.js';
import { syncCurriculum } from './curriculum-sync.js';
import { maybeShowWelcome } from './views/guide.js';
import { assistantLauncher } from './views/assistant.js';
import { el, refreshIcons, toast } from './ui.js';
import { renderShell } from './views/shell.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTimeline } from './views/timeline.js';
import { renderCalendar } from './views/calendar.js';
import { renderTopic } from './views/topic.js';
import { renderRecords } from './views/records.js';
import { renderInsights } from './views/insights.js';

const app = document.getElementById('app');

const route = { name: 'dashboard', params: {} };

export function navigate(name, params = {}) {
  route.name = name;
  route.params = params;
  window.location.hash = name + (params.id ? '/' + params.id : '');
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function parseHash() {
  const h = window.location.hash.replace(/^#/, '');
  if (!h) return { name: 'dashboard', params: {} };
  const [name, id] = h.split('/');
  return { name, params: id ? { id } : {} };
}

let taxonomyReady = false;
let welcomeChecked = false;

async function boot() {
  renderLoading('Loading your homeschool workspace\u2026');
  try {
    await store.refreshAuth();
    if (store.get().user) await store.loadAll();
    await loadTaxonomy();
    taxonomyReady = true;
    if (store.get().user) { try { syncCurriculum(); } catch (e) { console.warn('sync failed', e); } }
  } catch (e) {
    console.error(e);
    renderError(e.message || 'Something went wrong while starting up.');
    return;
  }
  const r = parseHash();
  route.name = r.name; route.params = r.params;
  render();
}

function render() {
  if (!taxonomyReady) return;
  const state = store.get();

  if (!state.user) { renderSignIn(); return; }
  if (state.students.length === 0 && route.name !== 'onboard') {
    route.name = 'onboard';
  }

  const views = {
    dashboard: renderDashboard,
    calendar: renderCalendar,
    timeline: renderTimeline,
    topic: renderTopic,
    records: renderRecords,
    insights: renderInsights,
    onboard: renderOnboard,
  };
  const viewFn = views[route.name] || renderDashboard;

  if (route.name === 'onboard') {
    app.innerHTML = '';
    app.appendChild(renderOnboard());
    refreshIcons();
    return;
  }

  const content = viewFn(route.params, { navigate });
  const shell = renderShell({ route, navigate, content });
  app.innerHTML = '';
  app.appendChild(shell);
  refreshIcons();

  // Mount the floating parent assistant once (persists across view changes).
  if (route.name !== 'onboard' && !document.getElementById('asst-launch')) {
    document.body.appendChild(assistantLauncher());
    refreshIcons();
  }

  // Show the welcome tour once, after the first signed-in render.
  if (!welcomeChecked) {
    welcomeChecked = true;
    setTimeout(() => { try { maybeShowWelcome(); } catch (e) {} }, 400);
  }
}

// ---- Boot-time screens ----
function renderLoading(msg) {
  app.innerHTML = '';
  app.appendChild(el(`
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <div class="w-11 h-11 rounded-xl bg-brand flex items-center justify-center">
        <i data-lucide="compass" class="w-6 h-6 text-white"></i>
      </div>
      <div class="flex items-center gap-2 text-ink-soft text-sm">
        <div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
        ${msg}
      </div>
    </div>`));
  refreshIcons();
}

function renderError(msg) {
  app.innerHTML = '';
  const node = el(`
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <i data-lucide="cloud-off" class="w-10 h-10 text-ink-faint"></i>
      <p class="text-ink-soft max-w-sm">${msg}</p>
      <button id="retry" class="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium">Try again</button>
    </div>`);
  node.querySelector('#retry').onclick = () => boot();
  app.appendChild(node);
  refreshIcons();
}

function renderSignIn() {
  app.innerHTML = '';
  const node = el(`
    <div class="min-h-screen grid lg:grid-cols-2">
      <div class="flex items-center justify-center p-8">
        <div class="max-w-sm w-full fade-up">
          <div class="flex items-center gap-2.5 mb-8">
            <div class="w-9 h-9 rounded-lg bg-brand flex items-center justify-center">
              <i data-lucide="compass" class="w-5 h-5 text-white"></i>
            </div>
            <span class="font-display text-xl font-600">Homestead</span>
          </div>
          <h1 class="font-display text-3xl sm:text-4xl font-600 leading-tight mb-3">A mastery-based path from age 5 to 13.</h1>
          <p class="text-ink-soft mb-8 leading-relaxed">Homestead turns a 1,590-topic curriculum into a clear, connected timeline — so every idea is truly mastered before the next one begins.</p>
          <button id="signin" class="w-full px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium flex items-center justify-center gap-2 transition-colors">
            <i data-lucide="log-in" class="w-4 h-4"></i> Sign in to begin
          </button>
          <p class="text-xs text-ink-faint mt-4 text-center">Your students and records are saved privately to your account.</p>
        </div>
      </div>
      <div class="hidden lg:flex items-center justify-center bg-brand-light border-l border-paper-line p-10">
        <div class="max-w-md space-y-4">
          ${featureCard('git-branch', 'Connected learning', 'Every topic shows its prerequisites and what it unlocks next.')}
          ${featureCard('shield-check', 'Mastery gating', 'Topics stay locked until their foundations are mastered.')}
          ${featureCard('notebook-pen', 'Record everything', 'Log observations, questions and discussions per subject.')}
          ${featureCard('sparkles', 'Teacher feedback', 'Get guidance based on your student\u2019s real progress.')}
        </div>
      </div>
    </div>`);
  node.querySelector('#signin').onclick = async () => {
    try { await store.signIn(); try { syncCurriculum(); } catch (e) {} render(); } catch (e) { toast('Sign in was canceled', 'error'); }
  };
  app.appendChild(node);
  refreshIcons();
}

function featureCard(icon, title, body) {
  return `<div class="bg-paper-card/70 border border-paper-line rounded-xl p-4 flex gap-3">
    <div class="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
      <i data-lucide="${icon}" class="w-4.5 h-4.5 text-brand-dark"></i>
    </div>
    <div>
      <p class="font-600 text-sm">${title}</p>
      <p class="text-xs text-ink-soft leading-relaxed mt-0.5">${body}</p>
    </div>
  </div>`;
}

function renderOnboard() {
  const node = el(`
    <div class="min-h-screen flex items-center justify-center p-6">
      <div class="max-w-md w-full fade-up">
        <div class="text-center mb-6">
          <div class="w-12 h-12 rounded-xl bg-brand-light flex items-center justify-center mx-auto mb-4">
            <i data-lucide="user-plus" class="w-6 h-6 text-brand-dark"></i>
          </div>
          <h1 class="font-display text-2xl font-600">Add your first student</h1>
          <p class="text-ink-soft text-sm mt-1">Tell us who's learning so we can shape their timeline.</p>
        </div>
        <form id="f" class="bg-paper-card border border-paper-line rounded-2xl p-5 space-y-4">
          <div>
            <label class="text-sm font-medium block mb-1.5">Student's name</label>
            <input name="name" required placeholder="e.g. Maya" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          </div>
          <div>
            <label class="text-sm font-medium block mb-1.5">Birth year</label>
            <input name="birthYear" type="number" required min="2005" max="2024" placeholder="e.g. 2017" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
            <p class="text-xs text-ink-faint mt-1">We use this to place them on the age 5–13 timeline.</p>
          </div>
          <button class="w-full px-4 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Create timeline</button>
        </form>
      </div>
    </div>`);
  node.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim();
    const by = parseInt(fd.get('birthYear'), 10);
    if (!name || !by) return;
    store.addStudent(name, by);
    toast(`${name}'s timeline is ready`, 'success');
    navigate('dashboard');
  };
  return node;
}

window.addEventListener('hashchange', () => {
  const r = parseHash();
  if (r.name !== route.name || r.params.id !== route.params.id) {
    route.name = r.name; route.params = r.params;
    render();
  }
});

store.subscribe(() => { if (taxonomyReady) render(); });

boot();
