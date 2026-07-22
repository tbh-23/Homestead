import * as store from '../store.js';
import { el, initials, openModal, toast } from '../ui.js';
import { notificationBell } from './notifications.js';
import { openGuide } from './guide.js';

const NAV = [
  { name: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { name: 'calendar', label: 'Calendar', icon: 'calendar-days' },
  { name: 'timeline', label: 'Timeline', icon: 'git-branch' },
  { name: 'records', label: 'Records', icon: 'notebook-pen' },
  { name: 'insights', label: 'Insights', icon: 'sparkles' },
];

export function renderShell({ route, navigate, content }) {
  const state = store.get();
  const active = store.activeStudent();

  const wrap = el(`<div class="min-h-screen flex flex-col lg:flex-row"></div>`);

  // Sidebar (desktop)
  const side = el(`
    <aside class="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-paper-line bg-paper-card/60 sticky top-0 h-screen">
      <div class="px-5 py-5 flex items-center gap-2.5 border-b border-paper-line">
        <div class="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
          <i data-lucide="compass" class="w-4.5 h-4.5 text-white"></i>
        </div>
        <span class="font-display text-lg font-600 flex-1">Homestead</span>
        <span id="bell-desktop"></span>
      </div>
      <div class="p-3" id="student-switch"></div>
      <nav class="px-3 flex-1 space-y-1" id="nav-desktop"></nav>
      <div class="p-3 border-t border-paper-line" id="account"></div>
    </aside>`);

  side.querySelector('#bell-desktop').appendChild(notificationBell());
  side.querySelector('#student-switch').appendChild(studentSwitcher(navigate));

  const navD = side.querySelector('#nav-desktop');
  NAV.forEach(item => {
    const a = el(`<button class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-soft hover:bg-paper-line/50 transition-colors ${route.name === item.name ? 'nav-active' : ''}">
      <i data-lucide="${item.icon}" class="w-4.5 h-4.5"></i>${item.label}</button>`);
    a.onclick = () => navigate(item.name);
    navD.appendChild(a);
  });

  // Guide (opens a modal, not a route)
  const guideBtn = el(`<button class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-soft hover:bg-paper-line/50 transition-colors">
    <i data-lucide="book-open" class="w-4.5 h-4.5"></i>Guide</button>`);
  guideBtn.onclick = () => openGuide();
  navD.appendChild(guideBtn);

  side.querySelector('#account').appendChild(accountBox());

  // Top bar (mobile)
  const top = el(`
    <header class="lg:hidden sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-paper-line px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
          <i data-lucide="compass" class="w-4 h-4 text-white"></i>
        </div>
        <span class="font-display font-600">Homestead</span>
      </div>
      <div class="flex items-center gap-2">
        <span id="mob-bell"></span>
        <div id="mob-student"></div>
      </div>
    </header>`);
  top.querySelector('#mob-bell').appendChild(notificationBell(true));
  top.querySelector('#mob-student').appendChild(studentSwitcher(navigate, true));

  // Bottom nav (mobile)
  const bottom = el(`<nav class="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-paper-card/95 backdrop-blur border-t border-paper-line grid grid-cols-5"></nav>`);
  NAV.forEach(item => {
    const b = el(`<button class="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${route.name === item.name ? 'text-brand-dark' : 'text-ink-faint'}">
      <i data-lucide="${item.icon}" class="w-5 h-5"></i>${item.label}</button>`);
    b.onclick = () => navigate(item.name);
    bottom.appendChild(b);
  });

  const main = el(`<div class="flex-1 min-w-0 flex flex-col"></div>`);
  main.appendChild(top);
  const scroll = el(`<div class="flex-1 pb-24 lg:pb-0"></div>`);
  scroll.appendChild(content);
  main.appendChild(scroll);
  main.appendChild(bottom);

  wrap.appendChild(side);
  wrap.appendChild(main);
  return wrap;
}

function studentSwitcher(navigate, compact = false) {
  const state = store.get();
  const active = store.activeStudent();
  const btn = el(`
    <button class="w-full flex items-center gap-2.5 ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'} rounded-xl border border-paper-line bg-paper-card hover:border-brand/40 transition-colors">
      <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-600 shrink-0" style="background:${active?.color || '#8a847a'}">${active ? initials(active.name) : '?'}</span>
      ${compact ? '' : `<span class="flex-1 text-left min-w-0"><span class="block text-sm font-600 truncate">${active ? active.name : 'No student'}</span><span class="block text-xs text-ink-faint">${active ? 'Age ' + store.studentAge(active) : 'Add a student'}</span></span>`}
      <i data-lucide="chevrons-up-down" class="w-4 h-4 text-ink-faint shrink-0"></i>
    </button>`);
  btn.onclick = () => openStudentMenu(navigate);
  return btn;
}

function openStudentMenu(navigate) {
  const state = store.get();
  const body = el(`<div class="p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-display text-lg font-600">Students</h3>
      <button id="add" class="text-sm font-medium text-brand-dark flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i>Add</button>
    </div>
    <div id="list" class="space-y-2"></div>
  </div>`);
  const list = body.querySelector('#list');
  state.students.forEach(s => {
    const age = store.studentAge(s);
    const isActive = s.id === state.activeStudentId;
    const row = el(`<div class="flex items-center gap-3 p-2.5 rounded-xl border ${isActive ? 'border-brand/50 bg-brand-light/50' : 'border-paper-line'}">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-600" style="background:${s.color}">${initials(s.name)}</span>
      <div class="flex-1 min-w-0">
        <p class="font-600 text-sm truncate">${s.name}</p>
        <p class="text-xs text-ink-faint">Age ${age} · born ${s.birthYear}</p>
      </div>
      ${isActive ? '<span class="text-xs font-medium text-brand-dark px-2 py-0.5 rounded-full bg-brand/10">Active</span>' : '<button class="select text-xs font-medium text-ink-soft px-2.5 py-1 rounded-lg border border-paper-line hover:border-brand/40">Switch</button>'}
      <button class="del text-ink-faint hover:text-[#b0413a] p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
    </div>`);
    row.querySelector('.select')?.addEventListener('click', () => { store.setActiveStudent(s.id); m.close(); toast('Switched to ' + s.name); });
    row.querySelector('.del').addEventListener('click', () => {
      if (confirm(`Remove ${s.name}? This deletes their progress and records.`)) { store.removeStudent(s.id); m.close(); }
    });
    list.appendChild(row);
  });
  body.querySelector('#add').onclick = () => { m.close(); openAddStudent(); };
  const m = openModal(body);
}

function openAddStudent() {
  const body = el(`<div class="p-5">
    <h3 class="font-display text-lg font-600 mb-4">Add a student</h3>
    <form id="f" class="space-y-4">
      <div>
        <label class="text-sm font-medium block mb-1.5">Name</label>
        <input name="name" required class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <div>
        <label class="text-sm font-medium block mb-1.5">Birth year</label>
        <input name="birthYear" type="number" min="2005" max="2024" required class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
      </div>
      <button class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors">Add student</button>
    </form>
  </div>`);
  body.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.addStudent(fd.get('name').trim(), parseInt(fd.get('birthYear'), 10));
    toast('Student added', 'success');
    m.close();
  };
  const m = openModal(body);
}

function accountBox() {
  const state = store.get();
  const box = el(`<div class="flex items-center gap-2.5">
    <div class="w-8 h-8 rounded-lg bg-paper-line flex items-center justify-center">
      <i data-lucide="user" class="w-4 h-4 text-ink-soft"></i>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-xs font-600 truncate">${state.user?.username || 'Parent'}</p>
      <button id="out" class="text-xs text-ink-faint hover:text-ink-soft">Sign out</button>
    </div>
  </div>`);
  box.querySelector('#out').onclick = () => store.signOut();
  return box;
}
