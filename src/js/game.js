// Gamification engine: XP, levels, badges, and celebration effects.
import * as store from './store.js';
import { getData, SUBJECTS } from './data.js';
import { studentStats } from './mastery.js';
import { el } from './ui.js';

export const XP = {
  topic: 25,       // pass a topic mastery test
  section: 75,     // pass a section check
  subject: 300,    // pass a subject capstone
  recallCard: 4,   // per recall card graded
  recallGood: 2,   // bonus for good/easy
  challenge: 20,    // completing a challenge
  challengeAce: 40, // acing a challenge (>=80%)
};

// Badge catalog. `check(studentId)` returns true when earned.
export const BADGES = [
  { id: 'first-topic', icon: 'sprout', color: '#3f7d5e', name: 'First Steps', desc: 'Master your first topic', check: s => masteredCount(s) >= 1 },
  { id: 'ten-topics', icon: 'trees', color: '#3f7d5e', name: 'Growing Strong', desc: 'Master 10 topics', check: s => masteredCount(s) >= 10 },
  { id: 'fifty-topics', icon: 'mountain', color: '#3f7d5e', name: 'Trailblazer', desc: 'Master 50 topics', check: s => masteredCount(s) >= 50 },
  { id: 'first-section', icon: 'flag', color: '#3d6b93', name: 'Section Sweep', desc: 'Pass a section check', check: s => sectionPasses(s) >= 1 },
  { id: 'first-subject', icon: 'award', color: '#c08a2e', name: 'Subject Champion', desc: 'Master a whole subject', check: s => subjectPasses(s) >= 1 },
  { id: 'streak-3', icon: 'flame', color: '#c08a2e', name: 'On a Roll', desc: '3-day streak', check: s => store.activityStreak(s) >= 3 },
  { id: 'streak-7', icon: 'flame', color: '#b0603a', name: 'Week Warrior', desc: '7-day streak', check: s => store.activityStreak(s) >= 7 },
  { id: 'streak-30', icon: 'crown', color: '#a3486b', name: 'Unstoppable', desc: '30-day streak', check: s => store.activityStreak(s) >= 30 },
  { id: 'recall-50', icon: 'brain', color: '#7a5a9e', name: 'Memory Master', desc: 'Review 50 recall cards', check: s => recallReviews(s) >= 50 },
  { id: 'challenge-ace', icon: 'zap', color: '#c08a2e', name: 'Challenge Ace', desc: 'Ace a timed challenge', check: s => challengeAces(s) >= 1 },
  { id: 'level-5', icon: 'star', color: '#3d6b93', name: 'Rising Star', desc: 'Reach level 5', check: s => store.gameState(s).level >= 5 },
  { id: 'level-10', icon: 'sparkles', color: '#a3486b', name: 'Superstar', desc: 'Reach level 10', check: s => store.gameState(s).level >= 10 },
];

function masteredCount(studentId) {
  const d = getData();
  const prog = store.progressFor(studentId);
  return Object.entries(prog).filter(([id, v]) => v.status === 'mastered' && d.byId.has(id)).length;
}
function sectionPasses(studentId) {
  return (store.testsFor(studentId) || []).filter(t => t.scope === 'section' && t.passed).length;
}
function subjectPasses(studentId) {
  return (store.testsFor(studentId) || []).filter(t => (t.scope || 'subject') === 'subject' && t.passed).length;
}
function recallReviews(studentId) {
  const r = store.get().recall[studentId] || {};
  return Object.values(r).reduce((n, c) => n + (c.reps || 0), 0);
}
function challengeAces(studentId) {
  return (store.challengesFor(studentId) || []).filter(c => c.total && (c.correct / c.total) >= 0.8).length;
}

// Central award: grant XP, then check every badge. Fires celebration + returns summary.
export function award(studentId, kind, amount) {
  const xpGain = amount != null ? amount : (XP[kind] || 0);
  const res = store.awardXp(studentId, xpGain);
  const newBadges = [];
  BADGES.forEach(b => {
    if (!store.hasBadge(studentId, b.id)) {
      try { if (b.check(studentId)) { if (store.grantBadge(studentId, b.id)) newBadges.push(b); } } catch {}
    }
  });
  celebrate({ xp: xpGain, leveledUp: res && res.leveledUp, level: res && res.level, badges: newBadges });
  return { xp: xpGain, leveledUp: res && res.leveledUp, level: res && res.level, badges: newBadges };
}

// ---- Celebration effects ----
let audioCtx = null;
function beep(freqs = [660, 880], dur = 0.12) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      o.connect(g); g.connect(audioCtx.destination);
      const t = now + i * dur;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    });
  } catch {}
}

export function confetti(count = 90) {
  const colors = ['#3f7d5e', '#c08a2e', '#3d6b93', '#b0603a', '#7a5a9e', '#a3486b'];
  const layer = el(`<div class="fixed inset-0 z-[120] pointer-events-none overflow-hidden"></div>`);
  document.body.appendChild(layer);
  const W = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const left = Math.random() * W;
    const size = 6 + Math.random() * 8;
    const color = colors[i % colors.length];
    const delay = Math.random() * 0.25;
    const dur = 1.6 + Math.random() * 1.4;
    const rot = Math.random() * 360;
    const drift = (Math.random() - 0.5) * 160;
    const p = el(`<span style="position:absolute;top:-20px;left:${left}px;width:${size}px;height:${size * 0.6}px;background:${color};border-radius:2px;opacity:0.95;transform:rotate(${rot}deg);"></span>`);
    p.animate([
      { transform: `translate(0,0) rotate(${rot}deg)`, opacity: 1 },
      { transform: `translate(${drift}px, ${window.innerHeight + 40}px) rotate(${rot + 540}deg)`, opacity: 1 },
    ], { duration: dur * 1000, delay: delay * 1000, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    layer.appendChild(p);
  }
  setTimeout(() => layer.remove(), 3200);
}

function celebrate({ xp, leveledUp, level, badges }) {
  if (badges && badges.length) { confetti(120); beep([660, 880, 1100], 0.12); showBadgePopup(badges[0], badges.length); }
  else if (leveledUp) { confetti(120); beep([523, 659, 784, 1046], 0.11); showLevelPopup(level); }
  else if (xp) { flashXp(xp); beep([740, 988], 0.09); }
}

function flashXp(xp) {
  const chip = el(`<div class="fixed z-[120] left-1/2 -translate-x-1/2 bottom-24 lg:bottom-10 px-4 py-2 rounded-full bg-brand text-white font-700 text-sm flex items-center gap-1.5 pointer-events-none" style="box-shadow:0 6px 20px rgba(47,96,73,.35)"><span>+${xp} XP</span></div>`);
  document.body.appendChild(chip);
  chip.animate([
    { transform: 'translate(-50%, 12px)', opacity: 0 },
    { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.15 },
    { transform: 'translate(-50%, -8px)', opacity: 1, offset: 0.8 },
    { transform: 'translate(-50%, -20px)', opacity: 0 },
  ], { duration: 1600, easing: 'ease-out' });
  setTimeout(() => chip.remove(), 1650);
}

function popup(inner) {
  const ov = el(`<div class="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-ink/40 backdrop-blur-sm opacity-0 transition-opacity duration-200"></div>`);
  const card = el(`<div class="bg-paper-card rounded-2xl border border-paper-line p-7 text-center max-w-xs w-full scale-95 transition-transform duration-200">${inner}</div>`);
  ov.appendChild(card); document.body.appendChild(ov);
  requestAnimationFrame(() => { ov.classList.remove('opacity-0'); card.classList.remove('scale-95'); });
  const close = () => { ov.classList.add('opacity-0'); setTimeout(() => ov.remove(), 200); };
  ov.addEventListener('click', close);
  setTimeout(close, 4200);
  return card;
}

function showLevelPopup(level) {
  const card = popup(`
    <div class="w-20 h-20 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4"><span class="text-3xl font-800 font-display text-brand-dark">${level}</span></div>
    <p class="text-xs font-600 uppercase tracking-wide text-brand-dark mb-1">Level up!</p>
    <p class="font-display text-2xl font-700">You reached level ${level}</p>
    <p class="text-sm text-ink-soft mt-1">Keep going — you're doing amazing!</p>
    <button class="ok mt-5 w-full px-4 py-2.5 rounded-xl bg-brand text-white font-medium">Woohoo!</button>`);
  card.querySelector('.ok').onclick = () => card.closest('.fixed').click();
  import('./ui.js').then(m => m.refreshIcons());
}

function showBadgePopup(badge, count) {
  const extra = count > 1 ? `<p class="text-xs text-ink-faint mt-1">+${count - 1} more badge${count > 2 ? 's' : ''} earned!</p>` : '';
  const card = popup(`
    <div class="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style="background:${badge.color}1a"><i data-lucide="${badge.icon}" class="w-10 h-10" style="color:${badge.color}"></i></div>
    <p class="text-xs font-600 uppercase tracking-wide mb-1" style="color:${badge.color}">Badge unlocked!</p>
    <p class="font-display text-2xl font-700">${badge.name}</p>
    <p class="text-sm text-ink-soft mt-1">${badge.desc}</p>
    ${extra}
    <button class="ok mt-5 w-full px-4 py-2.5 rounded-xl text-white font-medium" style="background:${badge.color}">Awesome!</button>`);
  card.querySelector('.ok').onclick = () => card.closest('.fixed').click();
  import('./ui.js').then(m => m.refreshIcons());
}
