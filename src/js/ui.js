// Small UI helpers: DOM, icons, toasts, modals.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A control that re-renders its whole view (a tick, a toggle) would lose the
// keyboard focus with the old DOM. keepFocus() notes the focused control by
// its id or aria-label; the function it returns puts the focus back on the
// same control in the new view, once that has rendered.
export function keepFocus() {
  const a = document.activeElement;
  const label = a?.getAttribute?.('aria-label');
  const sel = a?.id ? `#${CSS.escape(a.id)}` : label ? `[aria-label="${CSS.escape(label)}"]` : null;
  return () => { if (sel) setTimeout(() => document.querySelector(sel)?.focus(), 0); };
}

let iconTimer = null;
export function refreshIcons() {
  clearTimeout(iconTimer);
  iconTimer = setTimeout(() => { try { window.lucide?.createIcons(); } catch (e) {} }, 10);
}

// While the store refuses a write (read-only family data), the action's own
// confirmation would claim it worked: holdConfirmations() drops success and
// default toasts until the current task ends. Error toasts still show.
let confirmationsHeld = false;
export function holdConfirmations() {
  confirmationsHeld = true;
  setTimeout(() => { confirmationsHeld = false; }, 0);
}

// Remove any visible confirmation (non-error) toasts so a refusal or failure
// toast never sits right beside a misleading "saved" confirmation.
export function clearConfirmations() {
  const root = document.getElementById('toast-root');
  if (!root) return;
  [...root.children]
    .filter(n => n.getAttribute('role') === 'status' && n.getAttribute('data-toast-kind') !== 'error')
    .forEach(n => n.remove());
}

// `action: { label, onClick }` adds a button and keeps the toast up longer;
// clicking it dismisses the toast and runs onClick. A toast with an `id`
// replaces one already showing with the same id instead of stacking.
export function toast(msg, kind = 'default', { action = null, id = null } = {}) {
  if (confirmationsHeld && kind !== 'error') return;
  const root = document.getElementById('toast-root');
  const colors = {
    default: 'bg-ink text-white',
    success: 'bg-brand text-white',
    error: 'bg-[#a4473a] text-white',
  };
  const t = el(`<div role="status" data-toast-kind="${esc(kind)}" class="max-w-full [overflow-wrap:anywhere] px-4 py-2.5 rounded-lg text-sm font-medium ${colors[kind] || colors.default} shadow-lg flex items-center gap-2 opacity-0 translate-y-2 transition-all duration-300">${esc(msg)}</div>`);
  const hide = () => {
    t.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => t.remove(), 300);
  };
  if (action) {
    const btn = el(`<button class="ml-2 px-2 min-h-[44px] lg:min-h-0 lg:px-0 underline underline-offset-2 font-600">${esc(action.label)}</button>`);
    btn.onclick = () => { hide(); action.onClick(); };
    t.appendChild(btn);
  }
  if (id) {
    t.setAttribute('data-toast-id', id);
    [...root.children].filter(n => n.getAttribute('data-toast-id') === id).forEach(n => n.remove());
  }
  root.appendChild(t);
  requestAnimationFrame(() => { t.classList.remove('opacity-0', 'translate-y-2'); });
  setTimeout(hide, action ? 10000 : 2800);
}

// Bookkeeping for open modals, kept free of the DOM so tests can drive it.
// A single Escape listener is attached while any modal is open and dismisses
// only the top-most one; it is detached when the last modal closes.
export function createModalStack(listen, unlisten) {
  const stack = [];
  const onKey = e => {
    if (e.key !== 'Escape' || !stack.length) return;
    e.preventDefault?.();
    stack[stack.length - 1].dismiss();
  };
  return {
    size: () => stack.length,
    // teardown removes the modal from view; beforeClose may return false to
    // cancel a dismissal. Callers may override handle.close to run cleanup,
    // and every close path (button, Escape, backdrop) goes through it.
    open(teardown, beforeClose = null) {
      let closed = false;
      const handle = {
        beforeClose,
        close() {
          if (closed) return;
          closed = true;
          const i = stack.indexOf(handle);
          if (i >= 0) stack.splice(i, 1);
          if (!stack.length) unlisten(onKey);
          teardown();
        },
        dismiss() {
          if (closed) return false;
          if (handle.beforeClose && handle.beforeClose() === false) return false;
          handle.close();
          return true;
        },
        isOpen: () => !closed,
      };
      if (!stack.length) listen(onKey);
      stack.push(handle);
      return handle;
    },
  };
}

let modals = null;

// opts.beforeClose: optional guard run on Escape or a backdrop tap; return
// false to keep the modal open (e.g. after a declined confirm()).
// A sheet opened on a phone while a persistent toast is docked above the
// bottom navigation is padded by --docked-toast (set by the shell), so its
// last buttons stay above the toast (HAR-40).
export function openModal(contentEl, opts = {}) {
  modals ||= createModalStack(
    fn => document.addEventListener('keydown', fn),
    fn => document.removeEventListener('keydown', fn));
  const root = document.getElementById('modal-root');
  const overlay = el(`<div class="fixed inset-0 z-[99] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink/40 backdrop-blur-sm opacity-0 transition-opacity duration-200"></div>`);
  const panel = el(`<div class="bg-paper-card w-full ${opts.wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto max-sm:pb-[var(--docked-toast,0px)] border border-paper-line translate-y-4 sm:translate-y-0 sm:scale-95 transition-all duration-200"></div>`);
  panel.appendChild(contentEl);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  refreshIcons();
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    panel.classList.remove('translate-y-4', 'sm:scale-95');
  });
  const handle = modals.open(() => {
    overlay.classList.add('opacity-0');
    panel.classList.add('sm:scale-95');
    setTimeout(() => overlay.remove(), 200);
  }, opts.beforeClose || null);
  handle.panel = panel;
  overlay.addEventListener('click', e => { if (e.target === overlay) handle.dismiss(); });
  return handle;
}

// AI analysis HTML is stored on records and travels in exports, so it is
// rendered through this allowlist: the bare tags ai.js toHtml() produces
// (p, h4, ul, li, strong, em) are kept and any other markup, including a tag
// with attributes, is shown as text.
const ANALYSIS_TAG = /^<\/?(?:p|h4|ul|li|strong|em)>$/;
export function analysisHtml(html) {
  return String(html ?? '').replace(/<[^<>]*>?|>/g, m => (ANALYSIS_TAG.test(m) ? m : esc(m)));
}

// A 1-5 confidence rating as five stars. Anything else (an imported 6, a
// string) is clamped, so String#repeat never throws and only stars render.
export function ratingStars(rating) {
  const n = Math.min(5, Math.max(0, Math.round(Number(rating)) || 0));
  return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
