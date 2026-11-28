// Shared fixtures for every e2e spec:
//   api      – family-state helpers over the HTTP API (works with or without If-Match)
//   mockAi   – read/clear the mock provider's request log, force failures
//   shot     – shot(name) writes docs/e2e/screenshots/<area>/<nn>-<name>.jpg
//   errors   – console errors and page errors seen during the test
//   gotoApp  – seed a family, open the app and wait until it has rendered
// Options:
//   tour        – false (default) marks the welcome tour as seen before load
//   fixedClock  – true (default) pins Date to FIXED_NOW (timers keep running)
import { test as base, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXED_NOW, URLS } from './support/env.mjs';
import { familyState } from './support/family.mjs';
import { SCHEMA_VERSION } from '../../src/js/schema.js';

export { expect };
export const SHOTS_DIR = fileURLToPath(new URL('../../docs/e2e/screenshots/', import.meta.url));
const shotsEnabled = process.env.E2E_SCREENSHOTS !== '0';
const shotCounters = new Map();

export class Api {
  constructor(request, baseURL) {
    this.request = request;
    this.baseURL = baseURL;
  }

  url(path) { return new URL(path, this.baseURL).toString(); }

  async getState() {
    const res = await this.request.get(this.url('/api/state'));
    expect(res.ok()).toBeTruthy();
    return { state: await res.json(), etag: res.headers().etag || null };
  }

  // Writes the whole family state. Today the server ignores versions; once
  // versioned state lands (HAR-10) it wants the ETag back as If-Match, so we
  // always read first and retry once on a precondition failure.
  async putState(state) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { etag } = await this.getState();
      const headers = { 'Content-Type': 'application/json' };
      if (etag) headers['If-Match'] = etag;
      const res = await this.request.put(this.url('/api/state'), { headers, data: state });
      if (res.ok()) return res;
      if (![409, 412, 428].includes(res.status())) {
        throw new Error(`PUT /api/state failed: ${res.status()} ${await res.text()}`);
      }
    }
    throw new Error('PUT /api/state kept failing its precondition');
  }

  async reset() { await this.putState({ schemaVersion: SCHEMA_VERSION, students: [] }); }

  // Restores `doc` the way a parent restores a backup (README, "Backup and
  // restore"): family-state.json is replaced as it is, `version` and
  // `writeId` included, so the server's version can move backwards. The
  // launcher (start-app.mjs) leaves the data directory's path in the system
  // temp folder, named after the port.
  async restoreState(doc) {
    const { port } = new URL(this.baseURL);
    const { dataDir } = JSON.parse(await readFile(join(tmpdir(), `harrington-e2e-${port}.json`), 'utf8'));
    await writeFile(join(dataDir, 'family-state.json'), `${JSON.stringify(doc, null, 2)}\n`);
    expect((await this.getState()).state.version).toBe(doc.version);
  }

  async seed(options) {
    const state = familyState(options);
    await this.putState(state);
    return state;
  }

  // The browser saves 400 ms after a change; poll the server until it agrees.
  async waitForState(predicate, message = 'saved family state') {
    await expect.poll(async () => predicate((await this.getState()).state), { message, timeout: 10_000 }).toBeTruthy();
    return (await this.getState()).state;
  }
}

export class MockAi {
  constructor(request) { this.request = request; }
  async log() { return (await this.request.get(`${URLS.mockAi}/__log`)).json(); }
  async kinds() { return (await this.log()).map((entry) => entry.kind); }
  async clear() { await this.request.delete(`${URLS.mockAi}/__log`); }
  async failNext(count = 1) { await this.request.post(`${URLS.mockAi}/__fail`, { data: { count } }); }
  async malformedNext(count = 1) { await this.request.post(`${URLS.mockAi}/__malformed`, { data: { count } }); }
  async stopFailing() { await this.request.delete(`${URLS.mockAi}/__fail`); }
}

function areaFor(testInfo) {
  const file = basename(testInfo.file).replace(/\.spec\.mjs$/, '');
  // A spec that also runs in the phone project keeps its phone shots apart.
  return testInfo.project.name === 'mobile' && file !== 'mobile' ? `${file}-mobile` : file;
}

// Waits until the page stops changing so the same step gives the same image
// on every run: the pointer is moved off whatever was clicked last (no hover
// styles), web fonts and images are loaded, Lucide has swapped every
// <i data-lucide> for its SVG, and the scroll position has stopped moving.
// The screenshot itself then disables CSS animations and transitions.
async function settle(target, { full = false } = {}) {
  await target.mouse.move(0, 0);
  // Full-page captures draw fixed elements (sidebar, toasts) at the current
  // scroll offset, so start them from the top.
  if (full) await target.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await target.waitForTimeout(150); // modal fade-ins and toasts start on a timer
  await target.waitForFunction(async () => {
    await document.fonts.ready;
    if (document.querySelector('i[data-lucide]')) return false;
    if ([...document.images].some((img) => !img.complete)) return false;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const at = () => `${window.scrollX},${window.scrollY},${[...document.querySelectorAll('*')].filter((n) => n.scrollTop).map((n) => n.scrollTop).join()}`;
    const before = at();
    for (let i = 0; i < 6; i += 1) await frame();
    return at() === before;
  }, null, { timeout: 5_000, polling: 100 }).catch(() => {});
  await target.waitForTimeout(200);
}

export const test = base.extend({
  tour: [false, { option: true }],
  fixedClock: [true, { option: true }],
  fixedRandom: [true, { option: true }],

  errors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    await use(errors);
  },

  page: async ({ page, tour, fixedClock, fixedRandom }, use) => {
    if (fixedClock) await page.clock.setFixedTime(FIXED_NOW);
    // Seeded Math.random for every tab in the test's context. The app derives
    // learner ids from it, and the daily refresher and choices from the
    // learner id, so without this each run plans a different day. Each page
    // load gets its own stream, numbered in localStorage, so a reload or a
    // second tab never repeats the ids of the first (the clock is fixed too),
    // and every test starts from the same numbering.
    // The app sets `html { scroll-behavior: smooth }`, so Playwright's
    // scroll-into-view glides and a re-render can stop it anywhere; where a
    // screen ends up scrolled would then vary from run to run.
    await page.context().addInitScript(() => {
      const add = () => {
        const style = document.createElement('style');
        style.textContent = 'html { scroll-behavior: auto !important; }';
        (document.head || document.documentElement).appendChild(style);
      };
      if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
    });
    if (fixedRandom) {
      await page.context().addInitScript(() => {
        const KEY = 'e2e:page-loads';
        let load = 1;
        try { load = (Number(localStorage.getItem(KEY)) || 0) + 1; localStorage.setItem(KEY, String(load)); } catch {}
        let s = (Math.imul(load, 0x9e3779b1) ^ 0x2468ace) >>> 0;
        Math.random = () => {
          s = (s + 0x6d2b79f5) >>> 0;
          let t = s;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      });
    }
    if (!tour) {
      await page.addInitScript(() => { try { localStorage.setItem('harrington:welcomeSeen', '1'); } catch {} });
    }
    await use(page);
  },

  api: async ({ request, baseURL }, use) => {
    const api = new Api(request, baseURL);
    // Every test starts from an empty family.
    await api.reset();
    await use(api);
  },

  // A failure armed by one test never leaks into the next, even if that test
  // stopped before the app used it up.
  mockAi: async ({ request }, use) => {
    const mock = new MockAi(request);
    await mock.stopFailing();
    await use(mock);
    await mock.stopFailing();
  },

  shot: async ({ page }, use, testInfo) => {
    const area = areaFor(testInfo);
    await use(async (name, { full = true, locator = null, target = page } = {}) => {
      if (!shotsEnabled) return;
      const n = (shotCounters.get(area) || 0) + 1;
      shotCounters.set(area, n);
      const dir = join(SHOTS_DIR, area);
      await mkdir(dir, { recursive: true });
      // A modal or the child view is fixed to the viewport; a full-page
      // capture would show the page underneath it below the fold.
      // (A modal that is closing stays in the DOM while it fades; give it time.)
      if (!locator && full) {
        const open = target.locator('#modal-root > div, [role="dialog"]');
        await expect(open).toHaveCount(0, { timeout: 2_000 }).catch(() => {
          throw new Error(`shot('${name}'): a modal or overlay is open; pass { full: false } or a locator`);
        });
      }
      await settle(target, { full: !locator && full });
      const path = join(dir, `${String(n).padStart(2, '0')}-${name}.jpg`);
      // Long full-page captures are most of the bytes; they go out a little
      // softer than viewport and element shots.
      const quality = !locator && full ? 55 : 70;
      const options = { path, type: 'jpeg', quality, animations: 'disabled', caret: 'hide' };
      if (locator) await locator.screenshot(options);
      else await target.screenshot({ ...options, fullPage: full });
    });
  },

  // Seed the family (or not) and open a route, waiting for the shell.
  gotoApp: async ({ page, api }, use) => {
    await use(async ({ seed = {}, hash = '' } = {}) => {
      if (seed !== null) await api.seed(seed);
      await page.goto(`/${hash ? `#${hash}` : ''}`);
      await expect(page.getByText('Loading your homeschool workspace')).toHaveCount(0, { timeout: 30_000 });
    });
  },
});

// ---- Small page helpers used across specs ----

export function modal(page) {
  // The top-most open modal panel.
  return page.locator('#modal-root > div').last();
}

export async function closeModal(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
}

export function nav(page, label) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label, exact: true }).first();
}

export async function expectToast(page, text) {
  await expect(page.locator('#toast-root').getByText(text).first()).toBeVisible();
}

export async function noHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { message: 'page should not scroll sideways' }).toBeLessThanOrEqual(0);
}

export async function clickRealm(page, subject) {
  await page.locator('g.world-realm', { has: page.locator(`text=${subject}`) }).locator('path').first().click({ force: true });
}

// Passing a test or finishing a challenge may pop a "Badge unlocked!" or
// "Level up!" card above everything for ~4 s. Dismiss it if it is there.
export async function dismissCelebration(page) {
  const popup = page.getByRole('button', { name: /^(Awesome!|Woohoo!)$/ });
  try { await popup.click({ timeout: 2500 }); } catch {}
  await expect(page.getByText(/^(Badge unlocked!|Level up!)$/)).toHaveCount(0, { timeout: 6000 });
}

// Topic page manual status (HAR-14): the "Set status" group beside the growth chip.
export async function setTopicStatus(page, label) {
  await page.getByRole('group', { name: 'Set status' }).getByRole('button', { name: label, exact: true }).click();
}

// The child view overlay (HAR-15 gives it role=dialog).
export function childView(page) {
  return page.getByRole('dialog', { name: 'Child view' });
}

export const TEST_PIN = '2468';

// "Grown-ups" asks for the parent PIN when one is set, or returns straight
// to the parent view when none is set (HAR-57).
export async function leaveChildView(page, pin = TEST_PIN) {
  const view = childView(page);
  await view.getByRole('button', { name: 'Back to the grown-up view' }).click();
  if (await view.count() > 0) {
    await expect(view.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
    await view.getByLabel('Grown-up PIN').fill(pin);
    await view.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(view).toHaveCount(0);
}
