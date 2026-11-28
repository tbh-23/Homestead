// Honest no-AI mode: one place that explains AI failures and renders the
// quiet "Needs a local AI provider" chip for controls that need the provider,
// or "Not switched on yet" when the provider is set up but the control's
// capability is not in HARRINGTON_AI_CAPABILITIES.
import * as store from './store.js';
import { el, esc, refreshIcons, toast } from './ui.js';

// The README section that walks a family through setting up a local model.
export const AI_HELP_HREF = 'https://github.com/simgue/harrington/blob/main/README.md#optional-local-model-ollama';
const AI_UNAVAILABLE_LABEL = 'Needs a local AI provider';
const AI_SWITCHED_OFF_LABEL = 'Not switched on yet';

const MESSAGES = {
  unconfigured: 'This needs a local AI provider, and none is set up on this Harrington server yet. Everything else keeps working.',
  disabled: 'This AI feature isn’t switched on yet on this Harrington server. Everything else keeps working.',
  timeout: 'The AI provider took too long to answer. It may still be loading the model, so try again in a minute.',
  unreachable: 'Harrington couldn’t reach the AI provider. Check that it’s running, then try again.',
  provider: 'The AI provider sent back an error or an answer Harrington couldn’t use. Try again.',
  offline: 'Couldn’t reach the Harrington server. Check that it’s still running, then try again.',
  failed: 'Something went wrong while preparing this. Try again.',
};

// Classify an error thrown by an AI-backed action. The server's messages
// arrive through backend.js as the Error message (see server.mjs /api/ai).
export function explainAiError(err) {
  const text = String(err?.message ?? err ?? '');
  let kind = 'failed';
  if (/not switched on/i.test(text)) kind = 'disabled';
  else if (/not configured/i.test(text)) kind = 'unconfigured';
  else if (/timed out|timeout/i.test(text) || err?.name === 'AbortError') kind = 'timeout';
  else if (/AI provider is unreachable/i.test(text)) kind = 'unreachable';
  else if (/AI provider (failed|returned)/i.test(text) || err?.name === 'SyntaxError') kind = 'provider';
  else if (err?.name === 'TypeError' && /fetch|network|load failed/i.test(text)) kind = 'offline';
  return { kind, message: MESSAGES[kind] };
}

// A quiet, disabled-looking chip that links to the setup instructions. It
// says "Not switched on yet" when a provider is set up but `capability` is off.
export function aiUnavailableChip(capability = null, href = AI_HELP_HREF) {
  const off = store.aiSwitchedOff(capability);
  const title = off ? 'Switch this AI feature on to use it' : 'Set up a local AI provider to use this';
  return el(`<a href="${esc(href)}" target="_blank" rel="noopener" title="${title}" class="ai-unavailable inline-flex max-w-full min-w-0 items-center gap-1.5 px-2.5 py-1 rounded-full border border-paper-line bg-paper text-xs font-medium text-ink-faint hover:text-ink-soft hover:border-ink-faint/40 transition-colors"><i data-lucide="plug-zap" class="w-3.5 h-3.5 shrink-0"></i><span class="min-w-0">${off ? AI_SWITCHED_OFF_LABEL : AI_UNAVAILABLE_LABEL}</span></a>`);
}

// The control itself when its `capability` (or any of an array of them) can
// generate, otherwise the chip (or `fallback`). With `cachedKey`, a control
// that only opens content already in the lesson cache replaces the
// placeholder once the cache confirms it (a valid saved value); `saved` is
// shown then instead of `control`, such as an "Open saved lesson" button.
export function gateAi(control, options = {}) {
  const { capability = null, href = AI_HELP_HREF, cachedKey = null, fallback = null, saved = null } = typeof options === 'string' ? { href: options } : options;
  if (store.aiAvailable(capability)) return control;
  const placeholder = fallback || aiUnavailableChip(capability, href);
  if (cachedKey) {
    store.hasCachedLesson(cachedKey).then(found => {
      if (!found || !placeholder.parentNode) return;
      placeholder.replaceWith(saved || control);
      refreshIcons();
    });
  }
  return placeholder;
}

// The "Generate a different version" action, or the chip when `capability`
// cannot generate.
export function generateAnotherButton(onRegen, capability) {
  const btn = el(`<button class="ai-regen flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"><i data-lucide="refresh-cw" class="w-4 h-4"></i>Generate a different version</button>`);
  btn.onclick = onRegen;
  return gateAi(btn, { capability });
}

// After a first generation the server did not store: the content stays on
// screen, and Retry save sends the same value again (no new AI call).
export function offerRetrySave(key) {
  if (!store.isUnsavedCached(key)) return;
  toast('Generated, but not saved on this server', 'error', {
    id: 'unsaved:' + key,
    action: {
      label: 'Retry save',
      onClick: async () => {
        if (await store.retrySaveCached(key)) toast('Saved', 'success', { id: 'unsaved:' + key });
        else offerRetrySave(key);
      },
    },
  });
}

// `render(value)` returns a detached node and may throw. Both helpers render
// before anything is shown or saved; `onShow(value)` runs once it is on screen.

// "Generate a different version": shows `loading`, then the new version. On
// any failure (provider, shape, render or save) the previous content comes
// back with an inline error and Retry above it, and the cache keeps it too.
export async function regenerateInto(stage, opts) {
  const { key, generate, render, loading, onShow = null } = opts;
  const previous = [...stage.childNodes].filter(n => !n.classList?.contains('ai-regen-error'));
  stage.replaceChildren(loading);
  refreshIcons();
  try {
    const fresh = await store.generateCached(key, generate, { force: true, accept: render });
    stage.replaceChildren(render(fresh));
    refreshIcons();
    onShow?.(fresh);
    return fresh;
  } catch (err) {
    const block = aiErrorBlock(err, () => regenerateInto(stage, opts), { compact: true });
    block.classList.add('ai-regen-error');
    stage.replaceChildren(block, ...previous);
    refreshIcons();
    return null;
  }
}

// Opens cached or freshly generated content. A failure to generate shows the
// error with `retry`; a cached value that no longer renders offers a fresh
// version instead of reading the same cache again.
export async function showGenerated(stage, { key, generate, render, loading, retry, onShow = null }) {
  let value;
  try {
    value = await store.generateCached(key, generate, { accept: render });
  } catch (err) {
    stage.replaceChildren(aiErrorBlock(err, retry));
    return null;
  }
  try {
    stage.replaceChildren(render(value));
    refreshIcons();
    onShow?.(value);
    offerRetrySave(key);
    return value;
  } catch (err) {
    console.error(err);
    const block = aiErrorBlock(store.invalidResult(), () => regenerateInto(stage, { key, generate, render, loading, onShow }));
    block.classList.add('ai-regen-error');
    stage.replaceChildren(block);
    return null;
  }
}

// Replaces every "Couldn't … right now" message. `retry` re-runs the action;
// for "not configured" or "not switched on" the button re-reads /api/health first.
export function aiErrorBlock(err, retry = null, { compact = false } = {}) {
  const { kind, message } = explainAiError(err);
  // Both mean "set something up", not "something broke".
  const unconfigured = kind === 'unconfigured' || kind === 'disabled';
  const capability = err?.capability || err?.body?.capability || null;
  if (!unconfigured) console.error(err); // a missing provider is expected, not an error
  const b = el(compact
    ? `<div class="py-2"><p class="text-sm ${unconfigured ? 'text-ink-soft' : 'text-[#a4473a]'} leading-relaxed">${esc(message)}</p><div class="actions flex flex-wrap items-center gap-3 mt-2"></div></div>`
    : `<div class="text-center py-10">
        <i data-lucide="${unconfigured ? 'plug-zap' : 'cloud-off'}" class="w-8 h-8 text-ink-faint mx-auto mb-3"></i>
        <p class="text-sm text-ink-soft mb-3 max-w-sm mx-auto leading-relaxed">${esc(message)}</p>
        <div class="actions flex flex-wrap items-center justify-center gap-3"></div>
      </div>`);
  const actions = b.querySelector('.actions');
  if (unconfigured) {
    actions.appendChild(el(`<a href="${AI_HELP_HREF}" target="_blank" rel="noopener" class="text-sm font-medium text-brand-dark underline underline-offset-2">${kind === 'disabled' ? 'How to switch it on' : 'How to set one up'}</a>`));
  }
  if (retry) {
    const btn = el(`<button class="px-4 py-2 rounded-lg ${compact ? 'border border-paper-line text-ink-soft hover:border-brand/40' : 'bg-brand text-white'} text-sm font-medium">${unconfigured ? 'Retry' : 'Try again'}</button>`);
    btn.onclick = async () => {
      if (unconfigured) {
        btn.disabled = true;
        let available;
        try { available = await store.refreshHealth(capability); }
        catch (healthErr) {
          // The server or network is down; say so instead of "no provider".
          b.replaceWith(aiErrorBlock(healthErr, retry, { compact }));
          return;
        }
        btn.disabled = false;
        if (!available) { toast(kind === 'disabled' ? 'Still not switched on for this server' : 'Still no AI provider on this server'); return; }
      }
      retry();
    };
    actions.appendChild(btn);
  }
  if (!actions.children.length) actions.remove();
  refreshIcons();
  return b;
}
