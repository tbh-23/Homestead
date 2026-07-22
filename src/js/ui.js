// Small UI helpers: DOM, icons, toasts, modals.
import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let iconTimer = null;
export function refreshIcons() {
  clearTimeout(iconTimer);
  iconTimer = setTimeout(() => { try { createIcons({ icons }); } catch (e) {} }, 10);
}

export function toast(msg, kind = 'default') {
  const root = document.getElementById('toast-root');
  const colors = {
    default: 'bg-ink text-white',
    success: 'bg-brand text-white',
    error: 'bg-[#b0413a] text-white',
  };
  const t = el(`<div class="px-4 py-2.5 rounded-lg text-sm font-medium ${colors[kind] || colors.default} shadow-lg flex items-center gap-2 opacity-0 translate-y-2 transition-all duration-300">${esc(msg)}</div>`);
  root.appendChild(t);
  requestAnimationFrame(() => { t.classList.remove('opacity-0', 'translate-y-2'); });
  setTimeout(() => {
    t.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

export function openModal(contentEl, opts = {}) {
  const root = document.getElementById('modal-root');
  const overlay = el(`<div class="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink/40 backdrop-blur-sm opacity-0 transition-opacity duration-200"></div>`);
  const panel = el(`<div class="bg-paper-card w-full ${opts.wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto border border-paper-line translate-y-4 sm:translate-y-0 sm:scale-95 transition-all duration-200"></div>`);
  panel.appendChild(contentEl);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  refreshIcons();
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    panel.classList.remove('translate-y-4', 'sm:scale-95');
  });
  const close = () => {
    overlay.classList.add('opacity-0');
    panel.classList.add('sm:scale-95');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  return { close, panel };
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
