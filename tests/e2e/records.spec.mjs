// Records, the voice recorder and the recordings folder.
import { test, expect, modal, closeModal, nav, expectToast } from './fixtures.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { MARKERS } from './mock-ai-server.mjs';
import { FIXED_NOW } from './support/env.mjs';

const ROWAN = LEARNERS.rowan.id;
const card = (page, title) => page.locator('div.rounded-2xl', { has: page.getByText(title, { exact: true }) }).last();

async function newRecord(page, { type, title, note = '', stars = 0, topic = null }) {
  await page.getByRole('button', { name: 'New record' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'New record' })).toBeVisible();
  await m.locator('#types').getByRole('button', { name: type }).click();
  if (topic) {
    await m.getByPlaceholder('Search topics…').fill(topic.slice(0, 8));
    await m.locator('#results').getByRole('button', { name: new RegExp(topic) }).click();
    await expect(m.getByPlaceholder('Search topics…')).toHaveValue(topic);
  }
  await m.locator('input[name="title"]').fill(title);
  if (note) await m.locator('textarea[name="note"]').fill(note);
  if (stars) await m.locator('#stars button').nth(stars - 1).click();
  await m.getByRole('button', { name: 'Save record' }).click();
  await expectToast(page, 'Record saved');
}

test('create one record of each type, filter, rate, link, delete', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {} });
  await nav(page, 'Records').click();
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
  await expect(page.getByText('No records yet. Capture what you observe as your student learns.')).toBeVisible();

  // A record needs a title or a note.
  await page.getByRole('button', { name: 'New record' }).click();
  await modal(page).getByRole('button', { name: 'Save record' }).click();
  await expectToast(page, 'Add a title or note');
  await shot('record-form', { full: false });
  await closeModal(page);

  await newRecord(page, { type: 'Observation', title: 'Lined up toy cars by size', note: 'Talked about biggest and smallest.', stars: 4, topic: TOPICS.oneToOne.name });
  await newRecord(page, { type: 'Question', title: 'Where does the sun go at night?' });
  await newRecord(page, { type: 'Discussion', title: 'Talked about sharing', note: 'We split 6 grapes between 2 bowls and counted each.' });
  await newRecord(page, { type: 'Assessment', title: 'Counted 10 blocks correctly', stars: 5 });
  // HAR-16: recordings only come from the recorder; the form no longer offers the type.
  await page.getByRole('button', { name: 'New record' }).click();
  await expect(modal(page).locator('#types').getByRole('button')).toHaveText(['Observation', 'Question', 'Discussion', 'Assessment']);
  await closeModal(page);

  await expect(page.getByRole('button', { name: 'All (4)' })).toBeVisible();
  await expect(card(page, 'Lined up toy cars by size')).toContainText('★★★★☆');
  await expect(card(page, 'Counted 10 blocks correctly')).toContainText('★★★★★');
  await shot('records-list');

  // Filters.
  await page.getByRole('button', { name: 'Question', exact: true }).click();
  await expect(page.locator('div.space-y-3 > div')).toHaveCount(1);
  await expect(page.getByText('Where does the sun go at night?')).toBeVisible();
  await page.getByRole('button', { name: 'Assessment', exact: true }).click();
  await expect(page.locator('div.space-y-3 > div')).toHaveCount(1);
  await page.getByRole('button', { name: 'All (4)' }).click();
  await expect(page.locator('div.space-y-3 > div')).toHaveCount(4);

  // Discussion and recording records offer analysis; others do not.
  await expect(card(page, 'Talked about sharing').getByRole('button', { name: 'Analyse & get advice' })).toBeVisible();
  await expect(card(page, 'Where does the sun go at night?').getByRole('button', { name: 'Analyse & get advice' })).toHaveCount(0);

  // Topic link.
  await card(page, 'Lined up toy cars by size').getByRole('button', { name: TOPICS.oneToOne.name }).click();
  await expect(page.getByRole('heading', { level: 1, name: TOPICS.oneToOne.name })).toBeVisible();
  await nav(page, 'Records').click();

  // Delete (with confirm).
  page.once('dialog', (d) => { expect(d.message()).toBe('Delete this record?'); d.accept(); });
  await page.getByRole('button', { name: 'Delete record Where does the sun go at night?' }).click();
  await expect(page.getByText('Where does the sun go at night?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'All (3)' })).toBeVisible();
  const state = await api.waitForState((s) => s.records?.[ROWAN]?.length === 3);
  expect(state.records[ROWAN].map((r) => r.type).sort()).toEqual(['assessment', 'discussion', 'observation']);
  // HAR-16: saving a record counts as activity for the day.
  expect(state.activity[ROWAN]['2026-10-07']).toBeTruthy();
  await nav(page, 'Dashboard').click();
  await expect(page.getByText('Active today')).toBeVisible();
  expect(state.records[ROWAN].find((r) => r.type === 'observation')).toMatchObject({ rating: 4, topicId: TOPICS.oneToOne.id });
  expect(errors).toEqual([]);
});

test('voice recorder: start → stop → review → save with a fake microphone, then play it back', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await nav(page, 'Records').click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Record conversation' })).toBeVisible();
  await expect(m).toContainText('The recording is saved privately on your Harrington server.');
  await shot('recorder-idle', { full: false });
  await m.getByRole('button', { name: 'Start recording' }).click();
  await expect(m.getByText('Recording…')).toBeVisible();
  // Time is pinned for the suite; move it on 4 s so the take has a length.
  await page.waitForTimeout(1200);
  await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 4000));
  await expect(m.locator('#timer')).toHaveText('0:04');
  await shot('recorder-recording', { full: false });
  await m.getByRole('button', { name: 'Stop & review' }).click();
  await expect(m.getByText('Preview · 0:04')).toBeVisible();
  await m.getByPlaceholder('Search topics…').fill('one-to-one');
  await m.locator('#results').getByRole('button', { name: /One-to-one counting/ }).click();
  await m.locator('input[name="title"]').fill('Counting the stairs together');
  await m.locator('textarea[name="note"]').fill('Counted to twelve, skipped eight once.');
  await m.locator('textarea[name="transcript"]').fill('One, two, three... twelve! I skipped eight.');
  await shot('recorder-review', { full: false });
  await m.getByRole('button', { name: 'Save recording' }).click();
  await expectToast(page, 'Recording saved');

  const rec = card(page, 'Counting the stairs together');
  await expect(rec).toContainText('Recording');
  await expect(rec.getByRole('button', { name: 'Play recording · 0:04' })).toBeVisible();
  await rec.getByText('Transcript').click();
  await expect(rec).toContainText('I skipped eight.');
  const audio = page.waitForResponse((r) => r.url().includes('/api/audio/'));
  await rec.getByRole('button', { name: /Play recording/ }).click();
  expect((await audio).status()).toBe(200);
  await expect(rec.locator('audio')).toHaveCount(1);

  const state = await api.waitForState((s) => s.records?.[ROWAN]?.some((r) => r.audioPath));
  const saved = state.records[ROWAN][0];
  expect(saved).toMatchObject({
    type: 'recording', title: 'Counting the stairs together', topicId: TOPICS.oneToOne.id,
    sectionId: 'Mathematics|Counting & Cardinality|5', subject: 'Mathematics', duration: 4,
  });
  const file = await page.request.get(`/api/audio/${encodeURIComponent(saved.audioPath)}`);
  expect(file.status()).toBe(200);
  expect((await file.body()).length).toBeGreaterThan(100);
  expect(file.headers()['content-type']).toMatch(/^audio\//);
});

test('dismissing the recorder mid-take asks first and stops the microphone', async ({ page, gotoApp }) => {
  // Keep every stream the app opens, to check its tracks afterwards.
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__e2eStreams = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__e2eStreams.push(stream);
      return stream;
    };
  });
  const trackStates = () => page.evaluate(() => window.__e2eStreams.flatMap((s) => s.getTracks().map((t) => t.readyState)));
  await gotoApp({ seed: {} });
  await page.getByRole('button', { name: 'Record what happened' }).click();
  await modal(page).getByRole('button', { name: 'Start recording' }).click();
  await expect(modal(page).getByText('Recording…')).toBeVisible();
  expect(await trackStates()).toContain('live');

  const messages = [];
  page.once('dialog', (d) => { messages.push(d.message()); d.dismiss(); });
  await page.keyboard.press('Escape');
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toContain('Discard this recording?');
  // Cancel keeps recording, microphone still on.
  await expect(modal(page).getByText('Recording…')).toBeVisible();
  expect(await trackStates()).toContain('live');

  page.once('dialog', (d) => { messages.push(d.message()); d.accept(); });
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
  expect(messages).toHaveLength(2);
  // Every microphone track the recorder opened is stopped.
  await expect.poll(trackStates).not.toContain('live');
  expect((await trackStates()).length).toBeGreaterThan(0);
});

test('recordings folder: grouping, play, delete', async ({ page, api, gotoApp, shot }) => {
  const audio = Buffer.from('fake-webm-bytes-for-playback-test'.repeat(8));
  await gotoApp({
    seed: {
      records: [
        { type: 'recording', title: 'Section talk', audioPath: 'e2e-a.webm', duration: 31, sectionId: 'Mathematics|Counting & Cardinality|5', sectionLabel: 'Counting & Cardinality · Age 5', subject: 'Mathematics', transcript: 'We counted spoons.' },
        { type: 'recording', title: 'Topic-linked manual entry', topicId: TOPICS.oneToOne.id, topicName: TOPICS.oneToOne.name, note: 'Typed, no audio.' },
        { type: 'recording', title: 'Unlinked chat', audioPath: 'e2e-b.webm', duration: 12 },
      ],
    },
  });
  for (const name of ['e2e-a.webm', 'e2e-b.webm']) {
    const res = await page.request.put(`/api/audio/${name}`, { headers: { 'Content-Type': 'audio/webm' }, data: audio });
    expect(res.status()).toBe(204);
  }
  await page.getByRole('button', { name: /Recordings folder/ }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Recordings' })).toBeVisible();
  // HAR-16: grouped by section, then by topic, then "Not linked to a section".
  await expect(m).toContainText('3 recordings in 3 groups.');
  await expect(m.getByText('Counting & Cardinality · Age 5', { exact: true })).toBeVisible();
  await expect(m.getByText(TOPICS.oneToOne.name, { exact: true })).toBeVisible();
  await expect(m.getByText('Not linked to a section', { exact: true })).toBeVisible();
  await shot('recordings-folder', { full: false });

  const played = page.waitForResponse((r) => r.url().endsWith('/api/audio/e2e-a.webm'));
  await m.getByRole('button', { name: 'Play recording · 0:31' }).click();
  expect((await played).status()).toBe(200);

  page.once('dialog', (d) => { expect(d.message()).toBe('Delete this recording?'); d.accept(); });
  await m.getByRole('button', { name: 'Delete recording Unlinked chat' }).click();
  await expect(m).toContainText('2 recordings in 2 groups.');
  await api.waitForState((s) => s.records?.[ROWAN]?.length === 2);
  await expect.poll(async () => (await page.request.get('/api/audio/e2e-b.webm')).status()).toBe(404);
});

test.describe('with the mock AI provider', () => {
  test('analyze a discussion (notes only with the opt-in) and save the advice; no learner name reaches the provider (F2, fixed by HAR-19)', async ({ page, api, gotoApp, mockAi, shot }) => {
    await gotoApp({
      seed: {
        records: [
          { type: 'discussion', title: 'Talked about sharing', note: 'Rowan Example split 6 grapes between 2 bowls.', topicId: TOPICS.oneToOne.id, topicName: TOPICS.oneToOne.name },
          { type: 'recording', title: 'Bedtime counting', transcript: "Rowan's count: one two three five", sectionId: 'Mathematics|Counting & Cardinality|5', sectionLabel: 'Counting & Cardinality · Age 5', subject: 'Mathematics' },
        ],
      },
    });
    await mockAi.clear();
    await nav(page, 'Records').click();
    // A note-only discussion waits for the parent to share the note.
    const discussionCard = card(page, 'Talked about sharing');
    const analyze = discussionCard.getByRole('button', { name: 'Analyse & get advice' });
    await expect(analyze).toBeDisabled();
    await expect(discussionCard).toContainText('Tick “Include my notes” to analyse your notes.');
    await discussionCard.getByRole('checkbox', { name: 'Include my notes in this request' }).check();
    await expect(analyze).toBeEnabled();
    await analyze.click();
    const m = modal(page);
    await expect(m.getByText('Discussion analysis')).toBeVisible();
    await expect(m).toContainText(MARKERS.discussion);
    await shot('discussion-analysis', { full: false });
    await m.getByRole('button', { name: 'Save advice to records' }).click();
    await expectToast(page, 'Advice saved to records');
    await expect(m.getByRole('button', { name: 'Saved' })).toBeDisabled();
    await closeModal(page);
    await expect(page.getByText('Advice · Talked about sharing')).toBeVisible();
    // HAR-16: the analysis is also saved onto the discussion itself.
    const discussion = card(page, 'Talked about sharing');
    await expect(discussion.getByText('AI summary & advice')).toBeVisible();
    await expect(discussion.getByRole('button', { name: 'Regenerate' })).toBeVisible();
    await api.waitForState((s) => s.records?.[ROWAN]?.find((r) => r.title === 'Talked about sharing')?.analysis);

    // HAR-19: the note went out with the learner's name replaced.
    const [entry] = await mockAi.log();
    expect(entry.kind).toBe('discussion');
    expect(entry.prompt).toContain('the child split 6 grapes');

    // In the recordings folder the analysis is stored on the recording itself.
    await nav(page, 'Dashboard').click();
    await page.getByRole('button', { name: /Recordings folder/ }).click();
    await modal(page).getByRole('button', { name: 'Analyse & get advice' }).click();
    await expectToast(page, 'Analysis saved to this recording');
    await expect(modal(page).getByText('AI summary & advice')).toBeVisible();
    await expect(modal(page).getByRole('button', { name: 'Regenerate' })).toBeVisible();
    const state = await api.waitForState((s) => s.records?.[ROWAN]?.find((r) => r.title === 'Bedtime counting')?.analysis);
    expect(state.records[ROWAN].find((r) => r.title === 'Bedtime counting').analysis).toContain(MARKERS.discussion);
    await closeModal(page);
    await page.reload();
    await page.getByRole('button', { name: /Recordings folder/ }).click();
    await expect(modal(page).getByText('AI summary & advice')).toBeVisible();

    // A transcript needs no opt-in, and the possessive is replaced too.
    const prompts = (await mockAi.log()).map((e) => e.prompt);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("the child's count: one two three five");
    for (const prompt of prompts) {
      for (const { name } of Object.values(LEARNERS)) expect(prompt).not.toContain(name.split(' ')[0]);
    }
  });
});
