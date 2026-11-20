// The topic page: header, manual status, evidence, connections, references,
// records and recordings; then every AI-backed tool against the mock provider.
import { test, expect, modal, closeModal, nav, expectToast, dismissCelebration, setTopicStatus } from './fixtures.mjs';
import { COUNTING_SECTION_OTHERS, LEARNERS, TOPICS } from './support/family.mjs';
import { CHALLENGE_QUESTIONS, MARKERS, MASTERY_QUESTIONS, RECALL_CARDS } from './mock-ai-server.mjs';
import { FIXED_NOW } from './support/env.mjs';

const ROWAN = LEARNERS.rowan.id;
const ONE = TOPICS.oneToOne;
const topicHash = (id) => `topic/${id}`;
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

async function answerAll(m, questions) {
  for (const q of questions) {
    await m.locator('div.rounded-xl', { hasText: q.q }).getByRole('button', { name: q.answerText, exact: true }).click();
  }
}

test.describe('without AI', () => {
  test('header, evidence, quick check, connections and reference links', async ({ page, gotoApp, shot, errors }) => {
    await gotoApp({ seed: {}, hash: topicHash(ONE.id) });
    await expect(page.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();
    for (const chip of ['Mathematics', 'Counting & Cardinality', 'Ages 4–6']) {
      await expect(page.getByText(chip, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/Sprout\s*· Not started/).first()).toBeVisible();
    await expect(page.getByText('Ready-to-teach lesson')).toBeVisible();
    await expect(page.getByText('usable today with Rowan Example')).toBeVisible();

    const evidence = section(page, 'What mastery looks like');
    expect(await evidence.locator('li').count()).toBeGreaterThan(0);
    await expect(section(page, 'Quick check').locator('p.italic')).toBeVisible();

    const connects = section(page, 'How this connects');
    await expect(connects).toContainText('Leads to · unlocks these next');
    await expect(connects).toContainText('You are here');
    await expect(connects.getByRole('button')).toHaveCount(3);
    await expect(section(page, 'Section check').getByRole('button', { name: 'Locked until topics mastered' })).toBeDisabled();
    await expect(section(page, 'Section check')).toContainText('0/11 topics');

    // Reference links open in a new tab without handing over window.opener.
    const links = section(page, 'Reference materials').getByRole('link');
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
    await expect(section(page, 'Reference materials').getByRole('link', { name: /YouTube search \(supervise\)/ })).toBeVisible();
    await shot('topic-page');

    // An unlock navigates to that topic, which lists this one as a required prerequisite.
    await connects.getByRole('button', { name: /How Many in Total\?/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: TOPICS.howMany.name })).toBeVisible();
    await expect(page.getByText('Foundations needed first')).toBeVisible();
    const back = section(page, 'How this connects');
    await expect(back).toContainText('Comes before · master these first');
    await expect(back.getByRole('button', { name: /One-to-one counting.*Required/ })).toBeVisible();
    await shot('topic-page-locked');
    await back.getByRole('button', { name: /One-to-one counting/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();

    // Back to graph returns to the list/visual for this domain.
    await page.getByRole('button', { name: 'Back to graph' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Counting & Cardinality' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('manual status: every transition updates the page, the dashboard ring and recent growth (F12, fixed)', async ({ page, api, gotoApp, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(ONE.id) });
    // HAR-14: the four statuses sit beside the growth chip in the header.
    const group = page.getByRole('group', { name: 'Set status' });
    await expect(group.getByRole('button')).toHaveText(['Not started', 'Learning', 'Practicing', 'Mastered']);
    await shot('manual-status-control', { locator: group.locator('xpath=..') });

    const expectChip = (text) => expect(group.locator('xpath=..').getByText(text).first()).toBeVisible();

    await setTopicStatus(page, 'Learning');
    await expectToast(page, 'Marked as learning');
    await expectChip(/Bud\s*· Learning/);

    await setTopicStatus(page, 'Practicing');
    await expectToast(page, 'Marked as practicing');
    await expectChip(/Bud\s*· Practicing/);

    await setTopicStatus(page, 'Mastered');
    await expectToast(page, 'Marked as mastered');
    await expectChip(/Bloom\s*· Mastered/);
    await expect(section(page, 'Topic mastery test')).toContainText('Mastered. This topic is marked mastered.');
    await expect(section(page, 'Topic mastery test').getByRole('button', { name: 'Try the challenge quiz' })).toBeVisible();
    await expect(section(page, 'Topic mastery test').getByRole('button', { name: 'Retake topic test' })).toBeVisible();
    await expect(section(page, 'Section check')).toContainText('1/11 topics');
    await shot('topic-mastered-manually');
    await api.waitForState((s) => s.progress?.[ROWAN]?.[ONE.id]?.status === 'mastered');

    // Dashboard: hero count, Mathematics card and recent growth reflect it.
    await nav(page, 'Dashboard').click();
    await expect(page.getByText(/1 of 1,?845 topics mastered/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Mathematics.*1\/576 mastered.*0% complete/ })).toBeVisible();
    const growth = page.locator('section', { has: page.getByRole('heading', { name: 'Recent growth' }) });
    await expect(growth.getByRole('button', { name: /One-to-one counting.*Bloom.*Mastered/ })).toBeVisible();

    // And back to not started.
    await growth.getByRole('button', { name: /One-to-one counting/ }).click();
    await setTopicStatus(page, 'Not started');
    await expectToast(page, 'Marked as not started');
    await expectChip(/Sprout\s*· Not started/);
    await nav(page, 'Dashboard').click();
    await expect(page.getByText(/0 of 1,?845 topics mastered/)).toBeVisible();
    // A topic set back to "not started" leaves recent growth.
    await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Recent growth' }) }).getByRole('button', { name: /One-to-one counting/ })).toHaveCount(0);
  });

  test('records for this topic: add, view, record; section recordings', async ({ page, api, gotoApp, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(ONE.id) });
    const records = section(page, 'Records for this topic');
    await expect(records).toContainText('No records yet');
    await records.getByRole('button', { name: 'Add' }).click();
    const form = modal(page);
    await expect(form.getByRole('heading', { name: `Record for ${ONE.name}` })).toBeVisible();
    await expect(form.getByPlaceholder('Search topics…')).toHaveCount(0);
    await form.getByRole('button', { name: 'Question' }).click();
    await form.locator('input[name="title"]').fill('Does zero count as a number?');
    await form.locator('textarea[name="note"]').fill('Asked while counting grapes.');
    await form.locator('#stars button').nth(2).click();
    await form.getByRole('button', { name: 'Save record' }).click();
    await expectToast(page, 'Record saved');
    await expect(section(page, 'Records for this topic')).toContainText('Does zero count as a number?');
    await expect(section(page, 'Records for this topic')).toContainText('★★★☆☆');
    await shot('topic-records', { locator: section(page, 'Records for this topic') });
    const state = await api.waitForState((s) => s.records?.[ROWAN]?.length === 1);
    expect(state.records[ROWAN][0]).toMatchObject({ type: 'question', rating: 3, topicId: ONE.id, topicName: ONE.name });

    await section(page, 'Records for this topic').getByRole('button', { name: 'Record' }).click();
    await expect(modal(page)).toContainText(`Linked to ${ONE.name}`);
    await closeModal(page);

    const recs = section(page, 'Section recordings');
    await expect(recs).toContainText('Counting & Cardinality · Age 5');
    await expect(recs).toContainText('No recordings yet for this section.');
    await recs.getByRole('button', { name: 'Record for this section' }).click();
    await expect(modal(page)).toContainText('Linked to Counting & Cardinality · Age 5');
    await closeModal(page);
  });
});

test.describe('with the mock AI provider', () => {
  test('full lesson: generated once, cached on the server, served from /api/lessons', async ({ page, gotoApp, mockAi, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(TOPICS.rote100.id) });
    await mockAi.clear();
    await page.getByRole('button', { name: 'Open full lesson' }).click();
    const lesson = modal(page);
    await expect(lesson.getByText('Lesson plan · Mathematics')).toBeVisible();
    await expect(lesson.getByText('Notes for you (the parent)')).toBeVisible();
    await expect(lesson).toContainText(MARKERS.lessonHook);
    for (const heading of ['What you’ll need', 'Teach it step by step', 'Practice together', 'Child works on their own', 'Discussion & check questions', 'Watch out for', 'Mastery check', 'Ready for more?']) {
      await expect(lesson.getByText(heading, { exact: true })).toBeVisible();
    }
    await shot('lesson-plan', { full: false });
    expect(await mockAi.kinds()).toEqual(['lesson']);
    await closeModal(page);

    // Second open after a reload: no new AI call, the lesson comes from the server cache.
    await page.reload();
    const cached = page.waitForResponse((r) => r.url().includes('/api/lessons/') && r.url().includes(encodeURIComponent(`topic:${TOPICS.rote100.id}`)));
    await page.getByRole('button', { name: 'Open full lesson' }).click();
    expect((await cached).status()).toBe(200);
    await expect(modal(page)).toContainText(MARKERS.lessonHook);
    expect(await mockAi.kinds()).toEqual(['lesson']);

    // Print & go from inside the lesson.
    await modal(page).getByRole('button', { name: /Print & go materials/ }).click();
    const print = modal(page);
    await expect(print.getByText('Print & go · Mathematics')).toBeVisible();
    await expect(print.getByText('Worksheet', { exact: true })).toBeVisible();
    await expect(print.getByText('Flashcards', { exact: true })).toBeVisible();
    await print.getByRole('button', { name: 'Preview' }).first().click();
    await expect(print.getByText('2 + 1 = __')).toBeVisible();
    await shot('print-and-go-preview', { full: false });
    expect(await mockAi.kinds()).toEqual(['lesson', 'printables']);
  });

  test('"Generate a different version" failing explains the error and Try again recovers (F7, fixed by HAR-13)', async ({ page, gotoApp, mockAi, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(TOPICS.howMany.id) });
    await page.getByRole('button', { name: 'Open full lesson' }).click();
    await expect(modal(page)).toContainText(MARKERS.lessonHook);
    await mockAi.failNext(1);
    await modal(page).getByRole('button', { name: 'Generate a different version' }).click();
    await expect(modal(page)).toContainText('The AI provider sent back an error or an answer Harrington couldn’t use. Try again.');
    await expect(modal(page).getByText('Writing a fresh version…')).toHaveCount(0);
    // No raw server error text reaches the parent.
    await expect(modal(page)).not.toContainText('The AI provider failed');
    await shot('regenerate-failed', { full: false });
    // HAR-20: the previous lesson stays on screen under the error.
    await expect(modal(page)).toContainText(MARKERS.lessonHook);
    await modal(page).getByRole('button', { name: 'Try again' }).click();
    await expect(modal(page)).toContainText(MARKERS.lessonHook);
    await expect(modal(page).getByText(/sent back an error/)).toHaveCount(0);
  });

  test('"Generate a different version" with an unusable answer keeps the cached lesson (HAR-20)', async ({ page, gotoApp, mockAi }) => {
    await gotoApp({ seed: {}, hash: topicHash(TOPICS.howMany.id) });
    await page.getByRole('button', { name: 'Open full lesson' }).click();
    await expect(modal(page)).toContainText(MARKERS.lessonHook);
    // The provider answers 200 with JSON that is not a lesson.
    await mockAi.malformedNext(1);
    await modal(page).getByRole('button', { name: 'Generate a different version' }).click();
    await expect(modal(page)).toContainText('The AI provider sent back an error or an answer Harrington couldn’t use. Try again.');
    await expect(modal(page)).toContainText(MARKERS.lessonHook);
    await expect(modal(page).getByRole('button', { name: 'Try again' })).toHaveCount(1);
    await closeModal(page);
    // The cache still holds the good lesson, not the bad answer.
    const cached = await page.request.get(`/api/lessons/${encodeURIComponent(`topic:${TOPICS.howMany.id}`)}`);
    const lesson = await cached.json();
    expect(lesson.objective).not.toBe('x');
    expect(Array.isArray(lesson.materials)).toBe(true);
    await page.getByRole('button', { name: 'Open full lesson' }).click();
    await expect(modal(page)).toContainText(MARKERS.lessonHook);
  });

  test('explain simply, mini-quiz and activity instructions', async ({ page, gotoApp, mockAi, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(ONE.id) });
    await mockAi.clear();
    const helper = section(page, 'AI teaching helper');
    await helper.getByRole('button', { name: 'Explain simply' }).click();
    await expect(helper).toContainText(MARKERS.explain);
    await shot('explain-simply', { locator: helper });
    await helper.getByRole('button', { name: 'Make a mini-quiz' }).click();
    await expect(helper).toContainText(MARKERS.quiz);
    await expect(helper.locator('h4')).toHaveText(MARKERS.quiz);

    const activities = section(page, 'Activities & games');
    await expect(activities).toContainText('Hands-on activities');
    await expect(activities).toContainText('Games to play');
    await activities.getByRole('button', { name: /Kitchen counter maths/ }).click();
    const detail = modal(page);
    await expect(detail.getByRole('heading', { name: 'Kitchen counter maths' })).toBeVisible();
    await expect(detail).toContainText(MARKERS.activitySetup);
    await expect(detail.getByText('How to play', { exact: true })).toBeVisible();
    await shot('activity-instructions', { full: false });
    expect(await mockAi.kinds()).toEqual(['explain', 'quiz', 'activity']);
    // Prompts never carry the learner's name.
    for (const entry of await mockAi.log()) expect(entry.prompt).not.toContain('Rowan');
    // The browser sends no model (HAR-23); the server always sends HARRINGTON_AI_MODEL.
    for (const entry of await mockAi.log()) expect(entry.model).toBe('mock');
  });

  test('topic mastery test on screen: pass → mastered → challenge', async ({ page, api, gotoApp, mockAi, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(ONE.id) });
    await mockAi.clear();
    await section(page, 'Topic mastery test').getByRole('button', { name: 'Take topic mastery test' }).click();
    const m = modal(page);
    await expect(m.getByText('Topic check · Mathematics')).toBeVisible();
    await expect(m.getByRole('button', { name: /On screen.*Recommended/ })).toBeVisible();
    await shot('mastery-test-intro', { full: false });
    await m.getByRole('button', { name: 'Create the test' }).click();
    await expect(m.getByText(MASTERY_QUESTIONS[0].q)).toBeVisible();
    // Unanswered: warning.
    await m.getByRole('button', { name: 'Submit & grade' }).click();
    await expect(m.getByText('Please answer every question first.')).toBeVisible();
    await answerAll(m, MASTERY_QUESTIONS);
    await shot('mastery-test-answered', { full: false });
    await m.getByRole('button', { name: 'Submit & grade' }).click();
    await expect(m.getByText('100%', { exact: true })).toBeVisible();
    await expect(m.getByText('4 of 4 points')).toBeVisible();
    await expect(m.getByText(`${ONE.name} mastered!`)).toBeVisible();
    expect(await mockAi.kinds()).toEqual(['mastery-test', 'verify']);

    // Review answers and back does not record the attempt twice.
    await m.getByRole('button', { name: 'Review answers' }).click();
    await expect(m.getByText('Their answer:').first()).toBeVisible();
    await m.getByRole('button', { name: 'Back to result' }).click();
    await expect(m.getByText('100%', { exact: true })).toBeVisible();
    await shot('mastery-test-passed', { full: false });
    let state = await api.waitForState((s) => s.progress?.[ROWAN]?.[ONE.id]?.status === 'mastered');
    expect(state.tests[ROWAN]).toHaveLength(1);
    expect(state.tests[ROWAN][0]).toMatchObject({ scope: 'topic', topicId: ONE.id, pct: 100, passed: true, mode: 'digital' });

    // The badge popup from the pass sits above everything; dismiss it.
    await dismissCelebration(page);
    await m.getByRole('button', { name: 'Try the challenge quiz' }).click();

    const ch = modal(page);
    await expect(ch.getByText('Beat the clock!')).toBeVisible();
    await shot('challenge-intro', { full: false });
    await ch.getByRole('button', { name: 'Start challenge' }).click();
    for (const q of CHALLENGE_QUESTIONS) {
      await expect(ch.getByText(q.q)).toBeVisible();
      await ch.getByRole('button', { name: q.answerText, exact: true }).click();
    }
    await expect(ch.getByText('8/8', { exact: true })).toBeVisible();
    await expect(ch.getByText('Awesome work!')).toBeVisible();
    await shot('challenge-result', { full: false });
    state = await api.waitForState((s) => s.challenges?.[ROWAN]?.length === 1);
    expect(state.challenges[ROWAN][0]).toMatchObject({ topicId: ONE.id, correct: 8, total: 8 });
    await ch.getByRole('button', { name: 'Close' }).click();

    // The topic page now says how it was mastered and shows the best challenge.
    await expect(section(page, 'Topic mastery test')).toContainText('Passed the topic test with 100%.');
    await expect(section(page, 'Topic mastery test')).toContainText('Best: 8/8.');
  });

  test('practice recall: cards cached on the server (F1, fixed by HAR-20), graded, then the due count shows on the dashboard', async ({ page, api, gotoApp, mockAi, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(ONE.id) });
    await mockAi.clear();
    await section(page, 'Active recall').getByRole('button', { name: 'Practice recall' }).click();
    const m = modal(page);
    await expect(m.getByText(`Card 1 of ${RECALL_CARDS.length}`)).toBeVisible();
    await expect(m.getByText(RECALL_CARDS[0].front)).toBeVisible();
    await m.getByRole('button', { name: 'Show hint' }).click();
    await expect(m.getByText(RECALL_CARDS[0].hint)).toBeVisible();
    await m.getByRole('button', { name: 'Show answer' }).click();
    await shot('recall-card-answer', { full: false });
    await m.getByRole('button', { name: 'Got it' }).click();
    await m.getByRole('button', { name: 'Show answer' }).click();
    await m.getByRole('button', { name: 'Missed it' }).click();
    // Leave the last card ungraded: it stays due today.
    await closeModal(page);

    // HAR-20: the cards are cached on the server as { cards }, so opening
    // recall again asks the provider for nothing new.
    const cached = await page.request.get(`/api/lessons/${encodeURIComponent(`recall:${ONE.id}`)}`);
    expect(cached.status()).toBe(200);
    expect((await cached.json()).cards.map((c) => c.front)).toEqual(RECALL_CARDS.map((c) => c.front));
    const recallCalls = (await mockAi.kinds()).filter((k) => k === 'recall').length;
    expect(recallCalls).toBeLessThanOrEqual(1);
    await section(page, 'Active recall').getByRole('button', { name: 'Practice recall' }).click();
    await expect(modal(page).getByText(RECALL_CARDS[0].front)).toBeVisible();
    await closeModal(page);
    expect((await mockAi.kinds()).filter((k) => k === 'recall')).toHaveLength(recallCalls);

    await nav(page, 'Dashboard').click();
    await expect(page.getByRole('button', { name: /Active recall · 1 due/ })).toBeVisible();
    const state = await api.waitForState((s) => Object.keys(s.recall?.[ROWAN] || {}).length === 3);
    for (const card of Object.values(state.recall[ROWAN])) expect(card.topicId).toBe(ONE.id);

    // Review the due card from the dashboard.
    await page.getByRole('button', { name: /Active recall · 1 due/ }).click();
    const review = modal(page);
    await expect(review.getByText('Card 1 of 1')).toBeVisible();
    await expect(review.getByText(RECALL_CARDS[2].front)).toBeVisible();
    await review.getByRole('button', { name: 'Show answer' }).click();
    await review.getByRole('button', { name: 'Easy' }).click();
    await expect(review.getByText('Recall session complete!')).toBeVisible();
    await expect(review).toContainText('1 card reviewed');
    await review.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^Active recall Practice recall/ })).toBeVisible();

    // A day later the remembered and missed cards are due again.
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 86_400_000));
    await page.reload();
    await expect(page.getByRole('button', { name: /Active recall · 2 due/ })).toBeVisible();
    await shot('dashboard-recall-due', { locator: page.getByRole('button', { name: /Active recall · 2 due/ }) });
  });

  test('paper test: tick 3 of 4 → not mastered → the miss comes back as spaced practice', async ({ page, api, gotoApp, shot }) => {
    await gotoApp({ seed: {}, hash: topicHash(ONE.id) });
    await section(page, 'Topic mastery test').getByRole('button', { name: 'Take topic mastery test' }).click();
    const m = modal(page);
    await m.getByRole('button', { name: /On paper \/ hands-on/ }).click();
    await expect(m).toContainText('Print the test (or observe hands-on tasks)');
    await m.getByRole('button', { name: 'Create the test' }).click();
    await expect(m.getByRole('button', { name: 'Print the test & answer key' })).toBeVisible();
    // The answer key is on screen for the parent.
    await expect(m.getByText('Correct: 5')).toBeVisible();
    const boxes = m.locator('#grade input[type="checkbox"]');
    await expect(boxes).toHaveCount(4);
    for (const i of [0, 1, 2]) await boxes.nth(i).check();
    await expect(m.locator('#live')).toHaveText('75%');
    await shot('paper-test-grading', { full: false });
    await m.getByRole('button', { name: 'Record result' }).click();
    await expect(m.getByText('Not quite mastered yet')).toBeVisible();
    await expect(m.getByText('75%', { exact: true })).toBeVisible();
    await m.getByRole('button', { name: 'Close' }).click();
    await expect(section(page, 'Topic mastery test')).toContainText('Last attempt: 75%.');
    const state = await api.waitForState((s) => Object.keys(s.practice?.[ROWAN] || {}).length === 1);
    expect(state.tests[ROWAN][0]).toMatchObject({ scope: 'topic', mode: 'physical', pct: 75, passed: false });
    expect(Object.values(state.practice[ROWAN])[0]).toMatchObject({ q: MASTERY_QUESTIONS[3].q, topicId: ONE.id });

    await nav(page, 'Dashboard').click();
    await page.getByRole('button', { name: /Spaced practice · 1 due/ }).click();
    const practice = modal(page);
    await expect(practice.getByRole('heading', { name: 'Missed questions, retried' })).toBeVisible();
    await expect(practice.getByText('Retry 1 of 1')).toBeVisible();
    await expect(practice.getByText(MASTERY_QUESTIONS[3].q)).toBeVisible();
    await practice.getByRole('button', { name: MASTERY_QUESTIONS[3].answerText, exact: true }).click();
    await practice.getByRole('button', { name: 'Check answer' }).click();
    await expect(practice.getByText('Correct!')).toBeVisible();
    await shot('spaced-practice-correct', { full: false });
    await practice.getByRole('button', { name: 'Continue' }).click();
    await expect(practice.getByText('Practice session complete!')).toBeVisible();
    await practice.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^Spaced practice Missed test questions/ })).toBeVisible();
  });

  test('section check unlocks once every topic in the section is mastered', async ({ page, api, gotoApp, mockAi, shot }) => {
    const progress = Object.fromEntries(COUNTING_SECTION_OTHERS.map((id) => [id, 'mastered']));
    await gotoApp({ seed: { progress }, hash: topicHash(ONE.id) });
    await expect(section(page, 'Section check')).toContainText('10/11 topics');
    await expect(section(page, 'Section check').getByRole('button', { name: 'Locked until topics mastered' })).toBeDisabled();

    // Master the last topic by hand.
    await setTopicStatus(page, 'Mastered');
    const check = section(page, 'Section check');
    await expect(check).toContainText('11/11 topics');
    await expect(check).toContainText('All topics mastered — take the section check');
    await shot('section-check-ready', { locator: check });

    await mockAi.clear();
    await check.getByRole('button', { name: 'Take section check' }).click();
    const m = modal(page);
    await expect(m.getByText('Section check · Mathematics')).toBeVisible();
    await expect(m).toContainText('11 of 11 topics in this section marked mastered.');
    await m.getByRole('button', { name: 'Create the test' }).click();
    await answerAll(m, MASTERY_QUESTIONS);
    await m.getByRole('button', { name: 'Submit & grade' }).click();
    await expect(m.getByText('Counting & Cardinality mastered!')).toBeVisible();
    expect(await mockAi.kinds()).toEqual(['mastery-test', 'verify']);
    const state = await api.waitForState((s) => s.tests?.[ROWAN]?.some((t) => t.scope === 'section'));
    expect(state.tests[ROWAN][0]).toMatchObject({ scope: 'section', sectionId: 'Mathematics|Counting & Cardinality|5', passed: true });
    await dismissCelebration(page);
    await page.keyboard.press('Escape');
    await expect(section(page, 'Section check')).toContainText('Section check passed with 100%.');
    await expect(section(page, 'Section check').getByRole('button', { name: 'Retake section check' })).toBeVisible();
  });
});
