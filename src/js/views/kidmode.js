import * as store from '../store.js';
import { getData, SUBJECTS } from '../data.js';
import { el, refreshIcons, toast } from '../ui.js';
import { studentStats, recommendedNext } from '../mastery.js';
import { BADGES, confetti } from '../game.js';
import { keyOf, topicsOn } from '../scheduler.js';
import { openMasteryTest } from './masterytest.js';
import { openRecall, openDueRecall } from './recall.js';
import { openChallenge } from './challenge.js';
import { initials } from '../ui.js';

let overlay = null;

export function openKidMode() {
  const student = store.activeStudent();
  if (!student) { toast('Add a student first', 'error'); return; }
  if (overlay) overlay.remove();

  overlay = el(`<div class="fixed inset-0 z-[95] bg-paper overflow-y-auto"></div>`);
  document.body.appendChild(overlay);
  render(student);
}

function close() { if (overlay) { overlay.remove(); overlay = null; } }

function render(student) {
  const g = store.gameState(student.id);
  const stats = studentStats(student.id);
  const earned = store.earnedBadges(student.id);
  const earnedCount = Object.keys(earned).length;
  const streak = store.activityStreak(student.id);
  const dueRecall = store.recallDueCount(student.id);

  overlay.innerHTML = '';
  const wrap = el(`<div class="min-h-full" style="background:radial-gradient(circle at 20% 0%, #e7f0ea 0%, transparent 45%), radial-gradient(circle at 90% 10%, #fff4e6 0%, transparent 40%), #fbf9f4"></div>`);

  // Top bar
  const top = el(`<div class="max-w-2xl mx-auto px-4 pt-5 flex items-center justify-between">
    <div class="flex items-center gap-2 font-display font-700 text-lg"><span class="w-8 h-8 rounded-lg bg-brand flex items-center justify-center"><i data-lucide="gamepad-2" class="w-4.5 h-4.5 text-white"></i></span>My Learning</div>
    <button id="exit" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-card border border-paper-line text-sm font-medium hover:border-brand/40 transition-colors"><i data-lucide="x" class="w-4 h-4"></i>Exit</button>
  </div>`);
  top.querySelector('#exit').onclick = close;
  wrap.appendChild(top);

  const main = el(`<div class="max-w-2xl mx-auto px-4 py-5 space-y-5"></div>`);

  // Hero: avatar, level, XP bar
  main.appendChild(el(`<div class="rounded-3xl bg-paper-card border border-paper-line p-6 text-center">
    <div class="w-24 h-24 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-3xl font-800 font-display" style="background:${student.color || '#3f7d5e'}">${initials(student.name)}</div>
    <p class="font-display text-2xl font-700">${esc(student.name)}</p>
    <div class="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-brand text-white text-sm font-700"><i data-lucide="star" class="w-4 h-4 fill-current"></i>Level ${g.level}</div>
    <div class="mt-4 max-w-xs mx-auto">
      <div class="h-3 rounded-full bg-paper-line overflow-hidden"><div class="h-full rounded-full bg-brand transition-all" style="width:${g.pct}%"></div></div>
      <p class="text-xs text-ink-faint mt-1.5">${g.into} / ${g.need} XP to level ${g.level + 1}</p>
    </div>
    <div class="flex items-center justify-center gap-4 mt-4 text-sm">
      <span class="flex items-center gap-1.5 font-600"><i data-lucide="flame" class="w-4 h-4 text-[#c08a2e]"></i>${streak} day${streak === 1 ? '' : 's'}</span>
      <span class="flex items-center gap-1.5 font-600"><i data-lucide="medal" class="w-4 h-4 text-[#a3486b]"></i>${earnedCount} badge${earnedCount === 1 ? '' : 's'}</span>
    </div>
  </div>`));

  // Big action buttons
  const actions = el(`<div class="grid grid-cols-2 gap-3"></div>`);
  const bigBtn = (icon, label, sub, color, onClick, badge) => {
    const b = el(`<button class="relative rounded-3xl p-5 text-left text-white transition-transform active:scale-95" style="background:${color}">
      ${badge ? `<span class="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/25 text-white text-xs font-800 flex items-center justify-center">${badge}</span>` : ''}
      <span class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3"><i data-lucide="${icon}" class="w-6 h-6"></i></span>
      <span class="block font-700 text-lg leading-tight">${label}</span>
      <span class="block text-sm text-white/85 mt-0.5">${sub}</span>
    </button>`);
    b.onclick = onClick;
    return b;
  };

  // Next thing to learn
  const nexts = recommendedNext(student.id, 1);
  const nextTopic = nexts[0] ? nexts[0].topic : null;
  actions.appendChild(bigBtn('rocket', 'Learn something new', nextTopic ? nextTopic.name : 'Explore your timeline', '#3f7d5e',
    () => { if (nextTopic) openMasteryTest(nextTopic.subject, null, nextTopic); else toast('Ask a grown-up to open the timeline'); }));

  // Recall
  actions.appendChild(bigBtn('brain', 'Memory review', dueRecall ? `${dueRecall} to review` : 'Keep it sharp', '#7a5a9e',
    () => { if (dueRecall) openDueRecall(); else if (nextTopic) openRecall(nextTopic); else toast('Nothing to review yet — learn a topic first!'); }, dueRecall || 0));

  // Challenge (a mastered topic)
  const d = getData();
  const mastered = Object.entries(store.progressFor(student.id)).filter(([id, v]) => v.status === 'mastered' && d.byId.has(id)).map(([id]) => d.byId.get(id));
  const chTopic = mastered.length ? mastered[Math.floor(Math.random() * mastered.length)] : null;
  actions.appendChild(bigBtn('zap', 'Beat the clock', chTopic ? 'Timed challenge!' : 'Master a topic first', '#c08a2e',
    () => { if (chTopic) openChallenge(chTopic); else toast('Master a topic to unlock challenges!'); }));

  // Badges shelf
  actions.appendChild(bigBtn('medal', 'My badges', `${earnedCount} of ${BADGES.length}`, '#3d6b93', () => renderBadges(student)));

  main.appendChild(actions);

  // Subjects as colorful chips with rings
  const subjWrap = el(`<div><p class="font-700 mb-2 flex items-center gap-1.5"><i data-lucide="layout-grid" class="w-4.5 h-4.5 text-ink-soft"></i>My subjects</p><div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5"></div></div>`);
  const sg = subjWrap.querySelector('div.grid');
  Object.keys(SUBJECTS).forEach(sub => {
    const meta = SUBJECTS[sub]; const s = stats.per[sub];
    sg.appendChild(el(`<div class="rounded-2xl bg-paper-card border border-paper-line p-3 flex flex-col items-center text-center">
      ${kidRing(s.pct, meta.color, meta.icon)}
      <span class="text-xs font-600 mt-2 leading-tight">${sub}</span>
      <span class="text-[11px] font-700 mt-0.5" style="color:${meta.color}">${s.pct}%</span>
    </div>`));
  });
  main.appendChild(subjWrap);

  wrap.appendChild(main);
  overlay.appendChild(wrap);
  refreshIcons();
}

function renderBadges(student) {
  const earned = store.earnedBadges(student.id);
  overlay.innerHTML = '';
  const wrap = el(`<div class="min-h-full" style="background:#fbf9f4"></div>`);
  const top = el(`<div class="max-w-2xl mx-auto px-4 pt-5 flex items-center justify-between">
    <button id="back" class="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"><i data-lucide="arrow-left" class="w-4 h-4"></i>Back</button>
    <button id="exit" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-card border border-paper-line text-sm font-medium"><i data-lucide="x" class="w-4 h-4"></i>Exit</button>
  </div>`);
  top.querySelector('#back').onclick = () => render(student);
  top.querySelector('#exit').onclick = close;
  wrap.appendChild(top);

  const earnedCount = Object.keys(earned).length;
  const main = el(`<div class="max-w-2xl mx-auto px-4 py-5">
    <p class="font-display text-2xl font-700 text-center">My Badges</p>
    <p class="text-sm text-ink-soft text-center mb-5">${earnedCount} of ${BADGES.length} unlocked — collect them all!</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
  </div>`);
  const grid = main.querySelector('div.grid');
  BADGES.forEach(b => {
    const has = !!earned[b.id];
    grid.appendChild(el(`<div class="rounded-2xl border p-4 text-center ${has ? 'bg-paper-card border-paper-line' : 'bg-paper border-dashed border-paper-line'}">
      <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-2 ${has ? '' : 'opacity-30 grayscale'}" style="background:${b.color}1a"><i data-lucide="${has ? b.icon : 'lock'}" class="w-7 h-7" style="color:${b.color}"></i></div>
      <p class="text-sm font-700 ${has ? '' : 'text-ink-faint'}">${b.name}</p>
      <p class="text-[11px] text-ink-faint mt-0.5 leading-snug">${b.desc}</p>
    </div>`));
  });
  wrap.appendChild(main);
  overlay.appendChild(wrap);
  refreshIcons();
  if (earnedCount) setTimeout(() => confetti(60), 200);
}

function kidRing(pct, color, icon) {
  const r = 22, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<span class="relative inline-flex items-center justify-center" style="width:60px;height:60px">
    <svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="${r}" fill="none" stroke="#ece7dd" stroke-width="6"/><circle cx="30" cy="30" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 30 30)"/></svg>
    <i data-lucide="${icon}" class="w-5 h-5 absolute" style="color:${color}"></i>
  </span>`;
}
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
