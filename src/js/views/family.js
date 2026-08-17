// Family view: one screen for a parent teaching several children. Shows each
// child's plan for today (scheduled topics + what's due) side by side, plus a
// friendly sibling leaderboard (XP, level, streak). Everything is local to the
// parent's own account — no data leaves the family.
import * as store from '../store.js';
import { el, esc, refreshIcons } from '../ui.js';
import { SUBJECTS } from '../data.js';
import { keyOf, topicsOn } from '../scheduler.js';
import { studentStats } from '../mastery.js';

const MEDAL = ['#c8a63a', '#a7adb5', '#b3814e']; // gold / silver / bronze

export function renderFamily(params, { navigate }) {
  const state = store.get();
  const root = el(`<div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 fade-up"></div>`);

  root.appendChild(el(`<div class="mb-5">
    <h1 class="font-display text-2xl sm:text-3xl font-600">Family</h1>
    <p class="text-ink-soft text-sm mt-1">Today across everyone you're teaching, and how they're doing.</p>
  </div>`));

  if (state.students.length === 0) {
    root.appendChild(el(`<p class="text-ink-soft">Add a student to see the family view.</p>`));
    return root;
  }

  const todayKey = keyOf(new Date());
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  // ---- Today, per child ----
  root.appendChild(el(`<h2 class="font-600 mb-3 flex items-center gap-2"><i data-lucide="calendar-check" class="w-4.5 h-4.5 text-brand-dark"></i>Today · ${dateLabel}</h2>`));
  const grid = el(`<div class="grid md:grid-cols-2 gap-4 mb-8"></div>`);
  state.students.forEach(s => grid.appendChild(childToday(s, todayKey, navigate)));
  root.appendChild(grid);

  // ---- Sibling leaderboard (only meaningful with 2+ children) ----
  if (state.students.length >= 2) {
    root.appendChild(el(`<h2 class="font-600 mb-3 flex items-center gap-2"><i data-lucide="trophy" class="w-4.5 h-4.5 text-[#c08a2e]"></i>Sibling board</h2>`));
    const ranked = state.students
      .map(s => ({ s, g: store.gameState(s.id), streak: store.activityStreak(s.id), badges: Object.keys(store.earnedBadges(s.id)).length }))
      .sort((a, b) => b.g.xp - a.g.xp);

    const board = el(`<div class="bg-paper-card border border-paper-line rounded-2xl p-3 sm:p-4 space-y-2"></div>`);
    ranked.forEach((row, i) => {
      const medal = MEDAL[i];
      const rank = el(`<div class="flex items-center gap-3 p-2.5 rounded-xl ${i === 0 ? 'bg-brand-light/40' : ''}">
        <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-800 shrink-0" style="${medal ? `background:${medal}22;color:${medal}` : 'background:#f0ece3;color:#8a847a'}">${i + 1}</span>
        <span class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-600 shrink-0" style="background:${row.s.color || '#8a847a'}">${esc((row.s.name || '?').slice(0, 1).toUpperCase())}</span>
        <div class="flex-1 min-w-0">
          <p class="font-600 text-sm truncate">${esc(row.s.name)}</p>
          <p class="text-xs text-ink-faint">Level ${row.g.level} · ${row.g.xp.toLocaleString()} XP</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-sm font-600 flex items-center gap-1 justify-end" style="color:${row.streak > 0 ? '#c08a2e' : '#8a847a'}"><i data-lucide="flame" class="w-3.5 h-3.5"></i>${row.streak}</p>
          <p class="text-[11px] text-ink-faint">${row.badges} badge${row.badges === 1 ? '' : 's'}</p>
        </div>
      </div>`);
      board.appendChild(rank);
    });
    root.appendChild(board);
    root.appendChild(el(`<p class="text-[11px] text-ink-faint mt-2 text-center">A little friendly momentum — every child learns at their own pace.</p>`));
  }

  refreshIcons();
  return root;
}

function childToday(s, todayKey, navigate) {
  const topics = topicsOn(s, todayKey);
  const dueRecall = store.recallDueCount(s.id);
  const duePractice = store.practiceDueCount(s.id);
  const stats = studentStats(s.id);
  const active = store.activeStudent();
  const isActive = active && active.id === s.id;

  const card = el(`<div class="bg-paper-card border ${isActive ? 'border-brand/40' : 'border-paper-line'} rounded-2xl p-4">
    <div class="flex items-center gap-3 mb-3">
      <span class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-600 shrink-0" style="background:${s.color || '#8a847a'}">${esc((s.name || '?').slice(0, 1).toUpperCase())}</span>
      <div class="flex-1 min-w-0">
        <p class="font-600 text-sm truncate">${esc(s.name)}${isActive ? ' <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand text-white align-middle">Active</span>' : ''}</p>
        <p class="text-xs text-ink-faint">Age ${store.studentAge(s) ?? '—'} · ${stats.pct}% mastered</p>
      </div>
      <button class="open shrink-0 text-xs font-medium text-brand-dark flex items-center gap-1">Open<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
    </div>
    <div class="flex gap-2 mb-3">
      ${chip('brain', dueRecall, 'recall due', dueRecall > 0)}
      ${chip('repeat', duePractice, 'practice due', duePractice > 0)}
    </div>
    <div class="today space-y-1.5"></div>
  </div>`);

  card.querySelector('.open').onclick = () => { store.setActiveStudent(s.id); navigate('dashboard'); };

  const todayWrap = card.querySelector('.today');
  if (topics.length === 0) {
    todayWrap.appendChild(el(`<p class="text-xs text-ink-faint">No new topics scheduled — a review day.</p>`));
  } else {
    topics.slice(0, 5).forEach(t => {
      const meta = SUBJECTS[t.subject] || { color: '#8a847a', icon: 'circle' };
      const row = el(`<button class="w-full text-left flex items-center gap-2.5 p-2 rounded-lg border border-paper-line hover:border-brand/40 hover:bg-paper transition-colors">
        <span class="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style="background:${meta.color}18"><i data-lucide="${meta.icon}" class="w-3 h-3" style="color:${meta.color}"></i></span>
        <span class="flex-1 min-w-0"><span class="block text-xs font-600 truncate">${esc(t.name)}</span></span>
      </button>`);
      row.onclick = () => { store.setActiveStudent(s.id); navigate('topic', { id: t.id }); };
      todayWrap.appendChild(row);
    });
    if (topics.length > 5) todayWrap.appendChild(el(`<p class="text-[11px] text-ink-faint pl-1">+${topics.length - 5} more</p>`));
  }
  return card;
}

function chip(icon, n, label, on) {
  return `<span class="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${on ? 'bg-brand-light text-brand-dark' : 'bg-paper text-ink-faint border border-paper-line'}">
    <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${n} ${label}</span>`;
}
