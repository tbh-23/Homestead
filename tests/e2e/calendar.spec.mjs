// The daily calendar: month grid, start date, day panel, done, extras, moves.
import { test, expect, modal, nav, expectToast, childView } from './fixtures.mjs';
import { FIXED_NOW } from './support/env.mjs';
import { LEARNERS, TOPICS } from './support/family.mjs';

const ROWAN = LEARNERS.rowan.id;

async function openCalendar(page, gotoApp, seed = {}) {
  await gotoApp({ seed });
  await nav(page, 'Calendar').click();
  await expect(page.getByRole('heading', { name: 'Daily Calendar' })).toBeVisible();
}

const dayCell = (page, day) => page.locator('div.grid-cols-7 > button').filter({ has: page.locator('span > span', { hasText: new RegExp(`^${day}$`) }) }).first();
// The day panel (rest days have no Mark done button, so find it by its marker).
const dayPanel = (page) => page.locator('[data-day-panel]');

test('month grid, navigation, start date and the day panel; no refresher before anything is mastered (F5, fixed by HAR-18)', async ({ page, gotoApp, shot, errors }) => {
  await openCalendar(page, gotoApp);
  await expect(page.getByText('A day-by-day learning track for')).toContainText('Rowan Example');
  await expect(page.getByText('Track starts')).toBeVisible();
  await expect(page.getByText('Wednesday, October 7, 2026')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await expect(page.getByText(d, { exact: true })).toBeVisible();

  // Today is selected; it's a home learning day with new topics. Nothing is
  // mastered yet, so there is no refresher or activity, only the stretch.
  const panel = dayPanel(page);
  await expect(panel.getByRole('heading', { name: 'Wednesday, October 7' })).toBeVisible();
  await expect(panel).toContainText('Home learning day');
  await expect(panel).toContainText('New today');
  expect(await panel.locator('button.open').count()).toBeGreaterThan(0);
  await expect(panel).not.toContainText('REFRESHER QUIZ');
  await expect(panel).toContainText('Refresher quizzes and activities start once Rowan Example has mastered a topic.');
  await expect(panel).toContainText('STRETCH');
  await shot('calendar-month');

  // Month navigation.
  await page.locator('#prev').click();
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible();
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();

  // Weekend days are rest days by default; before the track is outside it.
  await dayCell(page, 10).click();
  await expect(dayPanel(page)).toContainText('Rest day');
  await expect(dayPanel(page)).toContainText('Nothing is scheduled.');
  await expect(dayPanel(page)).toContainText('Next learning day: Monday, October 12');
  await expect(dayPanel(page).getByRole('button', { name: 'Mark done' })).toHaveCount(0);
  await expect(dayPanel(page)).not.toContainText('Daily refreshers');
  await dayCell(page, 6).click();
  await expect(dayPanel(page)).toContainText('Outside the track');

  // Change the start date (the native picker is hidden; set it as the picker would).
  await page.locator('#startpick').evaluate((input) => { input.value = '2026-10-12'; input.dispatchEvent(new Event('change')); });
  await expectToast(page, 'Start date updated — track rescheduled');
  await expect(page.getByText('Monday, October 12, 2026')).toBeVisible();
  await expect(dayPanel(page).getByRole('heading', { name: 'Monday, October 12' })).toBeVisible();
  await dayCell(page, 8).click();
  await expect(dayPanel(page)).toContainText('Outside the track');
  await expect(dayPanel(page)).toContainText('This date is outside the 5–13 track.');
  expect(errors).toEqual([]);
});

test('refreshers and activities come only from mastered topics (HAR-18)', async ({ page, gotoApp }) => {
  await openCalendar(page, gotoApp, { progress: { [TOPICS.oneToOne.id]: 'mastered' } });
  const panel = dayPanel(page);
  // One topic mastered: the refresher quiz and the activity are both about it.
  const refresher = panel.locator('div.rounded-xl', { hasText: 'REFRESHER QUIZ' });
  await expect(refresher).toContainText(TOPICS.oneToOne.name);
  await expect(panel.locator('div.rounded-xl', { hasText: /\b(ACTIVITY|GAME)\b/ })).toContainText(TOPICS.oneToOne.name);
  await expect(panel).not.toContainText('Refresher quizzes and activities start once');
});

test('home days and breaks: rest days schedule nothing and the track picks up after them (HAR-18)', async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp);
  const todays = await dayPanel(page).locator('button.open span.block').first().innerText();
  await page.getByRole('button', { name: 'Home days & breaks' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: 'Home days & breaks' })).toBeVisible();
  await expect(m.locator('#days button[aria-pressed="true"]')).toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  await expect(m).toContainText('No breaks yet.');
  // Wednesdays off, and a break the week after.
  await m.locator('#days').getByRole('button', { name: 'Wed', exact: true }).click();
  await m.locator('input[name="label"]').fill('Fall break');
  await m.locator('input[name="start"]').fill('2026-10-12');
  await m.locator('input[name="end"]').fill('2026-10-16');
  await m.getByRole('button', { name: 'Add break' }).click();
  await expect(m).toContainText('Fall break');
  await shot('calendar-home-days-and-breaks', { full: false });
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Calendar updated — track rescheduled');

  // Today (a Wednesday) is now a rest day; its topic moved to the next home day.
  await expect(dayPanel(page)).toContainText('Rest day');
  await expect(dayPanel(page)).toContainText('Nothing is scheduled.');
  // Nothing is scheduled inside the break (Oct 12–16) …
  for (const d of [12, 13, 14, 15, 16]) {
    await dayCell(page, d).click();
    await expect(dayPanel(page)).toContainText('Break · Fall break');
    await expect(dayPanel(page)).toContainText('Nothing is scheduled.');
    await expect(dayPanel(page).locator('button.open')).toHaveCount(0);
  }
  // … and the track picks up on the first home day after it.
  await dayCell(page, 19).click();
  await expect(dayPanel(page)).toContainText('Home learning day');
  expect(await dayPanel(page).locator('button.open').count()).toBeGreaterThan(0);
  await dayCell(page, 8).click();
  await expect(dayPanel(page)).toContainText('Home learning day');
  await expect(dayPanel(page).locator('button.open span.block').first()).toHaveText(todays);
  const state = await api.waitForState((s) => s.settings?.calendar?.breaks?.length === 1);
  expect(state.settings.calendar).toMatchObject({ homeDays: [1, 2, 4, 5], breaks: [{ start: '2026-10-12', end: '2026-10-16', label: 'Fall break' }] });
});

test('mark a day done and reopen it', async ({ page, api, gotoApp }) => {
  await openCalendar(page, gotoApp);
  await dayCell(page, 8).click();
  await dayPanel(page).getByRole('button', { name: 'Mark done' }).click();
  await expectToast(page, 'Day marked complete');
  await expect(dayPanel(page).getByRole('button', { name: 'Done' })).toBeVisible();
  await api.waitForState((s) => s.plan?.[ROWAN]?.done?.['2026-10-08']);
  await dayPanel(page).getByRole('button', { name: 'Done' }).click();
  await expectToast(page, 'Day reopened');
  await expect(dayPanel(page).getByRole('button', { name: 'Mark done' })).toBeVisible();
});

test('add an extra of each kind, open one, remove one; Extra practice opens spaced practice (F8, fixed by HAR-18)', async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp);
  const kinds = [['Extra practice', 'Practice'], ['Re-teach lesson', 'Extra lesson'], ['Re-test', 'Re-test'], ['Challenge', 'Challenge']];
  for (const [kind] of kinds) {
    await dayPanel(page).getByRole('button', { name: 'Add', exact: true }).click();
    const m = modal(page);
    await expect(m.getByRole('heading', { name: 'Add extra for this day' })).toBeVisible();
    // Submitting without a topic is refused.
    if (kind === 'Extra practice') {
      await m.getByRole('button', { name: 'Add to day' }).click();
      await expectToast(page, 'Pick a topic first');
    }
    await m.getByPlaceholder('Search topics…').fill('one-to-one');
    await m.getByRole('button', { name: /One-to-one counting\s*Mathematics/ }).click();
    await m.getByRole('button', { name: kind, exact: true }).click();
    if (kind === 'Challenge') await shot('calendar-add-extra', { full: false });
    await m.getByRole('button', { name: 'Add to day' }).click();
    await expectToast(page, 'Added to 2026-10-07');
  }
  const panel = dayPanel(page);
  for (const [kind, label] of kinds) {
    await expect(panel.getByText(`${kind} · ${TOPICS.oneToOne.name}`)).toBeVisible();
    await expect(panel.getByText(`${label} · Mathematics`).first()).toBeVisible();
  }
  await expect(dayCell(page, 7)).toContainText('+4');
  await shot('calendar-extras');
  const state = await api.waitForState((s) => s.plan?.[ROWAN]?.extras?.['2026-10-07']?.length === 4);
  expect(state.plan[ROWAN].extras['2026-10-07'].map((x) => x.kind)).toEqual(['practice', 'lesson', 'retest', 'challenge']);

  // "Extra practice" opens that topic's practice (nothing is queued for it).
  const practiceRow = panel.locator('div.rounded-xl', { hasText: `Extra practice · ${TOPICS.oneToOne.name}` });
  await practiceRow.getByRole('button', { name: 'Open' }).click();
  await expect(modal(page).getByText('Nothing to practise for this topic today')).toBeVisible();
  await expect(modal(page).getByText(/Lesson plan · /)).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Remove the re-test (F14: the icon-only button is named for the extra).
  await dayPanel(page).getByRole('button', { name: `Remove extra Re-test · ${TOPICS.oneToOne.name}` }).click();
  await expect(dayPanel(page).getByText(`Re-test · ${TOPICS.oneToOne.name}`)).toHaveCount(0);
  await expect(dayCell(page, 7)).toContainText('+3');
  await api.waitForState((s) => s.plan?.[ROWAN]?.extras?.['2026-10-07']?.length === 3);
});

test('move a topic to the next home day and to a chosen date', async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp);
  const first = dayPanel(page).locator('button.open').first();
  const name = (await first.locator('span.block').first().innerText()).trim();
  await first.locator('xpath=..').getByRole('button', { name: 'Move' }).click();
  const m = modal(page);
  await expect(m.getByRole('heading', { name: `Move “${name}”` })).toBeVisible();
  await shot('calendar-move-topic', { full: false });
  await m.getByRole('button', { name: 'Push to next home day' }).click();
  await expectToast(page, 'Moved to 2026-10-08');
  await expect(dayPanel(page).getByRole('heading', { name: 'Thursday, October 8' })).toBeVisible();
  await expect(dayPanel(page).getByText(name, { exact: true })).toBeVisible();
  await dayCell(page, 7).click();
  await expect(dayPanel(page).getByText(name, { exact: true })).toHaveCount(0);

  // Pick a date in the form.
  await dayCell(page, 8).click();
  const row = dayPanel(page).locator('button.open', { hasText: name }).locator('xpath=..');
  await row.getByRole('button', { name: 'Move' }).click();
  await modal(page).locator('input[name="date"]').fill('2026-10-14');
  await modal(page).getByRole('button', { name: 'Move topic' }).click();
  await expectToast(page, 'Moved to 2026-10-14');
  await expect(dayPanel(page).getByRole('heading', { name: 'Wednesday, October 14' })).toBeVisible();
  await expect(dayPanel(page).getByText(name, { exact: true })).toBeVisible();
  const state = await api.waitForState((s) => Object.values(s.plan?.[ROWAN]?.moves || {}).includes('2026-10-14'));
  expect(Object.keys(state.plan[ROWAN].moves)).toHaveLength(1);
});

test('refresher, activity and stretch cards open their tools; the dead footer button is gone (F9, fixed by HAR-18)', async ({ page, gotoApp, mockAi }) => {
  await openCalendar(page, gotoApp, { progress: { [TOPICS.oneToOne.id]: 'mastered' } });
  const panel = dayPanel(page);
  await mockAi.clear();
  await panel.getByRole('button', { name: 'Give refresher quiz' }).click();
  await expect(modal(page).getByText(/Topic check · /)).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Get instructions' }).click();
  await expect(modal(page).getByText('How to play', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Open lesson' }).click();
  await expect(modal(page).getByText(/Lesson plan · /)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);

  await expect(panel.getByRole('button', { name: 'Refreshers change each day automatically' })).toHaveCount(0);

  // Topic rows: Lesson and Test buttons.
  const row = panel.locator('button.open').first().locator('xpath=..');
  await row.getByRole('button', { name: 'Test' }).click();
  await expect(modal(page).getByText(/Topic check · /)).toBeVisible();
  await page.keyboard.press('Escape');
  await row.getByRole('button', { name: 'Lesson' }).click();
  await expect(modal(page).getByText(/Lesson plan · /)).toBeVisible();
});

// ---- Calendar follow-ups (HAR-18 review). Tagged @mobile: these run in the
// desktop and the mobile project. ----

const FALL_BREAK = { homeDays: [1, 2, 3, 4, 5], breaks: [{ start: '2026-10-05', end: '2026-10-09', label: 'Fall break' }] };
const retry = (topicId, q) => ({ topicId, subject: 'Mathematics', q, type: 'multiple_choice', options: ['3', '4'], answer: 1, box: 0, due: 0, reps: 0, lapses: 0, last: null, createdAt: 0 });

test('a break pauses the rhythm: no choices on the dashboard, the next learning day named, and a done day can be reopened', { tag: '@mobile' }, async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: { extra: { settings: { calendar: FALL_BREAK }, plan: { [ROWAN]: { moves: {}, extras: {}, done: { '2026-10-07': 1790000000000 } } } } } });
  // Dashboard: the break, honestly; no pick-one stops.
  const today = page.locator('section[aria-labelledby="today-h"]');
  await expect(today.locator('.rest-stop')).toContainText('Fall break until Friday, October 9');
  await expect(today.locator('.rest-stop')).toContainText('Next learning day: Monday, October 12');
  await expect(today.getByRole('group', { name: /pick one/ })).toHaveCount(0);
  await expect(today).not.toContainText('A gentle review day');
  await expect(today).toContainText('Record what happened');
  await shot('rest-day-dashboard', { full: false });

  // Calendar: today is inside the break, was marked done before it, and can be reopened.
  await nav(page, 'Calendar').click();
  const panel = dayPanel(page);
  await expect(panel.locator('.rest-notice')).toContainText('Fall break until Friday, October 9');
  await expect(panel.locator('.rest-notice')).toContainText('Next learning day: Monday, October 12');
  await expect(panel.locator('.rest-notice')).toContainText('marked done before it became a rest day');
  await expect(dayCell(page, 7).locator('[data-lucide="check-circle-2"], svg.lucide-check-circle-2, svg.lucide-circle-check')).toHaveCount(1);
  await expect(panel).not.toContainText('Daily refreshers');
  await shot('rest-day-done-kept', { full: false });
  await panel.getByRole('button', { name: 'Done' }).click();
  await expectToast(page, 'Day reopened');
  await expect(dayPanel(page).getByRole('button', { name: /^(Done|Mark done)$/ })).toHaveCount(0);
  await api.waitForState((s) => s.plan?.[ROWAN] && !s.plan[ROWAN].done?.['2026-10-07']);

  // "Go to Monday" selects the next learning day, which is not today.
  await dayPanel(page).getByRole('button', { name: 'Go to Monday' }).click();
  await expect(dayPanel(page).getByRole('heading', { name: 'Monday, October 12' })).toBeVisible();
  await expect(dayPanel(page)).toContainText('Home learning day');
  await expect(dayPanel(page)).toContainText('New on Monday');
  await expect(dayPanel(page)).not.toContainText('New today');
  expect(errors).toEqual([]);
});

test('the child view pauses inside a break: no pick-one sections, the next learning day named', { tag: '@mobile' }, async ({ page, gotoApp, errors }) => {
  await gotoApp({ seed: { extra: { settings: { calendar: FALL_BREAK } } } });
  await page.getByRole('button', { name: "Rowan Example's view" }).click();
  const view = childView(page);
  await expect(view).toBeVisible();
  await expect(view.locator('.rest-day')).toHaveText("No choices today: it's a rest day. See you on Monday, October 12!");
  await expect(view.getByRole('region', { name: /pick one/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('"New today" only on today; other days say "New on <weekday>"', { tag: '@mobile' }, async ({ page, gotoApp }) => {
  await openCalendar(page, gotoApp);
  await expect(dayPanel(page)).toContainText('New today');
  await dayCell(page, 8).click();
  await expect(dayPanel(page)).toContainText('New on Thursday');
  await expect(dayPanel(page)).not.toContainText('New today');
});

test('Extra practice opens its own topic; with nothing for it, the whole queue is a separate action', { tag: '@mobile' }, async ({ page, gotoApp, shot }) => {
  await openCalendar(page, gotoApp, {
    extra: {
      practice: { [ROWAN]: { p_other: retry(TOPICS.howMany.id, 'How many apples in all?') } },
      plan: { [ROWAN]: { moves: {}, done: {}, extras: { '2026-10-07': [{ id: 'x_e2e', kind: 'practice', topicId: TOPICS.oneToOne.id, topicName: TOPICS.oneToOne.name, subject: 'Mathematics', title: `Extra practice · ${TOPICS.oneToOne.name}` }] } } },
    },
  });
  const row = dayPanel(page).locator('div.rounded-xl', { hasText: `Extra practice · ${TOPICS.oneToOne.name}` });
  await row.getByRole('button', { name: 'Open' }).click();
  const m = modal(page);
  await expect(m).toContainText(`Spaced practice · ${TOPICS.oneToOne.name}`);
  await expect(m).toContainText('Nothing to practise for this topic today');
  await expect(m).not.toContainText('How many apples in all?');
  await shot('extra-practice-topic-empty', { full: false });
  await m.getByRole('button', { name: 'Practise all due retries (1)' }).click();
  await expect(modal(page)).toContainText('Retry 1 of 1');
  await expect(modal(page)).toContainText('How many apples in all?');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root > div')).toHaveCount(0);
});

test('Extra practice runs only that topic\'s retries', async ({ page, gotoApp }) => {
  await openCalendar(page, gotoApp, {
    extra: {
      practice: { [ROWAN]: {
        p_mine: retry(TOPICS.oneToOne.id, 'Count the three cups.'),
        // Same topic, but not due for ten days: it stays out of the session.
        p_later: { ...retry(TOPICS.oneToOne.id, 'Count the five spoons.'), box: 2, due: FIXED_NOW.getTime() + 10 * 86_400_000 },
        p_other: retry(TOPICS.howMany.id, 'How many apples in all?'),
      } },
      plan: { [ROWAN]: { moves: {}, done: {}, extras: { '2026-10-07': [{ id: 'x_e2e', kind: 'practice', topicId: TOPICS.oneToOne.id, topicName: TOPICS.oneToOne.name, subject: 'Mathematics', title: `Extra practice · ${TOPICS.oneToOne.name}` }] } } },
    },
  });
  await dayPanel(page).locator('div.rounded-xl', { hasText: 'Extra practice · ' }).getByRole('button', { name: 'Open' }).click();
  await expect(modal(page)).toContainText('Retry 1 of 1');
  await expect(modal(page)).toContainText('Count the three cups.');
  await expect(modal(page)).not.toContainText('Count the five spoons.');
});

test('catch-up pace: the default names its weeks; Mixed reschedules and keeps done days', { tag: '@mobile' }, async ({ page, api, gotoApp, shot }) => {
  await openCalendar(page, gotoApp, { extra: { plan: { [ROWAN]: { moves: {}, extras: {}, done: { '2026-10-06': 1790000000000 } } } } });
  const bar = page.locator('#pacebar');
  await expect(bar.getByRole('button', { name: 'Catch-up first' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.locator('.pace-summary')).toHaveText(/^Catch-up first: \d+ catch-up topics come before Rowan Example's first own-age topic, which starts in about \d+ weeks \(\w+day, \w+ \d+(, \d{4})?\)\.$/);
  const firstDay = await dayPanel(page).locator('button.open span.block').first().innerText();
  await bar.getByRole('button', { name: 'Mixed' }).click();
  await expectToast(page, 'Catch-up pace updated — track rescheduled');
  await expect(page.locator('#pacebar').getByRole('button', { name: 'Mixed' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pacebar .pace-summary')).toHaveText(/^Mixed: two catch-up topics to one own-age topic\. \d+ catch-up topics finish in about \d+ weeks \(\w+day, \w+ \d+(, \d{4})?\), with own-age topics from the first week\.$/);
  await shot('catch-up-pace-mixed', { full: false });
  const state = await api.waitForState((s) => s.plan?.[ROWAN]?.pace === 'mixed');
  expect(state.plan[ROWAN].done).toEqual({ '2026-10-06': 1790000000000 });
  // Back to the default: the original first topic returns and the pace is not stored.
  await page.locator('#pacebar').getByRole('button', { name: 'Catch-up first' }).click();
  await expect(dayPanel(page).locator('button.open span.block').first()).toHaveText(firstDay);
  const back = await api.waitForState((s) => s.plan?.[ROWAN] && !('pace' in s.plan[ROWAN]));
  expect(back.plan[ROWAN].done).toEqual({ '2026-10-06': 1790000000000 });
});
