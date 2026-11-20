// Guided walkthroughs recorded on video (project "walkthrough", recordVideo on).
// The phone walkthrough lives in walkthrough-mobile.spec.mjs.
// They assert as they go, but their job is to produce watchable recordings:
//   docs/e2e/recordings/walkthrough-parent.webm
//   docs/e2e/recordings/walkthrough-child-view.webm
// (copied from test-results/ by tests/e2e/collect-recordings.mjs).
import { test, expect, modal, closeModal, nav, expectToast, dismissCelebration, leaveChildView } from './fixtures.mjs';
import { FIXED_YEAR } from './support/env.mjs';
import { TOPICS } from './support/family.mjs';
import { CHALLENGE_QUESTIONS, MASTERY_QUESTIONS } from './mock-ai-server.mjs';

const ONE = TOPICS.oneToOne;
// A beat between steps so a viewer can follow along.
const beat = (page, ms = 700) => page.waitForTimeout(ms);
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

async function scrollThrough(page, steps = 4) {
  for (let i = 0; i < steps; i += 1) { await page.mouse.wheel(0, 500); await beat(page, 450); }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

async function addLearner(page, name, year) {
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await beat(page, 400);
  await modal(page).getByRole('button', { name: 'Add' }).click();
  await modal(page).locator('input[name="name"]').fill(name);
  await modal(page).locator('input[name="birthYear"]').fill(String(year));
  await beat(page, 400);
  await modal(page).getByRole('button', { name: 'Add student' }).click();
  await expectToast(page, 'Student added');
}

test.describe('parent', () => {
  test.use({ tour: true });

  test('parent walkthrough: first run to insights', async ({ page, api, mockAi, shot }) => {
    test.setTimeout(6 * 60_000);
    test.info().annotations.push({ type: 'recording', description: 'walkthrough-parent' });
    await api.reset();
    await mockAi.clear();
    await page.goto('/');

    // 1. First run.
    await expect(page.getByRole('heading', { name: 'Add your first student' })).toBeVisible();
    await beat(page, 1200);
    await page.getByPlaceholder('e.g. Sample Learner').pressSequentially('Rowan Example', { delay: 40 });
    await page.locator('input[name="birthYear"]').fill(String(FIXED_YEAR - 6));
    await beat(page);
    await page.getByRole('button', { name: 'Set up their learning space' }).click();

    // 2. Welcome tour: a few slides, then skip.
    const tour = modal(page);
    await expect(tour.getByRole('heading', { name: 'Welcome to Harrington' })).toBeVisible();
    for (let i = 0; i < 4; i += 1) { await beat(page, 1100); await tour.getByRole('button', { name: 'Next' }).click(); }
    await beat(page, 1100);
    await tour.getByRole('button', { name: 'Skip' }).click();

    // 3. Two more learners, then back to Rowan.
    await addLearner(page, 'Wren Example', FIXED_YEAR - 3);
    await addLearner(page, 'Sage Example', FIXED_YEAR - 9);
    await page.getByRole('button', { name: 'Switch learner' }).first().click();
    await beat(page);
    await modal(page).getByText('Rowan Example', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-full")][1]').getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();

    // 4. Dashboard: pick today's literacy choice, look around.
    await beat(page);
    await page.getByRole('group', { name: 'Literacy: pick one' }).locator('button[aria-pressed]').first().click();
    await beat(page);
    await scrollThrough(page, 6);

    // 5. Map: world, realm, skill tree, quest log, mark as learning.
    await nav(page, 'Map').click();
    await expect(page.getByRole('heading', { name: 'Curriculum realms' })).toBeVisible();
    await beat(page, 1200);
    await page.goto(`/#graph/Mathematics/${encodeURIComponent('Counting & Cardinality')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Counting & Cardinality' })).toBeVisible();
    await beat(page);
    await page.locator('button.skill-node', { hasText: ONE.name }).first().click();
    const log = page.getByRole('complementary', { name: 'Quest log' });
    await expect(log).toBeVisible();
    await beat(page, 1200);
    await log.getByRole('button', { name: 'Mark as learning' }).click();
    await expectToast(page, 'Marked as learning');
    await beat(page);
    await page.getByRole('group', { name: 'Curriculum view' }).getByRole('button', { name: 'List' }).click();
    await beat(page, 1200);
    await page.getByRole('group', { name: 'Curriculum view' }).getByRole('button', { name: 'Visual' }).click();
    await page.locator('button.skill-node', { hasText: ONE.name }).first().click();
    await page.getByRole('complementary', { name: 'Quest log' }).getByRole('button', { name: 'Open topic page' }).click();

    // 6. Topic page with the mock provider: lesson, explain, test, challenge, recall.
    await expect(page.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();
    await scrollThrough(page, 3);
    await page.getByRole('button', { name: 'Open full lesson' }).click();
    await expect(modal(page).getByText('Notes for you (the parent)')).toBeVisible();
    await beat(page, 1200);
    await modal(page).locator('#stage').evaluate((el) => el.closest('.overflow-y-auto').scrollBy(0, 600));
    await beat(page, 1200);
    await closeModal(page);
    await section(page, 'AI teaching helper').getByRole('button', { name: 'Explain simply' }).click();
    await expect(section(page, 'AI teaching helper').locator('.ai-prose')).toBeVisible();
    await section(page, 'AI teaching helper').scrollIntoViewIfNeeded();
    await beat(page, 1200);

    await section(page, 'Topic mastery test').getByRole('button', { name: 'Take topic mastery test' }).click();
    const m = modal(page);
    await beat(page);
    await m.getByRole('button', { name: 'Create the test' }).click();
    for (const q of MASTERY_QUESTIONS) {
      await m.locator('div.rounded-xl', { hasText: q.q }).getByRole('button', { name: q.answerText, exact: true }).click();
      await beat(page, 350);
    }
    await m.getByRole('button', { name: 'Submit & grade' }).click();
    await expect(m.getByText('100%', { exact: true })).toBeVisible();
    await beat(page, 1500);
    await dismissCelebration(page);
    await m.getByRole('button', { name: 'Try the challenge quiz' }).click();
    await modal(page).getByRole('button', { name: 'Start challenge' }).click();
    for (const q of CHALLENGE_QUESTIONS) {
      await expect(modal(page).getByText(q.q)).toBeVisible();
      await modal(page).getByRole('button', { name: q.answerText, exact: true }).click();
    }
    await expect(modal(page).getByText('8/8', { exact: true })).toBeVisible();
    await beat(page, 1500);
    await dismissCelebration(page);
    await modal(page).getByRole('button', { name: 'Close' }).click();

    await section(page, 'Active recall').getByRole('button', { name: 'Practice recall' }).click();
    for (let i = 0; i < 3; i += 1) {
      await modal(page).getByRole('button', { name: 'Show answer' }).click();
      await beat(page, 500);
      await modal(page).getByRole('button', { name: 'Got it' }).click();
    }
    await expect(modal(page).getByText('Recall session complete!')).toBeVisible();
    await beat(page);
    await modal(page).getByRole('button', { name: 'Done' }).click();
    await dismissCelebration(page);

    // 7. Calendar: mark the day done and add an extra.
    await nav(page, 'Calendar').click();
    await expect(page.getByRole('heading', { name: 'Daily Calendar' })).toBeVisible();
    await beat(page, 1200);
    await page.getByRole('button', { name: 'Mark done' }).click();
    await beat(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await modal(page).getByPlaceholder('Search topics…').pressSequentially('one-to-one', { delay: 40 });
    await modal(page).getByRole('button', { name: /One-to-one counting\s*Mathematics/ }).click();
    await modal(page).getByRole('button', { name: 'Challenge', exact: true }).click();
    await beat(page, 500);
    await modal(page).getByRole('button', { name: 'Add to day' }).click();
    await beat(page, 1200);

    // 8. Records: a note and a voice recording.
    await nav(page, 'Records').click();
    await page.getByRole('button', { name: 'New record' }).click();
    await modal(page).locator('#types').getByRole('button', { name: 'Discussion' }).click();
    await modal(page).locator('input[name="title"]').pressSequentially('Talked about sharing', { delay: 30 });
    await modal(page).locator('textarea[name="note"]').fill('We split 6 grapes between 2 bowls and counted each.');
    await modal(page).locator('#stars button').nth(3).click();
    await beat(page, 500);
    await modal(page).getByRole('button', { name: 'Save record' }).click();
    await beat(page);
    // HAR-19: notes go to the provider only when the parent ticks the box.
    const discussion = page.locator('div.rounded-2xl', { hasText: 'Talked about sharing' });
    await discussion.getByRole('checkbox', { name: 'Include my notes in this request' }).check();
    await beat(page, 500);
    await discussion.getByRole('button', { name: 'Analyse & get advice' }).click();
    await expect(modal(page).locator('.ai-prose')).toBeVisible();
    await beat(page, 1500);
    await modal(page).getByRole('button', { name: 'Save advice to records' }).click();
    await closeModal(page);

    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await modal(page).getByRole('button', { name: 'Start recording' }).click();
    await beat(page, 2000);
    await modal(page).getByRole('button', { name: 'Stop & review' }).click();
    await modal(page).locator('input[name="title"]').fill('Counting the stairs together');
    await beat(page, 500);
    await modal(page).getByRole('button', { name: 'Save recording' }).click();
    await expectToast(page, 'Recording saved');
    await beat(page);

    // 9. Insights, notifications, guide.
    await nav(page, 'Insights').click();
    await beat(page);
    await page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Progress review' }) }).getByRole('button', { name: 'Generate' }).click();
    await expect(page.locator('.ai-prose')).toBeVisible();
    await scrollThrough(page, 3);
    await page.locator('button[title="Notifications"]').first().click();
    await beat(page, 1200);
    await modal(page).getByRole('button', { name: 'Dismiss all' }).click();
    await closeModal(page);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Guide' }).click();
    await beat(page, 1500);
    await closeModal(page);

    // 10. Back on the dashboard, the day's work shows.
    await nav(page, 'Dashboard').click();
    await expect(page.getByText(/1 of 1,?845 topics mastered/)).toBeVisible();
    await scrollThrough(page, 6);
    await shot('dashboard-after-a-day', { full: true });
  });
});

test('child view walkthrough', async ({ page, gotoApp }) => {
  test.setTimeout(3 * 60_000);
  test.info().annotations.push({ type: 'recording', description: 'walkthrough-child-view' });
  await gotoApp({ seed: { progress: { [ONE.id]: 'mastered', [TOPICS.howMany.id]: 'learning' } } });
  await beat(page);
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  await expect(page.getByRole('heading', { name: 'Morning, Rowan Example!' })).toBeVisible();
  await beat(page, 1500);
  // A pick opens the child-safe topic card (HAR-15).
  await page.getByRole('region', { name: 'Story time: pick one' }).locator('button[aria-pressed]').first().click();
  await expect(modal(page).getByRole('button', { name: 'Tell about it' })).toBeVisible();
  await beat(page, 2000);
  await closeModal(page);
  await page.getByRole('region', { name: 'Number time: pick one' }).locator('button[aria-pressed]').last().click();
  await beat(page, 1500);
  await closeModal(page);
  await beat(page);
  for (let i = 0; i < 3; i += 1) { await page.mouse.wheel(0, 400); await beat(page, 600); }
  await page.getByRole('button', { name: /My collection/ }).click();
  await beat(page, 2000);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await beat(page);
  await page.getByRole('button', { name: 'Tell about my day' }).click();
  await modal(page).getByRole('button', { name: 'Start recording' }).click();
  await beat(page, 2500);
  await modal(page).getByRole('button', { name: 'Stop & review' }).click();
  await modal(page).locator('input[name="title"]').fill('My day at the park');
  await modal(page).getByRole('button', { name: 'Save recording' }).click();
  await expectToast(page, 'Recording saved');
  await beat(page);
  await page.getByRole('button', { name: /Beat the clock/ }).click();
  await modal(page).getByRole('button', { name: 'Start challenge' }).click();
  for (const q of CHALLENGE_QUESTIONS.slice(0, 4)) {
    await expect(modal(page).getByText(q.q)).toBeVisible();
    await beat(page, 500);
    await modal(page).getByRole('button', { name: q.answerText, exact: true }).click();
  }
  await beat(page);
  // Escape mid-challenge asks before throwing the round away.
  const asked = [];
  page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.keyboard.press('Escape');
  await expect.poll(() => asked.length).toBe(1);
  await expect(modal(page).getByRole('button', { name: 'Start challenge' })).toHaveCount(0);
  await beat(page);
  // Grown-ups: set the PIN (typed twice) on the way out.
  await leaveChildView(page);
  await expect(page.getByRole('heading', { name: "Rowan Example's Wednesday" })).toBeVisible();
  await beat(page, 1200);
});
