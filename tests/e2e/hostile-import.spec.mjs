// A hostile family file (PR #32 review, item 1). Each payload is refused at
// import with its reason, and the views escape it even when a document
// carrying all of them reaches the browser without those checks.
import { test, expect, modal, expectToast, nav, closeModal } from './fixtures.mjs';
import { LEARNERS, TOPICS, familyState } from './support/family.mjs';
import { HOSTILE_CHANGES, PAYLOAD, everyRenderPayload, hostileFamily } from './support/hostile-family.mjs';

const importButton = (page) => page.getByRole('button', { name: 'Import', exact: true });
async function chooseImportFile(page, doc) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importButton(page).click()]);
  await chooser.setFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
}

test('import refuses each hostile payload with its reason, and nothing runs', async ({ page, api, gotoApp, errors }) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await gotoApp({ seed: {} });
  const learnersAndRecords = async () => { const { state } = await api.getState(); return { students: state.students, records: state.records }; };
  const before = await learnersAndRecords();
  for (const [label, , reason] of HOSTILE_CHANGES) {
    await chooseImportFile(page, hostileFamily(label));
    await expectToast(page, reason);
    await expect(page.locator('#modal-root > div')).toHaveCount(0);
  }
  expect(await learnersAndRecords()).toEqual(before);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('every view escapes a hostile document that reaches the browser', async ({ page, gotoApp, errors }) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  // Serve the document straight to the browser, past the import check and the
  // server's save check, and accept its saves without storing them.
  let version = 1;
  const doc = everyRenderPayload();
  await page.route('**/api/state', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: `"v${version}"` }, body: JSON.stringify({ ...doc, version }) });
    }
    version += 1;
    return route.fulfill({ status: 204, headers: { ETag: `"v${version}"` } });
  });
  await gotoApp({ seed: {} });

  await expect(page.getByRole('heading', { name: `${LEARNERS.rowan.name}'s Wednesday` })).toBeVisible();
  await expect(page.getByText(/total XP/)).toBeVisible();

  await nav(page, 'Records').click();
  await expect(page.getByText('Six stars')).toBeVisible();
  await expect(page.getByText('★★★★★').first()).toBeVisible();
  await expect(page.locator('.ai-prose').first()).toContainText('<img src=x');

  await page.goto(`/#topic/${TOPICS.oneToOne.id}`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.oneToOne.name })).toBeVisible();
  await expect(page.getByText(/Passed the topic test with <img/)).toBeVisible();

  await nav(page, 'Insights').click();
  await expect(page.getByRole('heading', { name: 'Teacher Insights' })).toBeVisible();

  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('a topic title with markup shows as text in both topic searches', async ({ page, gotoApp, errors }) => {
  const title = `Count <b>bold</b> ${PAYLOAD}`;
  // The taxonomy is upstream data: rename one topic as a hostile copy would.
  await page.route('**/api/taxonomy/topics.json', async (route) => {
    const body = await (await route.fetch()).json();
    body.topics = body.topics.map((t) => (t.id === TOPICS.oneToOne.id ? { ...t, name: title } : t));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await gotoApp({ seed: {} });
  await nav(page, 'Records').click();

  // The note form's topic search (views/records.js).
  await page.getByRole('button', { name: 'New record' }).click();
  await modal(page).getByPlaceholder('Search topics…').fill('count <b>');
  const noteResult = modal(page).locator('#results button').first();
  await expect(noteResult).toContainText(title);
  await expect(modal(page).locator('#results b, #results img')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The recorder's topic search (recorder.js).
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await modal(page).getByRole('button', { name: 'Start recording' }).click();
  await expect(modal(page).getByText('Recording…')).toBeVisible();
  await modal(page).getByRole('button', { name: 'Stop & review' }).click();
  await modal(page).getByPlaceholder('Search topics…').fill('count <b>');
  await expect(modal(page).locator('#results button').first()).toContainText(title);
  await expect(modal(page).locator('#results b, #results img')).toHaveCount(0);

  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('import refuses >64 KB unrecognised fields, previews smaller ones and drops orphan learner keys (HAR-56)', async ({ page, api, gotoApp }) => {
  await gotoApp({ seed: {} });
  const base = familyState({ learners: ['rowan'], active: 'rowan' });
  await chooseImportFile(page, { ...base, smuggled: 'x'.repeat(70 * 1024) });
  await expectToast(page, "The file's unrecognised fields are larger than 64 KB.");
  await expect(page.locator('#modal-root > div')).toHaveCount(0);

  const rawWithOrphans = JSON.stringify({
    ...base,
    futureFlag: { v: 1 },
    records: {
      __proto__: [{ id: 'r_p', type: 'note', note: 'proto' }],
      not_a_learner: [{ id: 'r_o', type: 'note', note: 'orphan' }],
      [LEARNERS.rowan.id]: [{ id: 'r_real', type: 'note', note: 'kept' }],
    },
  });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importButton(page).click()]);
  await chooser.setFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.from(rawWithOrphans) });
  const preview = modal(page);
  await expect(preview.getByText(/Carries 1 unrecognised field.*futureFlag/)).toBeVisible();
  await preview.getByRole('button', { name: 'Replace family data' }).click();
  await expectToast(page, 'Family data imported');

  const stored = await api.waitForState((s) => s.futureFlag?.v === 1);
  expect(Object.keys(stored.records)).toEqual([LEARNERS.rowan.id]);
});

test('nicknames in brackets and control-character names are redacted before AI requests (HAR-41)', async ({ page, gotoApp, mockAi }) => {
  await gotoApp({ seed: {} });
  const doc = familyState({ learners: ['rowan'], active: 'rowan' });
  doc.students[0].name = 'Alexander (Xander) Quill';
  doc.records[LEARNERS.rowan.id] = [
    { id: 'r_nick', type: 'discussion', title: 'Counting chat', note: 'Xander counted to 20', createdAt: Date.now() - 1000 },
  ];
  await chooseImportFile(page, doc);
  await modal(page).getByRole('button', { name: 'Replace family data' }).click();
  await expectToast(page, 'Family data imported');
  await mockAi.clear();

  await nav(page, 'Records').click();
  await page.getByRole('checkbox', { name: 'Include my notes in this request' }).check();
  await page.getByRole('button', { name: 'Analyse & get advice' }).click();
  await expect(modal(page).getByText('Discussion analysis')).toBeVisible();
  await closeModal(page);

  const [entry] = await mockAi.log();
  expect(entry.prompt).toContain('the child counted to 20');
  expect(entry.prompt).not.toMatch(/Xander|Alexander|Quill/i);
});
