import * as store from '../store.js';
import { el, refreshIcons, openModal, fmtDateTime } from '../ui.js';
import { SUBJECTS } from '../data.js';

const TYPE_META = {
  curriculum: { icon: 'book-marked', color: '#3f7d5e' },
  suggestion: { icon: 'trending-up', color: '#3f7d5e' },
  challenge: { icon: 'trophy', color: '#c08a2e' },
  welcome: { icon: 'party-popper', color: '#7a5a9e' },
  info: { icon: 'info', color: '#3d6b93' },
};

// A bell button with an unread badge; opens the notification center.
export function notificationBell(compact = false) {
  const unread = store.unreadCount();
  const btn = el(`<button class="relative w-9 h-9 rounded-lg border border-paper-line bg-paper-card hover:border-brand/40 transition-colors flex items-center justify-center" title="Notifications">
    <i data-lucide="bell" class="w-4.5 h-4.5 text-ink-soft"></i>
    ${unread ? `<span class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#b0413a] text-white text-[10px] font-700 flex items-center justify-center">${unread > 9 ? '9+' : unread}</span>` : ''}
  </button>`);
  btn.onclick = openNotificationCenter;
  return btn;
}

export function openNotificationCenter() {
  const body = el(`<div class="p-0">
    <div class="sticky top-0 bg-paper-card border-b border-paper-line px-5 py-4 flex items-center gap-3 z-10">
      <span class="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0"><i data-lucide="bell" class="w-5 h-5 text-brand-dark"></i></span>
      <div class="flex-1 min-w-0">
        <h3 class="font-display text-lg font-600 leading-tight">Notifications</h3>
        <p class="text-xs text-ink-faint">Curriculum updates and news</p>
      </div>
      <button id="readall" class="text-xs font-medium text-brand-dark shrink-0">Mark all read</button>
    </div>
    <div id="list" class="px-5 py-4 space-y-2.5"></div>
  </div>`);
  const list = body.querySelector('#list');

  const render = () => {
    const items = store.notifications();
    list.innerHTML = '';
    if (items.length === 0) {
      list.appendChild(el(`<div class="text-center py-10 text-ink-faint">
        <i data-lucide="bell-off" class="w-9 h-9 mx-auto mb-3"></i>
        <p class="text-sm">No notifications yet. We'll let you know when the curriculum is updated.</p>
      </div>`));
    } else {
      items.forEach(n => list.appendChild(notifRow(n, render)));
    }
    refreshIcons();
  };

  body.querySelector('#readall').onclick = () => { store.markAllNotificationsRead(); render(); };
  render();
  openModal(body);
}

function notifRow(n, rerender) {
  const meta = TYPE_META[n.type] || TYPE_META.info;
  const row = el(`<div class="rounded-xl border ${n.read ? 'border-paper-line bg-paper' : 'border-brand/30 bg-brand-light/40'} p-3.5">
    <div class="flex items-start gap-3">
      <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-4 h-4" style="color:${meta.color}"></i></span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <p class="font-600 text-sm leading-snug">${esc(n.title)}</p>
          ${n.read ? '' : '<span class="w-2 h-2 rounded-full bg-[#b0413a] shrink-0"></span>'}
        </div>
        <p class="text-xs text-ink-soft mt-1 leading-relaxed">${esc(n.body)}</p>
        <div class="added mt-2"></div>
        <p class="text-[11px] text-ink-faint mt-2">${fmtDateTime(n.createdAt)}</p>
      </div>
    </div>
  </div>`);

  // Show a small breakdown of new topics by subject when present.
  const abs = n.meta && n.meta.addedBySubject;
  if (abs && Object.keys(abs).length) {
    const addedWrap = row.querySelector('.added');
    const chips = el(`<div class="flex flex-wrap gap-1.5"></div>`);
    Object.entries(abs).forEach(([s, arr]) => {
      const sm = SUBJECTS[s] || { color: '#8a847a' };
      chips.appendChild(el(`<span class="text-[10px] font-medium px-2 py-0.5 rounded-full border" style="border-color:${sm.color}55;color:${sm.color}">${s} +${arr.length}</span>`));
    });
    addedWrap.appendChild(chips);
    if (n.meta.sampleNames && n.meta.sampleNames.length) {
      addedWrap.appendChild(el(`<p class="text-[11px] text-ink-faint mt-1.5 leading-snug">e.g. ${n.meta.sampleNames.slice(0, 4).map(esc).join(', ')}${n.meta.added > 4 ? '…' : ''}</p>`));
    }
  }

  if (!n.read) {
    row.style.cursor = 'pointer';
    row.onclick = () => { store.markNotificationRead(n.id); rerender(); };
  }
  return row;
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
