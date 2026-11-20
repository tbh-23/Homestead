// Family data safety (HAR-10): versioned saves, export, import, and what a
// second tab sees when the first one saved first.
import { test, expect, modal, expectToast, nav, setTopicStatus } from './fixtures.mjs';
import { FIXED_NOW, TODAY_KEY } from './support/env.mjs';
import { LEARNERS, TOPICS, familyState } from './support/family.mjs';
import { SCHEMA_VERSION } from '../../src/js/schema.js';
import { pinSettings } from '../../src/js/pin.js';

const ROWAN = LEARNERS.rowan.id;
const exportButton = (page) => page.getByRole('button', { name: 'Export', exact: true });
const importButton = (page) => page.getByRole('button', { name: 'Import', exact: true });

async function downloadExport(page, trigger) {
  await trigger.click();
  const dialog = modal(page);
  await expect(dialog.getByRole('heading', { name: 'Export family data?' })).toBeVisible();
  await expect(dialog).toContainText('in plain text (not encrypted)');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download export' }).click(),
  ]);
  return download;
}

async function chooseImportFile(page, content) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importButton(page).click()]);
  await chooser.setFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
}

test('export downloads the whole family document as JSON, the PIN only as a salted hash (F16)', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'mastered' }, records: [{ type: 'observation', title: 'Counted to 12' }], extra: { settings: pinSettings({}, '2468', 'a'.repeat(32)) } } });
  await shot('sidebar-export-import', { locator: page.locator('aside') });
  const download = await downloadExport(page, exportButton(page));
  await expectToast(page, 'Family data exported');
  expect(download.suggestedFilename()).toBe('harrington-family-2026-10-07.json');
  const doc = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(doc.students.map((s) => s.name)).toEqual(['Wren Example', 'Rowan Example', 'Sage Example']);
  expect(doc.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('mastered');
  expect(doc.records[ROWAN][0].title).toBe('Counted to 12');
  expect(doc.exportedAt).toBe(FIXED_NOW.toISOString());
  expect(doc.taxonomyVersion).toBe('v1');
  expect(Number.isInteger(doc.version)).toBe(true);
  // F16: the file carries only the salted hash. (A plain PIN can no longer be
  // stored: the server refuses it at the current data format. Hashing an older
  // document's plain PIN is covered in family-data.test.mjs and schema.test.mjs.)
  expect(doc.settings.parentPin).toBeUndefined();
  expect(doc.settings.parentPinHash).toMatch(/^[0-9a-f]{64}$/);
  expect(doc.settings.parentPinSalt).toMatch(/^[0-9a-f]{32}$/);
  expect(JSON.stringify(doc)).not.toContain('"2468"');
});

test('round trip: the exported file previews, cancel keeps the data, confirm restores it exactly', async ({ page, api, gotoApp, shot }) => {
  // The family to export: one learner with progress and a record.
  await gotoApp({ seed: { learners: ['sage'], active: 'sage', progress: { [TOPICS.oneToOne.id]: 'mastered', [TOPICS.howMany.id]: 'learning' }, records: [{ type: 'question', title: 'Exported question' }] } });
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
  const download = await downloadExport(page, exportButton(page));
  const file = Buffer.concat(await (await download.createReadStream()).toArray());
  const before = (await api.getState()).state;

  // The family changes afterwards (the three-learner family replaces it).
  await api.seed({});
  await page.reload();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

  // Cancel first.
  await chooseImportFile(page, file);
  const preview = modal(page);
  await expect(preview.getByRole('heading', { name: 'Import family data?' })).toBeVisible();
  await expect(preview).toContainText('Sage Example');
  await expect(preview).toContainText('2 topics · 1 record · 0 tests');
  await expect(preview).toContainText('Recordings are not part of the file.');
  await shot('import-preview', { full: false });
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  expect((await api.getState()).state.students).toHaveLength(3);

  // Then the same file, confirmed.
  await chooseImportFile(page, file);
  await modal(page).getByRole('button', { name: 'Replace family data' }).click();
  await expectToast(page, 'Family data imported');
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
  const restored = await api.waitForState((s) => s.students?.length === 1);
  // Everything the export carried comes back; only the save bookkeeping differs.
  const strip = ({ version, updatedAt, writeId, exportedAt, taxonomyVersion, ...rest }) => rest;
  expect(strip(restored)).toEqual(strip(before));
  expect(restored.version).toBeGreaterThan(before.version);

  // It survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: "Sage Example's Wednesday" })).toBeVisible();
});

test('import refuses files that are not a family export', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {} });
  await chooseImportFile(page, 'this is not json');
  await expectToast(page, 'That file is not valid JSON');
  await chooseImportFile(page, JSON.stringify({ hello: 'world' }));
  await expectToast(page, 'The file has no learner list.');
  await chooseImportFile(page, JSON.stringify({ students: [{ name: 'No id' }] }));
  await expectToast(page, 'The learner “No id” in the file is missing an id or name.');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
  expect((await api.getState()).state.students).toHaveLength(3);
});

test('an imported analysis renders as text, not markup', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {} });
  const doc = (await api.getState()).state;
  const hostile = '<p>Kept paragraph</p><img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
  doc.records[ROWAN] = [{ id: 'r_hostile', type: 'observation', title: 'Imported note', note: '', createdAt: FIXED_NOW.getTime() - 3_600_000, analysis: hostile }];
  await chooseImportFile(page, JSON.stringify(doc));
  await modal(page).getByRole('button', { name: 'Replace family data' }).click();
  await expectToast(page, 'Family data imported');
  await nav(page, 'Records').click();
  const prose = page.locator('.ai-prose').first();
  await expect(prose).toContainText('Kept paragraph');
  await expect(prose).toContainText('<img src=x onerror="window.__pwned=1">');
  await expect(prose.locator('p')).toHaveCount(1);
  await expect(prose.locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

// Another Harrington, one data format ahead, saved this document; the page
// gets it straight from the route, and any write is recorded, not stored.
async function serveNewerDocument(page, api) {
  const doc = { ...familyState({ learners: ['rowan'], active: 'rowan' }), schemaVersion: SCHEMA_VERSION + 1, futureWorkbook: { future: true } };
  await api.putState({ ...doc, schemaVersion: SCHEMA_VERSION }); // the server here only stores its own format
  const writes = [];
  await page.route('**/api/state', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: '"v7"' }, body: JSON.stringify({ ...doc, version: 7 }) });
    writes.push(method);
    return route.fulfill({ status: 204, headers: { ETag: '"v8"' } });
  });
  return writes;
}

// A stored document the server would refuse on a save (it checks every save),
// served straight from the route; any write is recorded, not stored.
async function serveDocument(page, doc) {
  const writes = [];
  await page.route('**/api/state', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: '"v7"' }, body: JSON.stringify({ ...doc, version: 7 }) });
    writes.push(method);
    return route.fulfill({ status: 204, headers: { ETag: '"v8"' } });
  });
  return writes;
}

test('a format 2 file the server now refuses is repaired once, and the bell names every change (HAR-39)', async ({ page, gotoApp, errors }) => {
  const doc = { ...familyState({ learners: ['rowan'], active: 'rowan' }), schemaVersion: 2, notifications: [] };
  const id = doc.students[0].id;
  doc.students[0] = { ...doc.students[0], name: `Rowan ${'Example'.repeat(17)}`.slice(0, 127), birthYear: 1980 };
  doc.records = { ...doc.records, [id]: [{ id: 'r_long', type: 'note', title: 'Long reading log', note: 'x'.repeat(60_015), createdAt: Date.now() }] };
  const puts = [];
  await page.route('**/api/state', (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: '"v7"' }, body: JSON.stringify({ ...doc, version: 7 }) });
    puts.push(JSON.parse(request.postData()));
    return route.fulfill({ status: 204, headers: { ETag: '"v8"' } });
  });
  await gotoApp({ seed: null });
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0].schemaVersion).toBe(SCHEMA_VERSION);
  expect(puts[0].students[0].name).toHaveLength(60);

  // The repair is not silent: the bell lists it, with each change and where
  // the original is kept, and the first-run welcome still shows beside it.
  await page.getByRole('button', { name: /^Notifications, 3 new/ }).first().click();
  const panel = modal(page);
  const notice = panel.getByText('Harrington repaired some family data').locator('xpath=..');
  await expect(notice).toContainText('A learner name longer than 60 characters was shortened');
  await expect(notice).toContainText('was 1980, outside 1990');
  await expect(notice).toContainText('“Long reading log” was longer than 50,000 characters and was shortened');
  await expect(notice).toContainText('family-state.format-2.json');
  await expect(panel.getByText('Welcome to Harrington')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a null recall card or practice item no longer hangs the landing page on the loading screen (HAR-38)', async ({ page, gotoApp, errors }) => {
  const doc = { ...familyState({ learners: ['rowan'], active: 'rowan' }), schemaVersion: SCHEMA_VERSION };
  const id = doc.students[0].id;
  doc.recall = { [id]: { 'broken::0': null } };
  doc.practice = { [id]: { broken: null } };
  doc.records = { ...doc.records, [id]: [null, ...(doc.records?.[id] || [])] };
  await serveDocument(page, doc);
  await gotoApp({ seed: null });
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await expect(page.getByText('Loading your homeschool workspace')).toHaveCount(0);
  // The records page opens too, with the null record skipped.
  await nav(page, 'Records').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a page that fails to render says so and keeps Export and a way to the records (HAR-38)', async ({ page, gotoApp, errors }) => {
  // A learner name that is not text: the shell cannot draw its initials.
  const doc = { ...familyState({ learners: ['rowan'], active: 'rowan' }), schemaVersion: SCHEMA_VERSION };
  doc.students[0] = { ...doc.students[0], name: 42 };
  await serveDocument(page, doc);
  await gotoApp({ seed: null });
  const alert = page.getByRole('alert');
  await expect(alert.getByRole('heading', { name: 'This page could not be shown' })).toBeVisible();
  await expect(alert.locator('.render-error')).not.toBeEmpty();
  await expect(alert.getByRole('link', { name: 'Records' })).toHaveAttribute('href', '#records');
  const [download] = await Promise.all([page.waitForEvent('download'), alert.getByRole('button', { name: 'Export family data' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^harrington-family-/);
  // The failure is reported, not swallowed.
  expect(errors.some((e) => e.startsWith('console:'))).toBe(true);
});

test('at 390 px the refusal toast docks above the navigation and the learner sheet\'s Export stays clickable (HAR-40)', async ({ page, gotoApp }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Stored before the server checked saves and already at the current format,
  // so no repair runs: every change is refused, and the toast stays.
  const doc = { ...familyState({ learners: ['rowan'], active: 'rowan' }), schemaVersion: SCHEMA_VERSION };
  doc.students[0] = { ...doc.students[0], birthYear: 1985 };
  const writes = await serveDocument(page, doc);
  await gotoApp({ seed: null, hash: `topic/${TOPICS.oneToOne.id}` });
  await setTopicStatus(page, 'Learning');
  const refusal = page.locator('#toast-root').getByText(/Harrington refused these changes: The learner “Rowan Example” in the file has a birth year/);
  await expect(refusal).toBeVisible();
  await expect(page.getByText(/^Marked as/)).toHaveCount(0);
  expect(writes).toEqual([]);

  // Its Dismiss is a 44 px tap target, and the toast area lets taps beside
  // a toast through to the page.
  const dismissBox = await page.locator('#toast-root').getByRole('button', { name: 'Dismiss' }).boundingBox();
  expect(Math.round(dismissBox.height)).toBeGreaterThanOrEqual(44);
  expect(Math.round(dismissBox.width)).toBeGreaterThanOrEqual(44);
  expect(await page.locator('#toast-root').evaluate((root) => [getComputedStyle(root).pointerEvents, getComputedStyle(root.firstElementChild).pointerEvents]))
    .toEqual(['none', 'auto']);

  // Above the bottom navigation, which stays tappable.
  const toastBox = await refusal.boundingBox();
  const navBox = await page.locator('nav.fixed[aria-label="Main"]').boundingBox();
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(navBox.y);
  await nav(page, 'Records').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();

  // The learner sheet is padded while the toast shows: Export is clickable
  // (Playwright refuses a click on a covered element) and downloads.
  await page.getByRole('button', { name: 'Switch learner' }).filter({ visible: true }).click();
  const sheet = modal(page);
  const exportButton = sheet.getByRole('button', { name: 'Export', exact: true });
  const exportBox = await exportButton.boundingBox();
  expect(exportBox.y + exportBox.height).toBeLessThanOrEqual(toastBox.y);
  const download = await downloadExport(page, exportButton);
  expect(download.suggestedFilename()).toMatch(/^harrington-family-/);
});

test('a newer data format opens read-only: a banner, Import disabled, nothing saved', async ({ page, api, gotoApp, errors }) => {
  const writes = await serveNewerDocument(page, api);
  await gotoApp({ seed: null, hash: `topic/${TOPICS.oneToOne.id}` });
  await expect(page.locator('.read-only-banner')).toContainText('saved by a newer version of Harrington');
  await expect(importButton(page)).toBeDisabled();

  // A change says it was not saved (never "Marked as …") and never reaches
  // the server, not even when the page is hidden.
  await setTopicStatus(page, 'Learning');
  await expectToast(page, 'Not saved. This family data was saved by a newer version of Harrington.');
  await expect(page.getByText(/^Marked as/)).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.waitForTimeout(800);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('read-only on a desktop: the dashboard opens without a "Not saved" toast and the sidebar box stays in view', async ({ page, api, gotoApp, errors }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const writes = await serveNewerDocument(page, api);
  await gotoApp({ seed: null });
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await expect(page.locator('.read-only-banner')).toHaveCount(1);
  // The dashboard saves today's choices as it renders: an automatic write,
  // refused without a toast. The parent did nothing.
  await page.waitForTimeout(600);
  await expect(page.getByText(/^Not saved\./)).toHaveCount(0);
  // The banner is beside the sidebar, not above it: the family box is on screen.
  const aside = page.locator('aside');
  await expect(aside.getByText('Read-only', { exact: true })).toBeVisible();
  const box = await aside.getByRole('button', { name: 'Import', exact: true }).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  await expect(aside.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('read-only at 390 px: the banner leaves the top bar tappable; Export works, Import is disabled', async ({ page, api, gotoApp, errors }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await serveNewerDocument(page, api);
  await gotoApp({ seed: null });
  await expect(page.locator('.read-only-banner')).toBeVisible();
  // Playwright refuses to click a covered element, so this fails if the banner sits over the top bar.
  await page.getByRole('button', { name: 'Switch learner' }).filter({ visible: true }).click();
  const menu = modal(page);
  await expect(menu.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  await expect(menu.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  const download = await downloadExport(page, menu.getByRole('button', { name: 'Export', exact: true }));
  expect(download.suggestedFilename()).toMatch(/^harrington-family-/);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('two tabs: the losing tab says which change it discarded, once, and Try again re-applies it (F17, fixed)', async ({ page, context, api, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: `topic/${TOPICS.oneToOne.id}` });
  const other = await context.newPage();
  await other.clock.setFixedTime(FIXED_NOW);
  await other.goto(`/#topic/${TOPICS.howMany.id}`);
  await expect(other.getByRole('heading', { level: 1, name: TOPICS.howMany.name })).toBeVisible();
  const toasts = other.locator('#toast-root');

  // Opening a topic page writes nothing (HAR-27 removed the boot writes), so
  // neither tab has anything to lose yet.
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(0);

  // Tab A saves first.
  await setTopicStatus(page, 'Learning');
  await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'learning');

  // Tab B, still on the old version, loses: one toast naming what it discarded.
  await setTopicStatus(other, 'Practicing');
  await expectToast(other, 'Marked as practicing');
  const conflict = toasts.getByRole('alert').filter({ hasText: 'Another device saved changes first' });
  await expect(conflict).toHaveText(/Not kept here: How Many in Total\? marked practicing\./);
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(1);
  await shot('conflict-toast', { target: other, full: false });

  // B shows A's change; B's change is not on the server yet.
  await expect(other.getByRole('group', { name: 'Set status' }).getByRole('button', { name: 'Practicing' })).toHaveAttribute('aria-pressed', 'false');
  expect((await api.getState()).state.progress[ROWAN][TOPICS.howMany.id]).toBeUndefined();

  // Try again puts it back on the fresh copy, keeping A's change.
  await conflict.getByRole('button', { name: 'Try again' }).click();
  const state = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.howMany.id]?.status === 'practicing');
  expect(state.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('learning');
  await nav(other, 'Dashboard').click();
  const growth = other.locator('section', { has: other.getByRole('heading', { name: 'Recent growth' }) });
  await expect(growth.getByRole('button', { name: /One-to-one counting.*Learning/ })).toBeVisible();
  await expect(growth.getByRole('button', { name: /How Many in Total\?.*Practicing/ })).toBeVisible();
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(0);
  await other.close();
});

test('a first dashboard render that loses is put back silently, can be picked, and Try again still works (F17, fixed)', async ({ page, api, gotoApp, errors }) => {
  // Opening the dashboard writes today's offers and creates an empty recall
  // container on read. Hold that first save while another device saves a
  // copy that has neither.
  let release; const held = new Promise((r) => { release = r; });
  let seen; const holding = new Promise((r) => { seen = r; });
  let first = true;
  await page.route('**/api/state', async (route) => {
    if (route.request().method() === 'PUT' && first) { first = false; seen(); await held; }
    await route.continue();
  });
  await gotoApp({ seed: {} }); // no recall key, no offers
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await holding;
  const { state: before } = await api.getState();
  before.progress[ROWAN][TOPICS.oneToOne.id] = { status: 'learning', updatedAt: FIXED_NOW.getTime() };
  await api.putState(before);
  release();

  // The 412 puts the tab's bookkeeping back on the fresh copy, silently.
  const toasts = page.locator('#toast-root');
  const saved = await api.waitForState((s) => !!s.daily?.[ROWAN]?.[TODAY_KEY]);
  expect(saved.daily[ROWAN][TODAY_KEY].picks).toEqual({});
  expect(saved.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('learning');
  await expect(toasts.getByText(/Another device saved/)).toHaveCount(0);

  // The put-back day can be picked.
  const choice = page.getByRole('group', { name: 'Literacy: pick one' }).locator('button[aria-pressed]').first();
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await api.waitForState((s) => !!s.daily?.[ROWAN]?.[TODAY_KEY]?.picks?.literacy);

  // A later lost status change still names itself and offers Try again.
  const { state: later } = await api.getState();
  later.progress[ROWAN][TOPICS.oneToOne.id] = { status: 'practicing', updatedAt: FIXED_NOW.getTime() };
  await api.putState(later);
  await page.evaluate((id) => { location.hash = `#topic/${id}`; }, TOPICS.howMany.id);
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.howMany.name })).toBeVisible();
  await setTopicStatus(page, 'Learning');
  const conflict = toasts.getByRole('alert').filter({ hasText: 'Another device saved changes first' });
  await expect(conflict).toHaveText(/Not kept here: How Many in Total\? marked learning\./);
  await conflict.getByRole('button', { name: 'Try again' }).click();
  const state = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.howMany.id]?.status === 'learning');
  expect(state.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('practicing');
  expect(state.daily[ROWAN][TODAY_KEY].picks.literacy).toBeTruthy();
  // The two 412s are the browser logging the refused saves; nothing else.
  expect(errors.filter((e) => !e.includes('status of 412'))).toEqual([]);
});

test('two tabs opened together on the dashboard raise no conflict (F17, fixed)', async ({ page, context, api }) => {
  const other = await context.newPage();
  await other.clock.setFixedTime(FIXED_NOW);
  // Both tabs write today's offers as they render; whichever loses says nothing.
  await api.seed({});
  await Promise.all([page.goto('/'), other.goto('/')]);
  await expect(other.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await api.waitForState((s) => !!s.daily?.[ROWAN]);
  // Give a losing boot write time to come back as a 412 before checking.
  await other.waitForTimeout(1500);
  for (const tab of [page, other]) await expect(tab.locator('#toast-root').getByText(/Another device saved/)).toHaveCount(0);
  // Both tabs can still pick today's choices.
  for (const tab of [page, other]) {
    const choice = tab.getByRole('group', { name: 'Numeracy: pick one' }).locator('button[aria-pressed]').first();
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
  }
  await other.close();
});

// A note of 45 KB: the family document takes seconds to upload on a slow
// uplink, and stays under the 64 KB a keepalive request may carry.
const LONG_NOTE = { type: 'observation', title: 'A long observation', note: 'x'.repeat(45_000) };
const statusButton = (page, label) => page.getByRole('group', { name: 'Set status' }).getByRole('button', { name: label, exact: true });

test('a reload in the middle of a slow save keeps the change (HAR-43)', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: { records: [LONG_NOTE] }, hash: `topic/${TOPICS.oneToOne.id}` });
  // About 16 KB/s up: the PUT takes a few seconds, as a large family on a
  // slow home uplink does.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 16 * 1024 });
  const put = page.waitForRequest((r) => r.url().endsWith('/api/state') && r.method() === 'PUT');
  await setTopicStatus(page, 'Learning');
  await put;
  // The PUT is on the wire, its body still uploading, when the page reloads.
  expect((await api.getState()).state.progress?.[ROWAN]?.[TOPICS.oneToOne.id]).toBeUndefined();
  await page.reload();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // The request outlives the page (keepalive): the change reaches the server.
  await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'learning');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.oneToOne.name })).toBeVisible();
  await expect(statusButton(page, 'Learning')).toHaveAttribute('aria-pressed', 'true');
});

test('a document too large for a beacon: closing while it saves asks first, and staying finishes the save (HAR-43)', async ({ page, api, gotoApp }) => {
  // The PUT is held on the wire until the test lets it through.
  let release; const held = new Promise((r) => { release = r; });
  let started; const putStarted = new Promise((r) => { started = r; });
  await page.route('**/api/state', async (route) => {
    if (route.request().method() === 'PUT') { started(); await held; }
    await route.continue();
  });
  // Two long notes: over the 64 KB a beacon or a keepalive request may carry.
  await gotoApp({ seed: { records: [LONG_NOTE, { ...LONG_NOTE, title: 'Another long observation' }] }, hash: `topic/${TOPICS.oneToOne.id}` });
  // The click is the user activation the browser wants before it shows a beforeunload dialog.
  await setTopicStatus(page, 'Learning');
  await putStarted;
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const asked = await dialog;
  expect(asked.type()).toBe('beforeunload');
  await asked.dismiss(); // stay on the page
  release();
  await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'learning');
});

test('a backup restored while a tab is open is not undone by that tab\'s next change (HAR-44)', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {}, hash: `topic/${TOPICS.oneToOne.id}` });
  // The tab saves twice; the first save is what the backup holds.
  await setTopicStatus(page, 'Learning');
  const backup = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'learning');
  await setTopicStatus(page, 'Practicing');
  const later = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'practicing');
  expect(later.version).toBeGreaterThan(backup.version);

  // The parent restores the backup with this tab still open: the server now
  // holds an older version that carries the tab's own writeId.
  await api.restoreState(backup);

  // The tab's next change is not saved over the restored copy: the tab
  // reloads it and names what it did not keep. Try again puts the change back.
  await setTopicStatus(page, 'Mastered');
  const conflict = page.locator('#toast-root').getByRole('alert').filter({ hasText: 'Another device saved changes first' });
  await expect(conflict).toHaveText(/Not kept here: One-to-one counting marked mastered\./);
  await expect(statusButton(page, 'Learning')).toHaveAttribute('aria-pressed', 'true');
  const restored = (await api.getState()).state;
  expect(restored.progress[ROWAN][TOPICS.oneToOne.id].status).toBe('learning');
  await conflict.getByRole('button', { name: 'Try again' }).click();
  const state = await api.waitForState((s) => s.progress?.[ROWAN]?.[TOPICS.oneToOne.id]?.status === 'mastered');
  expect(state.version).toBe(restored.version + 1);
  await expect(page.locator('#toast-root').getByText(/Another device saved/)).toHaveCount(0);
});

test('removing a learner now clears all of their data', async ({ page, api, gotoApp }) => {
  const wren = LEARNERS.wren.id;
  await gotoApp({
    seed: {
      extra: {
        tests: { [wren]: [{ id: 't_x', scope: 'topic', subject: 'Mathematics', pct: 100, passed: true, createdAt: 1 }] },
        plan: { [wren]: { moves: {}, done: { '2026-10-06': 1 }, extras: {} } },
        game: { [wren]: { xp: 40, badges: {} } },
      },
    },
  });
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  page.once('dialog', (d) => d.accept());
  await modal(page).getByText('Wren Example', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-full")][1]').locator('button').last().click();
  const state = await api.waitForState((s) => s.students?.length === 2);
  for (const key of ['progress', 'records', 'tests', 'plan', 'game']) expect(state[key]?.[wren]).toBeUndefined();
});
