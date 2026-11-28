// The child view overlay opened from the dashboard (with HAR-15: a parent PIN,
// the child-safe topic card and score-free activities).
import { test, expect, modal, closeModal, expectToast, childView, leaveChildView, TEST_PIN } from './fixtures.mjs';
import { FIXED_NOW } from './support/env.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';
import { CHALLENGE_QUESTIONS } from './mock-ai-server.mjs';

const ROWAN = LEARNERS.rowan.id;

async function openChildView(page) {
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  await expect(childView(page)).toBeVisible();
}

function expectScoreFree(text) {
  expect(text).not.toMatch(/%/);
  expect(text).not.toMatch(/\bXP\b/);
  expect(text).not.toMatch(/\bLevel\b/);
  expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
}

test('opens score-free with picks, four big buttons, garden; the parent shell is inert', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'learning' } } });
  await openChildView(page);
  const view = childView(page);
  await expect(view.getByRole('heading', { name: 'Morning, Rowan Example!' })).toBeVisible();
  await expect(view).toContainText('Wednesday');
  await expect(view).toContainText('bud is growing a little every day');
  expectScoreFree(await view.innerText());

  // The parent shell underneath cannot be reached.
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');

  await expect(view.getByRole('region', { name: 'Story time: pick one' }).locator('button[aria-pressed]')).toHaveCount(2);
  await expect(view.getByRole('region', { name: 'Number time: pick one' }).locator('button[aria-pressed]')).toHaveCount(2);
  for (const label of ['Plant something new', 'Memory walk', 'Beat the clock', 'My collection']) {
    await expect(view.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  }
  await expect(view.getByRole('button', { name: 'Tell about my day' })).toBeVisible();

  const garden = view.locator('section[aria-labelledby="garden-h"]');
  await expect(garden.getByRole('heading', { name: 'My garden' })).toBeVisible();
  await expect(garden.locator(':scope > div > div')).toHaveCount(9); // one bed per subject
  await expect(garden).toContainText('Sprouting');
  await expect(garden).toContainText('Planted');
  await shot('child-view', { full: false });
  expect(errors).toEqual([]);
});

test('Grown-ups: cannot set initial PIN from child view; parent sets PIN and child view locks out after 5 wrong tries (HAR-57)', async ({ page, api, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await openChildView(page);
  const view = childView(page);
  // With no PIN set, Grown-ups returns straight to the parent view (never prompts to create a PIN on the child screen).
  await view.getByRole('button', { name: 'Back to the grown-up view' }).click();
  await expect(childView(page)).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

  // Parent sets the PIN from the parent side.
  await page.getByRole('button', { name: 'Child-view PIN' }).click();
  const pinDialog = modal(page);
  await expect(pinDialog.getByRole('heading', { name: 'Set child-view PIN' })).toBeVisible();
  await shot('set-pin', { full: false });
  await pinDialog.getByLabel('4-digit PIN', { exact: true }).fill(TEST_PIN);
  await pinDialog.getByLabel('Confirm 4-digit PIN').fill('1111');
  await pinDialog.getByRole('button', { name: 'Save PIN' }).click();
  await expect(pinDialog.getByText('Those PINs did not match. Try again.')).toBeVisible();
  await pinDialog.getByLabel('Confirm 4-digit PIN').fill(TEST_PIN);
  await pinDialog.getByRole('button', { name: 'Save PIN' }).click();
  await expectToast(page, 'Child-view PIN saved');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);

  // F16: only a salted hash is saved.
  const saved = await api.waitForState((s) => /^[0-9a-f]{64}$/.test(s.settings?.parentPinHash || ''));
  expect(saved.settings.parentPin).toBeUndefined();
  expect(JSON.stringify(saved)).not.toContain(`"${TEST_PIN}"`);

  // Next time Grown-ups requires the PIN; 5 wrong tries trigger a 15 s lockout.
  await openChildView(page);
  await view.getByRole('button', { name: 'Back to the grown-up view' }).click();
  await expect(view.getByRole('heading', { name: 'Grown-ups only' })).toBeVisible();
  await expect(view).toContainText('Forgot the PIN? Reload the page to return to the grown-up view.');
  const pin = view.getByLabel('Grown-up PIN');
  await pin.fill('12');
  await view.getByRole('button', { name: 'Continue' }).click();
  await expect(view.getByText('Please enter 4 digits.')).toBeVisible();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await pin.fill('0000');
    await view.getByRole('button', { name: 'Continue' }).click();
    await expect(view.getByText('That is not the PIN.')).toBeVisible();
    if (attempt === 1) await shot('wrong-pin', { full: false });
  }

  // 5th wrong guess locks the PIN modal for 15 seconds.
  await pin.fill('0000');
  await view.getByRole('button', { name: 'Continue' }).click();
  await expect(view.getByText(/Too many wrong tries\. Try again in 15 s\./)).toBeVisible();
  await expect(pin).toBeDisabled();
  await expect(view.getByRole('button', { name: 'Continue' })).toBeDisabled();

  // Clicking Back and reopening Grown-ups does not clear the lockout.
  await view.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(view.getByRole('heading', { name: 'Morning, Rowan Example!' })).toBeVisible();
  await view.getByRole('button', { name: 'Back to the grown-up view' }).click();
  await expect(view.getByText(/Too many wrong tries\. Try again in 15 s\./)).toBeVisible();
  await expect(pin).toBeDisabled();

  // After the cooldown expires, the parent PIN works again.
  await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 16_000));
  await expect(pin).toBeEnabled();
  await pin.fill(TEST_PIN);
  await view.getByRole('button', { name: 'Continue' }).click();
  await expect(view).toHaveCount(0);
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

  // Parent can also remove the PIN from the parent side.
  await page.getByRole('button', { name: 'Child-view PIN' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Child-view PIN' })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Remove PIN' }).click();
  await expectToast(page, 'Child-view PIN removed');
  await api.waitForState((s) => !s.settings?.parentPinHash);
});

test('a story-time pick opens the child topic card and shows on the dashboard', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await openChildView(page);
  const story = childView(page).getByRole('region', { name: 'Story time: pick one' });
  await expect(story).toContainText('pick one');
  const first = story.locator('button[aria-pressed]').first();
  const pickName = (await first.locator('span.block').first().innerText()).trim();
  await first.click();

  const card = modal(page);
  await expect(card.getByRole('heading', { name: pickName })).toBeVisible();
  await expect(card.getByText(/^Can you /).first()).toBeVisible();
  await expect(card.getByRole('button', { name: 'Tell about it' })).toBeVisible();
  expectScoreFree(await card.innerText());
  await shot('child-topic-card', { full: false });
  await card.getByRole('button', { name: 'Tell about it' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Record conversation' })).toBeVisible();
  await expect(modal(page)).toContainText(`Linked to ${pickName}`);
  await closeModal(page);

  await expect(story).toContainText('great choice!');
  await expect(story.locator('button[aria-pressed="true"]')).toContainText(pickName);
  await leaveChildView(page);
  const lane = page.getByRole('group', { name: 'Literacy: pick one' });
  await expect(lane).toContainText('Rowan Example picked');
  await expect(lane.locator('button[aria-pressed="true"]')).toContainText(pickName);
});

test('big buttons without progress: challenge locked, collection, tell about my day', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {} });
  await openChildView(page);
  const view = childView(page);

  await view.getByRole('button', { name: /Beat the clock/ }).click();
  await expectToast(page, 'Grow a bloom to unlock challenges!');

  await view.getByRole('button', { name: /My collection/ }).click();
  await expect(view.getByText('My collection', { exact: true })).toBeVisible();
  // HAR-15 hides the two level badges.
  await expect(view).toContainText('0 of 10 found — collect them all!');
  await shot('child-view-collection', { full: false });
  await view.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(view.getByRole('heading', { name: 'Morning, Rowan Example!' })).toBeVisible();

  await view.getByRole('button', { name: 'Tell about my day' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Record conversation' })).toBeVisible();
  await expect(modal(page)).toContainText('Capture a lesson discussion, then link it to a topic.');
  await shot('child-view-tell-about-my-day', { full: false });
  await closeModal(page);
});

test('activities launched from the child view stay score-free; results still reach the parent', async ({ page, api, gotoApp, mockAi, shot }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'mastered' } } });
  await openChildView(page);
  const view = childView(page);

  // Plant something new opens the child topic card, not a test.
  await view.getByRole('button', { name: /Plant something new/ }).click();
  await expect(modal(page).getByRole('button', { name: 'Tell about it' })).toBeVisible();
  expectScoreFree(await modal(page).innerText());
  await closeModal(page);

  // Beat the clock: no live tally, no X/Y result, no popup.
  await mockAi.clear();
  await view.getByRole('button', { name: /Beat the clock/ }).click();
  const ch = modal(page);
  await expect(ch).toContainText('You already know this one');
  await ch.getByRole('button', { name: 'Start challenge' }).click();
  for (const q of CHALLENGE_QUESTIONS) {
    await expect(ch.getByText(q.q)).toBeVisible();
    expectScoreFree(await ch.innerText());
    await ch.getByRole('button', { name: q.answerText, exact: true }).click();
  }
  await expect(ch.getByText('All done, well tried!')).toBeVisible();
  expectScoreFree(await ch.innerText());
  await page.waitForTimeout(1200);
  await expect(page.getByText(/Badge unlocked!|Level up!|\+\d+ XP/)).toHaveCount(0);
  await shot('child-challenge-result', { full: false });
  await ch.getByRole('button', { name: 'Close' }).click();

  // Memory walk: recall without counts.
  await view.getByRole('button', { name: /Memory walk/ }).click();
  const recall = modal(page);
  for (let i = 0; i < 3; i += 1) {
    await recall.getByRole('button', { name: 'Show answer' }).click();
    await recall.getByRole('button', { name: 'Got it' }).click();
  }
  await expect(recall.getByText('All done, well tried!')).toBeVisible();
  expectScoreFree(await recall.innerText());
  await recall.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/Badge unlocked!|Level up!|\+\d+ XP/)).toHaveCount(0);

  // The parent still gets the numbers.
  const state = await api.waitForState((s) => s.challenges?.[ROWAN]?.length === 1 && (s.game?.[ROWAN]?.xp || 0) > 0);
  expect(state.challenges[ROWAN][0]).toMatchObject({ correct: 8, total: 8 });
  expect(state.game[ROWAN].xp).toBeGreaterThan(0);
  await leaveChildView(page);
});

test('"Plant something new" offers a topic not yet started, not the one in progress (F18, fixed)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: { progress: { [TOPICS.oneToOne.id]: 'practicing' } } });
  await openChildView(page);
  const plant = childView(page).getByRole('button', { name: /Plant something new/ });
  await expect(plant).toBeVisible();
  await expect(plant).not.toContainText(TOPICS.oneToOne.name);
  await expect(childView(page).getByRole('button', { name: /Keep growing/ })).toHaveCount(0);
  const name = (await plant.locator('span.block').last().innerText()).trim();
  await plant.click();
  await expect(modal(page).getByRole('heading', { name })).toBeVisible();
});
